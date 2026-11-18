import { NextResponse } from "next/server";
import {
  buildIndonesianReceiptSystemPrompt,
  GEMINI_RESPONSE_SCHEMA,
  RECEIPT_JSON_SCHEMA,
} from "@/lib/ocr-schema";
import {
  checkRateLimit,
  getClientIp,
  isValidSafeImageDataUrl,
  readBoundedJson,
  sanitizeMoneyAmount,
  sanitizePlainText,
  sanitizeQuantity,
  sanitizeSafeDate,
  verifySameOrigin,
} from "@/lib/security";
import type { ExtractionMode, OcrExtractedPayload, PaymentMethod } from "@/types/beresin";

interface OcrRequestBody {
  imageBase64?: string;
  mimeType?: string;
  fileName?: string;
  categories?: string[];
  extractionMode?: ExtractionMode;
}

interface GeminiPart {
  text?: string;
  thought?: boolean;
}

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

function stripDataUrlPrefix(input: string): string {
  const commaIdx = input.indexOf(",");
  return commaIdx >= 0 ? input.slice(commaIdx + 1) : input;
}

function cleanEnvSecret(raw: string | undefined): string {
  return (raw ?? "").replace(/^['"]+|['"]+$/g, "").trim();
}

function normalizePaymentMethod(raw: unknown): PaymentMethod {
  if (typeof raw !== "string") return "Tunai";
  const v = raw.trim().toLowerCase();
  if (
    v.includes("qris") ||
    v.includes("gopay") ||
    v.includes("dana") ||
    v.includes("ovo") ||
    v.includes("shopeepay") ||
    v.includes("linkaja") ||
    v === "qr"
  ) {
    return "QRIS";
  }
  if (
    v.includes("transfer") ||
    v.includes("tf") ||
    v.includes("bca") ||
    v.includes("mandiri") ||
    v.includes("livin") ||
    v.includes("bri") ||
    v.includes("bni") ||
    v.includes("seabank") ||
    v.includes("jago") ||
    v.includes("bsi") ||
    v.includes("va") ||
    v.includes("virtual")
  ) {
    return "Transfer";
  }
  if (
    v.includes("kartu") ||
    v.includes("debit") ||
    v.includes("kredit") ||
    v.includes("credit") ||
    v.includes("edc") ||
    v.includes("flazz") ||
    v.includes("e-money") ||
    v.includes("brizzi") ||
    v.includes("visa") ||
    v.includes("master")
  ) {
    return "Kartu";
  }
  if (v.includes("lain")) return "Lainnya";
  return "Tunai";
}

function parseFlexibleIndonesianDate(
  raw: unknown,
  currentYear: number
): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const direct = sanitizeSafeDate(trimmed);
  if (direct) return direct;

  // Convert DD/MM/YYYY, DD-MM-YYYY, DD.MM.YY into ISO YYYY-MM-DD.
  const dmyMatch = trimmed.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (dmyMatch) {
    const day = Number(dmyMatch[1]);
    const month = Number(dmyMatch[2]);
    let year = Number(dmyMatch[3]);
    if (year < 100) year += 2000;
    if (year < 1990 || year > 2100) year = currentYear;
    const candidate = `${String(year).padStart(4, "0")}-${String(month).padStart(
      2,
      "0"
    )}-${String(day).padStart(2, "0")}`;
    return sanitizeSafeDate(candidate);
  }

  return null;
}

function parseJsonObjectLenient(rawText: string): OcrExtractedPayload {
  const cleaned = rawText
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned) as OcrExtractedPayload;
  } catch {
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)) as OcrExtractedPayload;
    }
    throw new Error("Respons bukan objek JSON yang valid.");
  }
}

// Skips Gemini 2.5 internal reasoning parts (`thought: true`) so JSON.parse receives the structured answer.
function extractJsonTextFromGemini(geminiJson: unknown): string | null {
  const root = geminiJson as {
    candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
  };
  const parts = root?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts) || parts.length === 0) return null;

  const nonThoughtTexts = parts
    .filter((p) => !p?.thought && typeof p?.text === "string" && p.text.trim() !== "")
    .map((p) => p.text!.trim());

  if (nonThoughtTexts.length > 0) {
    return nonThoughtTexts[nonThoughtTexts.length - 1];
  }

  // Fallback if an older endpoint omits `thought` metadata and embeds JSON in the last part.
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const t = parts[i]?.text?.trim();
    if (t && t.includes("{")) return t;
  }
  return null;
}

function normalizeOcrOutput(
  raw: OcrExtractedPayload,
  allowedCategories: string[],
  currentYear: number
): OcrExtractedPayload {
  const fallbackCategory = allowedCategories[0] ?? "Lain-lain";
  const matchedCat =
    allowedCategories.find(
      (c) => c.toLowerCase() === String(raw.category ?? "").trim().toLowerCase()
    ) ?? fallbackCategory;

  const cleanedItems = (Array.isArray(raw.items) ? raw.items : [])
    .slice(0, 150)
    .map((it) => {
      const name = sanitizePlainText(it?.item_name, 160);
      const qty = sanitizeQuantity(it?.quantity ?? 1) || 1;
      let unit = sanitizeMoneyAmount(it?.unit_price);
      let total = sanitizeMoneyAmount(it?.total_price);

      if (total === 0 && unit > 0) {
        total = Math.round(unit * qty);
      } else if (unit === 0 && total > 0) {
        unit = Math.round(total / qty);
      }

      return {
        item_name: name || "Pembelian barang",
        quantity: qty,
        unit_price: unit,
        total_price: total,
      };
    })
    .filter((it) => it.item_name !== "" || it.total_price > 0);

  const itemsSum = cleanedItems.reduce((sum, it) => sum + it.total_price, 0);
  const tax = sanitizeMoneyAmount(raw.tax_and_service);
  const discount = sanitizeMoneyAmount(raw.discount);
  const subtotal = sanitizeMoneyAmount(raw.subtotal) || itemsSum;
  let totalAmount = sanitizeMoneyAmount(raw.total_amount);

  if (totalAmount === 0 && itemsSum > 0) {
    totalAmount = Math.max(0, itemsSum + tax - discount);
  }

  if (cleanedItems.length === 0 && totalAmount > 0) {
    cleanedItems.push({
      item_name: sanitizePlainText(raw.merchant_name, 120) || "Total belanja struk",
      quantity: 1,
      unit_price: totalAmount,
      total_price: totalAmount,
    });
  }

  return {
    merchant_name:
      sanitizePlainText(raw.merchant_name, 160) || "Toko / Penerima",
    transaction_date: parseFlexibleIndonesianDate(raw.transaction_date, currentYear),
    category: matchedCat,
    payment_method: normalizePaymentMethod(raw.payment_method),
    subtotal,
    tax_and_service: tax,
    discount,
    total_amount: totalAmount,
    confidence_score: Math.min(
      1,
      Math.max(0, Number(raw.confidence_score) || 0.85)
    ),
    warning_message: raw.warning_message
      ? sanitizePlainText(raw.warning_message, 300)
      : null,
    items: cleanedItems,
  };
}

function summarizeGoogleApiError(
  status: number,
  googleMessage: string
): string {
  const lower = googleMessage.toLowerCase();

  if (lower.includes("referer") || lower.includes("referrer")) {
    return "Kunci API dibatasi hanya untuk Website (HTTP Referrer). Di pengaturan API Key Google, ubah Application Restrictions menjadi None karena pemindaian dipanggil dari server.";
  }
  if (lower.includes("leaked") || lower.includes("compromised")) {
    return "Kunci API ini terdeteksi bocor oleh Google sehingga dinonaktifkan otomatis. Klik Delete key lalu Create API key baru di Google AI Studio dan tempel ke .env.local (jangan dibagikan ke tempat publik).";
  }
  if (lower.includes("quota") || status === 429) {
    return "Batas pemakaian gratis menit ini sedang penuh. Tunggu sekitar 30 detik lalu coba lagi.";
  }
  if (
    lower.includes("api_key_invalid") ||
    lower.includes("api key not valid") ||
    lower.includes("expired") ||
    status === 401
  ) {
    return "Kunci API Gemini tidak valid atau sudah dinonaktifkan. Buat kunci baru di Google AI Studio lalu perbarui GEMINI_API_KEY di .env.local dan restart server.";
  }

  const safeSnippet = sanitizePlainText(
    googleMessage.replace(/AQ\.[A-Za-z0-9_-]+|AIza[A-Za-z0-9_-]+/g, "[KEY]"),
    180
  );
  return safeSnippet
    ? `Kunci API ditolak Google (${status}): ${safeSnippet}`
    : `Layanan pembaca struk menolak permintaan (kode ${status}).`;
}

let cachedWorkingEndpointUrl: string | null = null;

async function discoverAvailableFlashEndpoint(apiKey: string): Promise<string | null> {
  try {
    const resp = await fetch("https://generativelanguage.googleapis.com/v1beta/models", {
      headers: { "x-goog-api-key": apiKey },
    });
    if (!resp.ok) return null;
    const json = (await resp.json()) as {
      models?: Array<{
        name?: string;
        supportedGenerationMethods?: string[];
      }>;
    };
    const candidates = (json.models ?? []).filter(
      (m) =>
        typeof m.name === "string" &&
        m.supportedGenerationMethods?.includes("generateContent") &&
        !m.name.includes("embedding") &&
        !m.name.includes("tts") &&
        !m.name.includes("imagen")
    );
    const preferred =
      candidates.find((m) => m.name?.includes("flash") && !m.name?.includes("2.5") && !m.name?.includes("2.0") && !m.name?.includes("1.5")) ??
      candidates.find((m) => m.name?.includes("flash")) ??
      candidates[0];

    if (!preferred?.name) return null;
    const cleanModelPath = preferred.name.startsWith("models/")
      ? preferred.name
      : `models/${preferred.name}`;
    return `https://generativelanguage.googleapis.com/v1beta/${cleanModelPath}:generateContent`;
  } catch {
    return null;
  }
}

// Calls current Gemini Flash models (`gemini-3.8-flash` / `gemini-flash-latest`) with automatic model discovery and caching.
async function callGeminiVisionWithFallback(
  apiKey: string,
  promptText: string,
  mimeType: string,
  base64Clean: string
): Promise<{ ok: true; rawJsonText: string } | { ok: false; status: number; detail: string }> {
  const candidateUrls: string[] = [
    ...(cachedWorkingEndpointUrl ? [cachedWorkingEndpointUrl] : []),
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent",
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.0-flash:generateContent",
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
  ];

  // Deduplicate while preserving priority order.
  const uniqueUrls = Array.from(new Set(candidateUrls));

  const userContents = [
    {
      role: "user",
      parts: [
        {
          inlineData: {
            mimeType,
            data: base64Clean,
          },
        },
        {
          text: promptText,
        },
      ],
    },
  ];

  const payloadWithSchema = JSON.stringify({
    contents: userContents,
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
      responseSchema: GEMINI_RESPONSE_SCHEMA,
    },
  });

  const payloadPlainJson = JSON.stringify({
    contents: userContents,
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
    },
  });

  // Pass strictly one credential header (`x-goog-api-key`) without `?key=` query param to avoid 401 credential conflict.
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-goog-api-key": apiKey,
  };

  let lastStatus = 502;
  let lastDetail = "Layanan pembaca struk belum merespons.";

  let suggestedModelUrl: string | null = null;

  async function tryEndpoint(url: string): Promise<string | null> {
    let resp = await fetch(url, {
      method: "POST",
      headers,
      body: payloadWithSchema,
    });

    if (resp.status === 400) {
      resp = await fetch(url, {
        method: "POST",
        headers,
        body: payloadPlainJson,
      });
    }

    if (resp.ok) {
      const json = await resp.json();
      const extractedText = extractJsonTextFromGemini(json);
      if (extractedText) {
        cachedWorkingEndpointUrl = url;
        return extractedText;
      }
      lastDetail = "Jawaban pembaca foto kosong.";
      return null;
    }

    lastStatus = resp.status;
    const errJson = (await resp.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    const googleMsg = errJson?.error?.message ?? "";
    const matchSuggested = googleMsg.match(/use\s+(models\/[a-zA-Z0-9._-]+)/i);
    if (matchSuggested?.[1]) {
      suggestedModelUrl = `https://generativelanguage.googleapis.com/v1beta/${matchSuggested[1]}:generateContent`;
    }
    lastDetail = summarizeGoogleApiError(resp.status, googleMsg);
    return null;
  }

  for (const url of uniqueUrls) {
    const text = await tryEndpoint(url);
    if (text) {
      return { ok: true, rawJsonText: text };
    }
    if (lastStatus === 401 || lastStatus === 403 || lastStatus === 429) {
      return { ok: false, status: lastStatus, detail: lastDetail };
    }
    if (suggestedModelUrl && !uniqueUrls.includes(suggestedModelUrl)) {
      const retrySuggested = await tryEndpoint(suggestedModelUrl);
      if (retrySuggested) {
        return { ok: true, rawJsonText: retrySuggested };
      }
    }
  }

  // If every static model alias returned 404, query `/v1beta/models` dynamically for this API key's active Flash model.
  if (lastStatus === 404) {
    const discoveredUrl = await discoverAvailableFlashEndpoint(apiKey);
    if (discoveredUrl && !uniqueUrls.includes(discoveredUrl)) {
      const text = await tryEndpoint(discoveredUrl);
      if (text) {
        return { ok: true, rawJsonText: text };
      }
    }
  }

  return { ok: false, status: lastStatus, detail: lastDetail };
}

export async function POST(request: Request) {
  if (!verifySameOrigin(request)) {
    return NextResponse.json({ error: "Asal permintaan ditolak." }, { status: 403 });
  }

  const ip = getClientIp(request);
  if (!checkRateLimit(`ocr-post:${ip}`, 45, 60_000)) {
    return NextResponse.json(
      { error: "Terlalu banyak pemindaian beruntun. Tunggu sebentar lalu coba lagi." },
      { status: 429 }
    );
  }

  const parsedReq = await readBoundedJson<OcrRequestBody>(request, 4_200_000);
  if (!parsedReq.ok) {
    return NextResponse.json(
      { error: parsedReq.error },
      { status: parsedReq.status }
    );
  }

  try {
    const body = parsedReq.data;
    const rawImage = body.imageBase64 ?? "";
    if (!isValidSafeImageDataUrl(rawImage, 3_900_000)) {
      return NextResponse.json(
        { error: "Data foto struk tidak valid atau ukurannya melebihi batas." },
        { status: 400 }
      );
    }

    const requestedMime = sanitizePlainText(
      body.mimeType ?? "image/jpeg",
      32
    ).toLowerCase();
    const mimeType = ALLOWED_MIME.has(requestedMime) ? requestedMime : "image/jpeg";

    const categories =
      Array.isArray(body.categories) && body.categories.length > 0
        ? body.categories
            .map((c) => sanitizePlainText(c, 50))
            .filter(Boolean)
            .slice(0, 20)
        : ["Konsumsi", "Perlengkapan", "Transportasi", "Acara", "Lain-lain"];

    const extractionMode: ExtractionMode =
      body.extractionMode === "summary" ? "summary" : "detailed";

    const rawHeaderKey = request.headers.get("x-gemini-api-key")?.trim() || "";
    const validHeaderKey = /^[A-Za-z0-9._-]{20,160}$/.test(rawHeaderKey)
      ? rawHeaderKey
      : "";
    const geminiKey = cleanEnvSecret(process.env.GEMINI_API_KEY) || validHeaderKey;
    const openaiKey = cleanEnvSecret(process.env.OPENAI_API_KEY);

    const currentYear = new Date().getFullYear();
    const fullPrompt = buildIndonesianReceiptSystemPrompt(
      categories,
      extractionMode,
      currentYear
    );
    const base64Clean = stripDataUrlPrefix(rawImage);

    if (geminiKey) {
      const result = await callGeminiVisionWithFallback(
        geminiKey,
        fullPrompt,
        mimeType,
        base64Clean
      );

      if (!result.ok) {
        return NextResponse.json(
          { error: result.detail, aiUsed: false },
          { status: 502 }
        );
      }

      const parsedRaw = parseJsonObjectLenient(result.rawJsonText);
      const normalized = normalizeOcrOutput(parsedRaw, categories, currentYear);

      return NextResponse.json({
        aiUsed: true,
        provider: "gemini",
        data: normalized,
      });
    }

    if (openaiKey) {
      const openaiResp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0.1,
          messages: [
            { role: "system", content: fullPrompt },
            {
              role: "user",
              content: [
                {
                  type: "image_url",
                  image_url: {
                    url: `data:${mimeType};base64,${base64Clean}`,
                  },
                },
              ],
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "indonesian_receipt_extraction",
              strict: false,
              schema: RECEIPT_JSON_SCHEMA,
            },
          },
        }),
      });

      if (!openaiResp.ok) {
        return NextResponse.json(
          { error: "Layanan pembaca otomatis sedang tidak dapat dihubungi." },
          { status: 502 }
        );
      }

      const openaiJson = await openaiResp.json();
      const content: string | undefined =
        openaiJson?.choices?.[0]?.message?.content;

      if (!content) {
        return NextResponse.json(
          { error: "Jawaban pembaca foto kosong." },
          { status: 502 }
        );
      }

      const parsedRaw = parseJsonObjectLenient(content);
      const normalized = normalizeOcrOutput(parsedRaw, categories, currentYear);
      return NextResponse.json({
        aiUsed: true,
        provider: "gpt-4o-mini",
        data: normalized,
      });
    }

    return NextResponse.json(
      {
        aiUsed: false,
        missingKey: true,
        error:
          "GEMINI_API_KEY belum terpasang di Environment Variables server (Vercel). Pasang GEMINI_API_KEY di pengaturan proyek lalu Redeploy agar foto struk langsung dianalisis otomatis.",
      },
      { status: 503 }
    );
  } catch {
    return NextResponse.json(
      { error: "Gagal membaca isi foto struk. Coba tekan Baca Ulang Struk." },
      { status: 500 }
    );
  }
}
