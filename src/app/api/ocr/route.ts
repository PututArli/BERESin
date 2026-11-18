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
import { todayIsoDate } from "@/lib/format";

interface OcrRequestBody {
  imageBase64?: string;
  mimeType?: string;
  fileName?: string;
  categories?: string[];
  extractionMode?: ExtractionMode;
}

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_PAYMENT = new Set<PaymentMethod>([
  "Tunai",
  "QRIS",
  "Transfer",
  "Kartu",
  "Lainnya",
]);

function stripDataUrlPrefix(input: string): string {
  const commaIdx = input.indexOf(",");
  return commaIdx >= 0 ? input.slice(commaIdx + 1) : input;
}

function cleanEnvSecret(raw: string | undefined): string {
  return (raw ?? "").replace(/^['"]+|['"]+$/g, "").trim();
}

function inferMerchantFromFilename(fileName: string): string {
  const safeName = sanitizePlainText(fileName, 120);
  const withoutExt = safeName.replace(/\.[^.]+$/, "");
  const cleaned = withoutExt
    .replace(/[_-]+/g, " ")
    .replace(/\b(whatsapp|image|img|dsc|foto|nota|struk|\d{6,})\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length >= 3 ? cleaned.slice(0, 80) : "Nota Baru (Klik Cek untuk Isi)";
}

function normalizeOcrOutput(
  raw: OcrExtractedPayload,
  fallbackCategory: string
): OcrExtractedPayload {
  const payment =
    raw.payment_method && ALLOWED_PAYMENT.has(raw.payment_method)
      ? raw.payment_method
      : "Tunai";

  return {
    merchant_name: sanitizePlainText(raw.merchant_name, 160) || "Nota Belanja",
    transaction_date: sanitizeSafeDate(raw.transaction_date),
    category: sanitizePlainText(raw.category, 50) || fallbackCategory,
    payment_method: payment,
    subtotal: sanitizeMoneyAmount(raw.subtotal),
    tax_and_service: sanitizeMoneyAmount(raw.tax_and_service),
    discount: sanitizeMoneyAmount(raw.discount),
    total_amount: sanitizeMoneyAmount(raw.total_amount),
    confidence_score: Math.min(1, Math.max(0, Number(raw.confidence_score) || 0.7)),
    warning_message: raw.warning_message
      ? sanitizePlainText(raw.warning_message, 300)
      : null,
    items: (Array.isArray(raw.items) ? raw.items : []).slice(0, 150).map((it) => ({
      item_name: sanitizePlainText(it?.item_name, 160) || "Barang",
      quantity: sanitizeQuantity(it?.quantity ?? 1),
      unit_price: sanitizeMoneyAmount(it?.unit_price),
      total_price: sanitizeMoneyAmount(it?.total_price),
    })),
  };
}

// Routes AQ.* keys to Vertex AI Express Mode and AIza* keys to Gemini Developer API.
async function callGeminiVisionEndpoint(
  apiKey: string,
  requestPayload: unknown
): Promise<Response> {
  const isVertexExpressKey = apiKey.startsWith("AQ.");
  const primaryUrl = isVertexExpressKey
    ? "https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-2.5-flash:generateContent"
    : "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

  const fallbackUrl = isVertexExpressKey
    ? "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"
    : "https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-2.5-flash:generateContent";

  const serialized = JSON.stringify(requestPayload);
  const headers = {
    "Content-Type": "application/json",
    "x-goog-api-key": apiKey,
  };

  const primaryResp = await fetch(primaryUrl, {
    method: "POST",
    headers,
    body: serialized,
  });

  if (primaryResp.ok) return primaryResp;

  if (primaryResp.status === 400 || primaryResp.status === 401 || primaryResp.status === 403 || primaryResp.status === 404) {
    return fetch(fallbackUrl, {
      method: "POST",
      headers,
      body: serialized,
    });
  }

  return primaryResp;
}

export async function POST(request: Request) {
  if (!verifySameOrigin(request)) {
    return NextResponse.json({ error: "Asal permintaan ditolak." }, { status: 403 });
  }

  const ip = getClientIp(request);
  if (!checkRateLimit(`ocr-post:${ip}`, 30, 60_000)) {
    return NextResponse.json(
      { error: "Batas kecepatan pemindaian tercapai. Tunggu sebentar lalu coba lagi." },
      { status: 429 }
    );
  }

  const parsedReq = await readBoundedJson<OcrRequestBody>(request, 3_600_000);
  if (!parsedReq.ok) {
    return NextResponse.json(
      { error: parsedReq.error },
      { status: parsedReq.status }
    );
  }

  try {
    const body = parsedReq.data;
    const rawImage = body.imageBase64 ?? "";
    if (!isValidSafeImageDataUrl(rawImage)) {
      return NextResponse.json(
        { error: "Data gambar nota tidak valid atau format tidak didukung." },
        { status: 400 }
      );
    }

    const requestedMime = sanitizePlainText(body.mimeType ?? "image/jpeg", 32).toLowerCase();
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
    const systemPrompt = buildIndonesianReceiptSystemPrompt(
      categories,
      extractionMode,
      currentYear
    );
    const base64Clean = stripDataUrlPrefix(rawImage);

    if (geminiKey) {
      const geminiPayload = {
        systemInstruction: {
          parts: [{ text: systemPrompt }],
        },
        contents: [
          {
            role: "user",
            parts: [
              {
                text: "Ekstrak seluruh informasi nota ini sesuai skema JSON yang diminta.",
              },
              {
                inlineData: {
                  mimeType,
                  data: base64Clean,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
          responseSchema: GEMINI_RESPONSE_SCHEMA,
        },
      };

      const geminiResp = await callGeminiVisionEndpoint(geminiKey, geminiPayload);

      if (!geminiResp.ok) {
        return NextResponse.json(
          { error: "Layanan pembaca AI sedang sibuk atau kunci API tidak sesuai." },
          { status: 502 }
        );
      }

      const geminiJson = await geminiResp.json();
      const rawText: string | undefined =
        geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!rawText) {
        return NextResponse.json(
          { error: "Respons AI Vision kosong sehingga tidak dapat dibaca." },
          { status: 502 }
        );
      }

      const parsed = normalizeOcrOutput(
        JSON.parse(rawText) as OcrExtractedPayload,
        categories[0] ?? "Lain-lain"
      );
      return NextResponse.json({
        aiUsed: true,
        provider: "gemini-2.5-flash",
        data: parsed,
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
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Ekstrak seluruh informasi nota ini sesuai skema JSON yang diminta.",
                },
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
          { error: "Layanan pembaca AI sedang tidak dapat dihubungi." },
          { status: 502 }
        );
      }

      const openaiJson = await openaiResp.json();
      const content: string | undefined =
        openaiJson?.choices?.[0]?.message?.content;

      if (!content) {
        return NextResponse.json(
          { error: "Respons pembaca AI kosong." },
          { status: 502 }
        );
      }

      const parsed = normalizeOcrOutput(
        JSON.parse(content) as OcrExtractedPayload,
        categories[0] ?? "Lain-lain"
      );
      return NextResponse.json({
        aiUsed: true,
        provider: "gpt-4o-mini",
        data: parsed,
      });
    }

    // Without an API key, store the compressed image so the user can fill or export immediately.
    const fallbackPayload: OcrExtractedPayload = {
      merchant_name: inferMerchantFromFilename(body.fileName ?? ""),
      transaction_date: todayIsoDate(),
      category: categories[0] ?? "Lain-lain",
      payment_method: "Tunai",
      subtotal: 0,
      tax_and_service: 0,
      discount: 0,
      total_amount: 0,
      confidence_score: 0.5,
      warning_message:
        "Pembaca otomatis belum aktif di server. Klik Cek / Edit untuk mengisi nominal sesuai foto struk.",
      items: [
        {
          item_name: "Belanja sesuai foto struk",
          quantity: 1,
          unit_price: 0,
          total_price: 0,
        },
      ],
    };

    return NextResponse.json({
      aiUsed: false,
      provider: "manual-local",
      data: fallbackPayload,
    });
  } catch {
    return NextResponse.json(
      { error: "Gagal memproses gambar nota." },
      { status: 500 }
    );
  }
}
