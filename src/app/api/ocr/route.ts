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
  currentYear: number,
  extractionMode: ExtractionMode
): OcrExtractedPayload {
  const fallbackCategory = allowedCategories[0] ?? "Lain-lain";
  const matchedCat =
    allowedCategories.find(
      (c) => c.toLowerCase() === String(raw.category ?? "").trim().toLowerCase()
    ) ?? fallbackCategory;

  let cleanedItems = (Array.isArray(raw.items) ? raw.items : [])
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

  let tax = sanitizeMoneyAmount(raw.tax_and_service);
  const discount = sanitizeMoneyAmount(raw.discount);
  let totalAmount = sanitizeMoneyAmount(raw.total_amount);

  let itemsSum = cleanedItems.reduce((sum, it) => sum + it.total_price, 0);
  if (totalAmount === 0 && itemsSum > 0) {
    totalAmount = Math.max(0, itemsSum + tax - discount);
  }

  // Prevent double-counting tax when retail item prices already include PPN ("PPN Termasuk").
  if (totalAmount > 0 && itemsSum === totalAmount && tax > 0 && discount === 0) {
    tax = 0;
  }

  // In summary mode, enforce a single clean summary item whose math reconciles with totalAmount.
  if (extractionMode === "summary" && totalAmount > 0) {
    const netSubtotal = Math.max(0, totalAmount - tax + discount);
    const summaryLabel =
      cleanedItems[0]?.item_name ||
      sanitizePlainText(raw.merchant_name, 120) ||
      "Total belanja struk";
    cleanedItems = [
      {
        item_name: summaryLabel,
        quantity: 1,
        unit_price: netSubtotal,
        total_price: netSubtotal,
      },
    ];
    itemsSum = netSubtotal;
  } else if (cleanedItems.length === 0 && totalAmount > 0) {
    const netSubtotal = Math.max(0, totalAmount - tax + discount);
    cleanedItems.push({
      item_name:
        sanitizePlainText(raw.merchant_name, 120) || "Total belanja struk",
      quantity: 1,
      unit_price: netSubtotal,
      total_price: netSubtotal,
    });
    itemsSum = netSubtotal;
  }

  const subtotal = itemsSum || sanitizeMoneyAmount(raw.subtotal);

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

function isDailyQuotaExhausted(googleMessage: string): boolean {
  const lower = googleMessage.toLowerCase();
  return (
    lower.includes("perday") ||
    lower.includes("per_day") ||
    lower.includes("per day") ||
    lower.includes("daily")
  );
}

function summarizeGoogleApiError(
  status: number,
  googleMessage: string
): string {
  const lower = googleMessage.toLowerCase();

  if (lower.includes("referer") || lower.includes("referrer")) {
    return "Pembaca struk otomatis diblokir pengaturan domain kunci server (HTTP Referrer). Silakan isi data struk secara manual sementara waktu.";
  }
  if (lower.includes("leaked") || lower.includes("compromised")) {
    return "Kunci akses pembaca otomatis sedang dinonaktifkan oleh penyedia layanan dan perlu diperbarui pengelola web. Silakan isi angka struk secara manual.";
  }
  if (
    status === 429 ||
    lower.includes("quota") ||
    lower.includes("resource_exhausted") ||
    lower.includes("rate")
  ) {
    if (isDailyQuotaExhausted(googleMessage)) {
      return "Kuota pembaca struk otomatis hari ini sudah penuh. Foto struk Anda tetap tersimpan di daftar: silakan isi nama toko dan nominalnya secara manual agar laporan LPJ tetap bisa langsung diunduh.";
    }
    return "Antrean pembaca struk otomatis sedang padat karena banyak foto diproses berdekatan. Foto Anda tetap tersimpan: tunggu sebentar lalu tekan Baca Ulang, atau isi angkanya secara langsung.";
  }
  if (
    lower.includes("api_key_invalid") ||
    lower.includes("api key not valid") ||
    lower.includes("expired") ||
    status === 401
  ) {
    return "Layanan pembaca struk otomatis belum aktif pada server ini. Foto struk tetap tersimpan, silakan isi angkanya secara manual.";
  }

  return "Foto struk belum berhasil dibaca otomatis saat ini. Foto tetap tersimpan di daftar: silakan tekan Baca Ulang atau isi angkanya secara manual.";
}

type PayloadTier = "low_thinking" | "schema" | "plain";

let cachedWorkingEndpoint: { url: string; tier: PayloadTier } | null = null;
let cachedDiscoveredUrls: { urls: string[]; expiresAt: number } | null = null;

async function discoverAvailableFlashEndpoints(apiKey: string): Promise<string[]> {
  if (cachedDiscoveredUrls && Date.now() < cachedDiscoveredUrls.expiresAt) {
    return cachedDiscoveredUrls.urls;
  }

  try {
    const resp = await fetch("https://generativelanguage.googleapis.com/v1beta/models", {
      headers: { "x-goog-api-key": apiKey },
    });
    if (!resp.ok) return [];
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
        m.name.includes("flash") &&
        !m.name.includes("embedding") &&
        !m.name.includes("tts") &&
        !m.name.includes("imagen") &&
        !m.name.includes("audio")
    );

    // Order modern Flash-Lite and 3.x Flash models ahead of legacy aliases so quota failover stays fast.
    candidates.sort((a, b) => {
      const na = a.name ?? "";
      const nb = b.name ?? "";
      const score = (n: string) =>
        (n.includes("lite") ? 4 : 0) +
        (!n.includes("2.5") && !n.includes("2.0") && !n.includes("1.5") ? 2 : 0);
      return score(nb) - score(na);
    });

    const urls = candidates.map((m) => {
      const cleanModelPath = m.name!.startsWith("models/")
        ? m.name!
        : `models/${m.name!}`;
      return `https://generativelanguage.googleapis.com/v1beta/${cleanModelPath}:generateContent`;
    });

    cachedDiscoveredUrls = {
      urls,
      expiresAt: Date.now() + 10 * 60_000,
    };
    return urls;
  } catch {
    return [];
  }
}

// Calls Gemini Flash with `thinkingLevel: "LOW"` and fails over across separate Flash / Flash-Lite quota pools on 429/404.
async function callGeminiVisionWithFallback(
  apiKey: string,
  promptText: string,
  mimeType: string,
  base64Clean: string
): Promise<
  | { ok: true; rawJsonText: string }
  | { ok: false; status: number; detail: string; dailyExhausted: boolean }
> {
  const candidateUrls: string[] = [
    ...(cachedWorkingEndpoint ? [cachedWorkingEndpoint.url] : []),
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent",
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent",
  ];

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

  // `thinkingLevel: "LOW"` is the lowest supported reasoning tier on Gemini 3.8 Flash (MINIMAL returns 400).
  const payloadsByTier: Record<PayloadTier, string> = {
    low_thinking: JSON.stringify({
      contents: userContents,
      generationConfig: {
        temperature: 0,
        thinkingConfig: {
          thinkingLevel: "LOW",
        },
        responseMimeType: "application/json",
        responseSchema: GEMINI_RESPONSE_SCHEMA,
      },
    }),
    schema: JSON.stringify({
      contents: userContents,
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: GEMINI_RESPONSE_SCHEMA,
      },
    }),
    plain: JSON.stringify({
      contents: userContents,
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
      },
    }),
  };

  // Send only `x-goog-api-key` without `?key=` query param to prevent 401 duplicate-credential rejection on AQ.* keys.
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-goog-api-key": apiKey,
  };

  let lastStatus = 502;
  let lastDetail =
    "Foto struk belum berhasil dibaca otomatis saat ini. Foto tetap tersimpan: silakan tekan Baca Ulang atau isi angkanya secara manual.";
  let sawDailyExhausted = false;
  let suggestedModelUrl: string | null = null;

  async function tryEndpoint(url: string): Promise<string | null> {
    const tierOrder: PayloadTier[] =
      cachedWorkingEndpoint?.url === url
        ? [
            cachedWorkingEndpoint.tier,
            ...(["low_thinking", "schema", "plain"] as PayloadTier[]).filter(
              (t) => t !== cachedWorkingEndpoint!.tier
            ),
          ]
        : ["low_thinking", "schema", "plain"];

    let resp: Response | null = null;
    let usedTier: PayloadTier = tierOrder[0];

    for (const tier of tierOrder) {
      usedTier = tier;
      resp = await fetch(url, {
        method: "POST",
        headers,
        body: payloadsByTier[tier],
      });
      if (resp.status !== 400) break;
    }

    if (!resp) return null;

    if (resp.ok) {
      const json = await resp.json();
      const extractedText = extractJsonTextFromGemini(json);
      if (extractedText) {
        cachedWorkingEndpoint = { url, tier: usedTier };
        return extractedText;
      }
      return null;
    }

    lastStatus = resp.status;
    if (resp.status === 429 && cachedWorkingEndpoint?.url === url) {
      cachedWorkingEndpoint = null;
    }

    const errJson = (await resp.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    const googleMsg = errJson?.error?.message ?? "";
    if (resp.status === 429 && isDailyQuotaExhausted(googleMsg)) {
      sawDailyExhausted = true;
    }
    const matchSuggested = googleMsg.match(/use\s+(models\/[a-zA-Z0-9._-]+)/i);
    if (matchSuggested?.[1]) {
      suggestedModelUrl = `https://generativelanguage.googleapis.com/v1beta/${matchSuggested[1]}:generateContent`;
    }
    lastDetail = summarizeGoogleApiError(resp.status, googleMsg);
    return null;
  }

  const triedUrls = new Set<string>();

  for (const url of uniqueUrls) {
    triedUrls.add(url);
    const text = await tryEndpoint(url);
    if (text) {
      return { ok: true, rawJsonText: text };
    }
    if (lastStatus === 401 || lastStatus === 403) {
      return {
        ok: false,
        status: lastStatus,
        detail: lastDetail,
        dailyExhausted: false,
      };
    }
    if (suggestedModelUrl && !triedUrls.has(suggestedModelUrl)) {
      triedUrls.add(suggestedModelUrl);
      const retrySuggested = await tryEndpoint(suggestedModelUrl);
      if (retrySuggested) {
        return { ok: true, rawJsonText: retrySuggested };
      }
    }
  }

  // On 404 or 429, try any remaining Flash / Flash-Lite models available on this project's independent quota buckets.
  const statusSnapshot = (): number => lastStatus;
  if (statusSnapshot() === 404 || statusSnapshot() === 429) {
    const discoveredUrls = await discoverAvailableFlashEndpoints(apiKey);
    for (const url of discoveredUrls) {
      if (triedUrls.has(url)) continue;
      triedUrls.add(url);
      const text = await tryEndpoint(url);
      if (text) {
        return { ok: true, rawJsonText: text };
      }
      if (statusSnapshot() === 401 || statusSnapshot() === 403) break;
    }
  }

  return {
    ok: false,
    status: lastStatus,
    detail: lastDetail,
    dailyExhausted: sawDailyExhausted,
  };
}

export async function POST(request: Request) {
  if (!verifySameOrigin(request)) {
    return NextResponse.json({ error: "Asal permintaan ditolak." }, { status: 403 });
  }

  const ip = getClientIp(request);
  if (!checkRateLimit(`ocr-post:${ip}`, 120, 60_000)) {
    return NextResponse.json(
      {
        error:
          "Antrean pembaca struk otomatis sedang padat. Tunggu beberapa detik lalu tekan Baca Ulang.",
        rateLimited: true,
        dailyExhausted: false,
      },
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
          {
            error: result.detail,
            aiUsed: false,
            rateLimited: result.status === 429,
            dailyExhausted: result.dailyExhausted,
          },
          { status: result.status === 429 ? 429 : 502 }
        );
      }

      const parsedRaw = parseJsonObjectLenient(result.rawJsonText);
      const normalized = normalizeOcrOutput(
        parsedRaw,
        categories,
        currentYear,
        extractionMode
      );

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
      const normalized = normalizeOcrOutput(
        parsedRaw,
        categories,
        currentYear,
        extractionMode
      );
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
          "Pembaca struk otomatis belum diaktifkan pada server ini. Foto Anda tetap tersimpan: silakan isi nama toko dan nominalnya secara manual.",
      },
      { status: 503 }
    );
  } catch {
    return NextResponse.json(
      {
        error:
          "Foto struk belum berhasil dibaca otomatis. Foto tetap tersimpan: silakan tekan Baca Ulang atau isi angkanya secara manual.",
      },
      { status: 500 }
    );
  }
}
