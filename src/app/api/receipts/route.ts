import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import {
  checkRateLimit,
  getClientIp,
  isValidSafeImageDataUrl,
  isValidUuid,
  isValidWorkspaceId,
  readBoundedJson,
  sanitizeMoneyAmount,
  sanitizePlainText,
  sanitizeQuantity,
  sanitizeSafeDate,
  verifySameOrigin,
} from "@/lib/security";
import type { PaymentMethod, Receipt, ReceiptStatus } from "@/types/beresin";

const ALLOWED_STATUS = new Set<ReceiptStatus>([
  "processing",
  "needs_review",
  "verified",
  "failed",
]);

const ALLOWED_PAYMENT = new Set<PaymentMethod>([
  "Tunai",
  "QRIS",
  "Transfer",
  "Kartu",
  "Lainnya",
]);

export async function POST(request: Request) {
  if (!verifySameOrigin(request)) {
    return NextResponse.json({ error: "Asal permintaan ditolak." }, { status: 403 });
  }

  const ip = getClientIp(request);
  if (!checkRateLimit(`receipts-post:${ip}`, 80, 60_000)) {
    return NextResponse.json(
      { error: "Terlalu banyak permintaan. Coba lagi sebentar." },
      { status: 429 }
    );
  }

  const sql = getSql();
  if (!sql) {
    return NextResponse.json({ cloudEnabled: false }, { status: 200 });
  }

  const parsed = await readBoundedJson<{
    workspaceId?: string;
    receipt?: Receipt;
  }>(request, 3_600_000);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  const rawWsId = parsed.data.workspaceId ?? parsed.data.receipt?.projectId;
  const r = parsed.data.receipt;

  if (!isValidWorkspaceId(rawWsId) || !r || !isValidUuid(r.id)) {
    return NextResponse.json(
      { error: "Identitas nota atau ruang kerja tidak valid." },
      { status: 400 }
    );
  }

  if (!isValidSafeImageDataUrl(r.imageUrl)) {
    return NextResponse.json(
      { error: "Format gambar nota tidak diizinkan." },
      { status: 400 }
    );
  }

  const workspaceId = rawWsId.trim();
  const receiptId = r.id.trim();
  const refNumber = sanitizePlainText(r.referenceNumber, 24) || "NOTA-001";
  const imageHash = sanitizePlainText(r.imageHash, 128) || null;
  const extractionMode = r.extractionMode === "summary" ? "summary" : "detailed";
  const merchantName = sanitizePlainText(r.merchantName, 160) || "Nota Baru";
  const transactionDate = sanitizeSafeDate(r.transactionDate);
  const category = sanitizePlainText(r.category, 50) || "Lain-lain";
  const subtotal = sanitizeMoneyAmount(r.subtotal);
  const taxAndService = sanitizeMoneyAmount(r.taxAndService);
  const discount = sanitizeMoneyAmount(r.discount);
  const totalAmount = sanitizeMoneyAmount(r.totalAmount);
  const paymentMethod: PaymentMethod = ALLOWED_PAYMENT.has(r.paymentMethod)
    ? r.paymentMethod
    : "Tunai";
  const confidenceScore = Math.min(
    1,
    Math.max(0, Number(r.confidenceScore) || 0.5)
  );
  const warningMessage = r.warningMessage
    ? sanitizePlainText(r.warningMessage, 300)
    : null;
  const isDuplicate = Boolean(r.isDuplicate);
  const duplicateOfRef = r.duplicateOfRef
    ? sanitizePlainText(r.duplicateOfRef, 24)
    : null;
  const status: ReceiptStatus = ALLOWED_STATUS.has(r.status)
    ? r.status
    : "needs_review";
  const notes = sanitizePlainText(r.notes, 500);

  const safeItems = (Array.isArray(r.items) ? r.items : [])
    .slice(0, 150)
    .map((item) => ({
      id: isValidUuid(item?.id) ? item.id.trim() : crypto.randomUUID(),
      receiptId,
      itemName: sanitizePlainText(item?.itemName, 160) || "Barang",
      quantity: sanitizeQuantity(item?.quantity ?? 1),
      unitPrice: sanitizeMoneyAmount(item?.unitPrice),
      totalPrice: sanitizeMoneyAmount(item?.totalPrice),
    }));

  try {
    await sql`
      INSERT INTO workspaces (id, report_title)
      VALUES (${workspaceId}, 'Laporan Pengeluaran Kegiatan')
      ON CONFLICT (id) DO NOTHING
    `;

    // Enforce ownership on conflict so a UUID belonging to another workspace cannot be overwritten.
    await sql`
      INSERT INTO receipts (
        id, workspace_id, reference_number, image_url, image_hash, extraction_mode,
        merchant_name, transaction_date, category, subtotal, tax_and_service,
        discount, total_amount, payment_method, confidence_score, warning_message,
        is_duplicate, duplicate_of_ref, is_simulation, status, notes, items
      )
      VALUES (
        ${receiptId},
        ${workspaceId},
        ${refNumber},
        ${r.imageUrl},
        ${imageHash},
        ${extractionMode},
        ${merchantName},
        ${transactionDate},
        ${category},
        ${subtotal},
        ${taxAndService},
        ${discount},
        ${totalAmount},
        ${paymentMethod},
        ${confidenceScore},
        ${warningMessage},
        ${isDuplicate},
        ${duplicateOfRef},
        FALSE,
        ${status},
        ${notes},
        ${JSON.stringify(safeItems)}::jsonb
      )
      ON CONFLICT (id) DO UPDATE SET
        reference_number = EXCLUDED.reference_number,
        merchant_name = EXCLUDED.merchant_name,
        transaction_date = EXCLUDED.transaction_date,
        category = EXCLUDED.category,
        subtotal = EXCLUDED.subtotal,
        tax_and_service = EXCLUDED.tax_and_service,
        discount = EXCLUDED.discount,
        total_amount = EXCLUDED.total_amount,
        payment_method = EXCLUDED.payment_method,
        confidence_score = EXCLUDED.confidence_score,
        warning_message = EXCLUDED.warning_message,
        is_duplicate = EXCLUDED.is_duplicate,
        duplicate_of_ref = EXCLUDED.duplicate_of_ref,
        status = EXCLUDED.status,
        notes = EXCLUDED.notes,
        items = EXCLUDED.items
      WHERE receipts.workspace_id = ${workspaceId}
    `;

    return NextResponse.json({ ok: true, cloudEnabled: true });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Penyimpanan nota sementara tidak tersedia." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  if (!verifySameOrigin(request)) {
    return NextResponse.json({ error: "Asal permintaan ditolak." }, { status: 403 });
  }

  const ip = getClientIp(request);
  if (!checkRateLimit(`receipts-del:${ip}`, 80, 60_000)) {
    return NextResponse.json(
      { error: "Terlalu banyak permintaan. Coba lagi sebentar." },
      { status: 429 }
    );
  }

  const sql = getSql();
  if (!sql) {
    return NextResponse.json({ cloudEnabled: false }, { status: 200 });
  }

  const { searchParams } = new URL(request.url);
  const rawReceiptId = searchParams.get("id");
  const rawWsId = searchParams.get("workspaceId");

  if (!isValidWorkspaceId(rawWsId)) {
    return NextResponse.json(
      { error: "Identitas ruang kerja diperlukan dan harus valid." },
      { status: 400 }
    );
  }
  const workspaceId = rawWsId.trim();

  try {
    if (rawReceiptId !== null) {
      if (!isValidUuid(rawReceiptId)) {
        return NextResponse.json(
          { error: "Identitas nota tidak valid." },
          { status: 400 }
        );
      }
      await sql`
        DELETE FROM receipts
        WHERE id = ${rawReceiptId.trim()} AND workspace_id = ${workspaceId}
      `;
      return NextResponse.json({ ok: true });
    }

    await sql`DELETE FROM receipts WHERE workspace_id = ${workspaceId}`;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Penghapusan nota sementara tidak tersedia." },
      { status: 500 }
    );
  }
}
