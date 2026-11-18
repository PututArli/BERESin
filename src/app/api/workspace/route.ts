import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import type { Project, Receipt, ReceiptItem } from "@/types/beresin";

const DEFAULT_CATEGORIES = [
  "Konsumsi",
  "Perlengkapan",
  "Transportasi",
  "Acara",
  "Lain-lain",
];

function sanitizeWorkspaceId(raw: string | null): string {
  const cleaned = (raw ?? "").trim().replace(/[^a-zA-Z0-9_-]/g, "");
  return cleaned.slice(0, 80);
}

export async function GET(request: Request) {
  const sql = getSql();
  if (!sql) {
    return NextResponse.json({ cloudEnabled: false }, { status: 200 });
  }

  const { searchParams } = new URL(request.url);
  const workspaceId = sanitizeWorkspaceId(searchParams.get("workspaceId"));
  if (!workspaceId) {
    return NextResponse.json(
      { error: "Parameter workspaceId diperlukan." },
      { status: 400 }
    );
  }

  try {
    await sql`
      INSERT INTO workspaces (id, report_title)
      VALUES (${workspaceId}, 'Laporan Pengeluaran Kegiatan')
      ON CONFLICT (id) DO NOTHING
    `;

    const wsRows = await sql`
      SELECT id, report_title, chairperson_name, treasurer_name, initial_budget, categories, created_at
      FROM workspaces
      WHERE id = ${workspaceId}
      LIMIT 1
    `;
    const ws = wsRows[0];

    const receiptRows = await sql`
      SELECT
        id, workspace_id, reference_number, image_url, image_hash, extraction_mode,
        merchant_name, transaction_date, category, subtotal, tax_and_service,
        discount, total_amount, payment_method, confidence_score, warning_message,
        is_duplicate, duplicate_of_ref, is_simulation, status, notes, items, created_at
      FROM receipts
      WHERE workspace_id = ${workspaceId}
      ORDER BY reference_number ASC
    `;

    const project: Project = {
      id: ws.id,
      title: ws.report_title || "Laporan Pengeluaran Kegiatan",
      description: "",
      initialBudget: Number(ws.initial_budget) || 0,
      chairpersonName: ws.chairperson_name || "",
      treasurerName: ws.treasurer_name || "",
      categories: Array.isArray(ws.categories) ? ws.categories : DEFAULT_CATEGORIES,
      createdAt:
        ws.created_at instanceof Date
          ? ws.created_at.toISOString()
          : String(ws.created_at),
    };

    const receipts: Receipt[] = receiptRows.map((r) => ({
      id: String(r.id),
      projectId: String(r.workspace_id),
      referenceNumber: String(r.reference_number),
      imageUrl: String(r.image_url),
      imageHash: String(r.image_hash ?? ""),
      extractionMode: r.extraction_mode === "summary" ? "summary" : "detailed",
      merchantName: String(r.merchant_name ?? ""),
      transactionDate: r.transaction_date
        ? r.transaction_date instanceof Date
          ? r.transaction_date.toISOString().slice(0, 10)
          : String(r.transaction_date).slice(0, 10)
        : null,
      category: String(r.category ?? "Lain-lain"),
      subtotal: Number(r.subtotal) || 0,
      taxAndService: Number(r.tax_and_service) || 0,
      discount: Number(r.discount) || 0,
      totalAmount: Number(r.total_amount) || 0,
      paymentMethod: r.payment_method ?? "Tunai",
      confidenceScore: Number(r.confidence_score) || 1,
      warningMessage: r.warning_message ? String(r.warning_message) : null,
      isDuplicate: Boolean(r.is_duplicate),
      duplicateOfRef: r.duplicate_of_ref ? String(r.duplicate_of_ref) : null,
      isSimulation: Boolean(r.is_simulation),
      status: r.status ?? "needs_review",
      notes: String(r.notes ?? ""),
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
  } catch (err) {
    return NextResponse.json(
      {
        cloudEnabled: false,
        error: err instanceof Error ? err.message : "Gagal membaca database.",
      },
      { status: 200 }
    );
  }
}

export async function PUT(request: Request) {
  const sql = getSql();
  if (!sql) {
    return NextResponse.json({ cloudEnabled: false }, { status: 200 });
  }

  try {
    const body = (await request.json()) as Partial<Project> & {
      workspaceId?: string;
    };
    const workspaceId = sanitizeWorkspaceId(body.workspaceId ?? body.id ?? "");
    if (!workspaceId) {
      return NextResponse.json(
        { error: "Parameter workspaceId diperlukan." },
        { status: 400 }
      );
    }

    const title = (body.title ?? "Laporan Pengeluaran Kegiatan").trim();
    const chairperson = (body.chairpersonName ?? "").trim();
    const treasurer = (body.treasurerName ?? "").trim();
    const initialBudget = Math.max(0, Math.round(Number(body.initialBudget) || 0));
    const categories =
      Array.isArray(body.categories) && body.categories.length > 0
        ? body.categories
        : DEFAULT_CATEGORIES;

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
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Gagal menyimpan laporan.",
      },
      { status: 500 }
    );
  }
}
