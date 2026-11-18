import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import {
  checkRateLimit,
  getClientIp,
  isValidWorkspaceId,
  readBoundedJson,
  sanitizeMoneyAmount,
  sanitizePlainText,
  verifySameOrigin,
} from "@/lib/security";
import type { Project, Receipt, ReceiptItem } from "@/types/beresin";

const DEFAULT_CATEGORIES = [
  "Konsumsi",
  "Perlengkapan",
  "Transportasi",
  "Acara",
  "Lain-lain",
];

export async function GET(request: Request) {
  const ip = getClientIp(request);
  if (!checkRateLimit(`ws-get:${ip}`, 90, 60_000)) {
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
  const rawWsId = searchParams.get("workspaceId");
  if (!isValidWorkspaceId(rawWsId)) {
    return NextResponse.json(
      { error: "Identitas ruang kerja tidak valid." },
      { status: 400 }
    );
  }
  const workspaceId = rawWsId.trim();

  try {
    await sql`
      INSERT INTO workspaces (id, report_title)
      VALUES (${workspaceId}, 'Laporan Pengeluaran Kegiatan')
      ON CONFLICT (id) DO NOTHING
    `;

    const [wsRows, receiptRows] = await Promise.all([
      sql`
        SELECT id, report_title, chairperson_name, treasurer_name, initial_budget, categories, created_at
        FROM workspaces
        WHERE id = ${workspaceId}
        LIMIT 1
      `,
      sql`
        SELECT
          id, workspace_id, reference_number, image_url, image_hash, extraction_mode,
          merchant_name, transaction_date, category, subtotal, tax_and_service,
          discount, total_amount, payment_method, confidence_score, warning_message,
          is_duplicate, duplicate_of_ref, status, notes, items, created_at
        FROM receipts
        WHERE workspace_id = ${workspaceId}
        ORDER BY reference_number ASC
        LIMIT 500
      `,
    ]);
    const ws = wsRows[0];

    const project: Project = {
      id: String(ws.id),
      title: sanitizePlainText(ws.report_title, 160) || "Laporan Pengeluaran Kegiatan",
      description: "",
      initialBudget: sanitizeMoneyAmount(ws.initial_budget),
      chairpersonName: sanitizePlainText(ws.chairperson_name, 120),
      treasurerName: sanitizePlainText(ws.treasurer_name, 120),
      categories: Array.isArray(ws.categories)
        ? ws.categories
            .map((c: unknown) => sanitizePlainText(c, 50))
            .filter(Boolean)
            .slice(0, 20)
        : DEFAULT_CATEGORIES,
      createdAt:
        ws.created_at instanceof Date
          ? ws.created_at.toISOString()
          : String(ws.created_at),
    };

    const receipts: Receipt[] = receiptRows.map((r) => ({
      id: String(r.id),
      projectId: String(r.workspace_id),
      referenceNumber: sanitizePlainText(r.reference_number, 24),
      imageUrl: String(r.image_url),
      imageHash: sanitizePlainText(r.image_hash ?? "", 128),
      extractionMode: r.extraction_mode === "summary" ? "summary" : "detailed",
      merchantName: sanitizePlainText(r.merchant_name, 160),
      transactionDate: r.transaction_date
        ? r.transaction_date instanceof Date
          ? r.transaction_date.toISOString().slice(0, 10)
          : String(r.transaction_date).slice(0, 10)
        : null,
      category: sanitizePlainText(r.category ?? "Lain-lain", 50) || "Lain-lain",
      subtotal: sanitizeMoneyAmount(r.subtotal),
      taxAndService: sanitizeMoneyAmount(r.tax_and_service),
      discount: sanitizeMoneyAmount(r.discount),
      totalAmount: sanitizeMoneyAmount(r.total_amount),
      paymentMethod: r.payment_method ?? "Tunai",
      confidenceScore: Math.min(1, Math.max(0, Number(r.confidence_score) || 1)),
      warningMessage: r.warning_message
        ? sanitizePlainText(r.warning_message, 300)
        : null,
      isDuplicate: Boolean(r.is_duplicate),
      duplicateOfRef: r.duplicate_of_ref
        ? sanitizePlainText(r.duplicate_of_ref, 24)
        : null,
      status: r.status ?? "needs_review",
      notes: sanitizePlainText(r.notes ?? "", 500),
      items: Array.isArray(r.items) ? (r.items as ReceiptItem[]) : [],
      createdAt:
        r.created_at instanceof Date
          ? r.created_at.toISOString()
          : String(r.created_at),
    }));

    return NextResponse.json({
      cloudEnabled: true,
      project,
      receipts,
    });
  } catch {
    return NextResponse.json({ cloudEnabled: false }, { status: 200 });
  }
}

export async function PUT(request: Request) {
  if (!verifySameOrigin(request)) {
    return NextResponse.json({ error: "Asal permintaan ditolak." }, { status: 403 });
  }

  const ip = getClientIp(request);
  if (!checkRateLimit(`ws-put:${ip}`, 60, 60_000)) {
    return NextResponse.json(
      { error: "Terlalu banyak permintaan. Coba lagi sebentar." },
      { status: 429 }
    );
  }

  const sql = getSql();
  if (!sql) {
    return NextResponse.json({ cloudEnabled: false }, { status: 200 });
  }

  const parsed = await readBoundedJson<
    Partial<Project> & { workspaceId?: string }
  >(request, 64_000);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  const body = parsed.data;
  const rawWsId = body.workspaceId ?? body.id;
  if (!isValidWorkspaceId(rawWsId)) {
    return NextResponse.json(
      { error: "Identitas ruang kerja tidak valid." },
      { status: 400 }
    );
  }
  const workspaceId = rawWsId.trim();

  const title =
    sanitizePlainText(body.title, 160) || "Laporan Pengeluaran Kegiatan";
  const chairperson = sanitizePlainText(body.chairpersonName, 120);
  const treasurer = sanitizePlainText(body.treasurerName, 120);
  const initialBudget = sanitizeMoneyAmount(body.initialBudget);
  const categories =
    Array.isArray(body.categories) && body.categories.length > 0
      ? body.categories
          .map((c) => sanitizePlainText(c, 50))
          .filter(Boolean)
          .slice(0, 20)
      : DEFAULT_CATEGORIES;

  try {
    await sql`
      INSERT INTO workspaces (
        id, report_title, chairperson_name, treasurer_name, initial_budget, categories, updated_at
      )
      VALUES (
        ${workspaceId},
        ${title},
        ${chairperson},
        ${treasurer},
        ${initialBudget},
        ${JSON.stringify(categories)}::jsonb,
        NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        report_title = EXCLUDED.report_title,
        chairperson_name = EXCLUDED.chairperson_name,
        treasurer_name = EXCLUDED.treasurer_name,
        initial_budget = EXCLUDED.initial_budget,
        categories = EXCLUDED.categories,
        updated_at = NOW()
    `;

    return NextResponse.json({ ok: true, cloudEnabled: true });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Penyimpanan laporan sementara tidak tersedia." },
      { status: 500 }
    );
  }
}
