import { NextResponse } from "next/server";
import {
  buildIndonesianReceiptSystemPrompt,
  GEMINI_RESPONSE_SCHEMA,
  RECEIPT_JSON_SCHEMA,
} from "@/lib/ocr-schema";
import type { ExtractionMode, OcrExtractedPayload } from "@/types/beresin";
import { todayIsoDate } from "@/lib/format";

interface OcrRequestBody {
  imageBase64?: string;
  mimeType?: string;
  fileName?: string;
  categories?: string[];
  extractionMode?: ExtractionMode;
}

function stripDataUrlPrefix(input: string): string {
  const commaIdx = input.indexOf(",");
  return commaIdx >= 0 ? input.slice(commaIdx + 1) : input;
}

function inferMerchantFromFilename(fileName: string): string {
  const withoutExt = fileName.replace(/\.[^.]+$/, "");
  const cleaned = withoutExt
    .replace(/[_-]+/g, " ")
    .replace(/\b(whatsapp|image|img|dsc|foto|nota|struk|\d{6,})\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length >= 3 ? cleaned : "Nota Baru (Klik Cek untuk Isi)";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as OcrRequestBody;
    const rawImage = body.imageBase64 ?? "";
    if (!rawImage) {
      return NextResponse.json(
        { error: "Data gambar nota tidak ditemukan." },
        { status: 400 }
      );
    }

    const mimeType = body.mimeType || "image/jpeg";
    const categories =
      Array.isArray(body.categories) && body.categories.length > 0
        ? body.categories
        : ["Konsumsi", "Perlengkapan", "Transportasi", "Acara", "Lain-lain"];
    const extractionMode: ExtractionMode =
      body.extractionMode === "summary" ? "summary" : "detailed";

    const headerGeminiKey = request.headers.get("x-gemini-api-key")?.trim() || "";
    const geminiKey = process.env.GEMINI_API_KEY?.trim() || headerGeminiKey;
    const openaiKey = process.env.OPENAI_API_KEY?.trim() || "";

    const currentYear = new Date().getFullYear();
    const systemPrompt = buildIndonesianReceiptSystemPrompt(
      categories,
      extractionMode,
      currentYear
    );
    const base64Clean = stripDataUrlPrefix(rawImage);

    if (geminiKey) {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(
        geminiKey
      )}`;

      const geminiResp = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
        }),
      });

      if (!geminiResp.ok) {
        return NextResponse.json(
          {
            error: `Layanan Gemini Vision mengembalikan kode ${geminiResp.status}.`,
          },
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

      const parsed = JSON.parse(rawText) as OcrExtractedPayload;
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
          {
            error: `Layanan OpenAI Vision mengembalikan kode ${openaiResp.status}.`,
          },
          { status: 502 }
        );
      }

      const openaiJson = await openaiResp.json();
      const content: string | undefined =
        openaiJson?.choices?.[0]?.message?.content;

      if (!content) {
        return NextResponse.json(
          { error: "Respons OpenAI Vision kosong." },
          { status: 502 }
        );
      }

      const parsed = JSON.parse(content) as OcrExtractedPayload;
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
        "Kunci AI belum diisi. Klik Cek / Edit untuk melengkapi nominal, atau tempel kunci Gemini gratis di tombol Kunci AI pada bagian atas.",
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
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Gagal memproses gambar nota.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
