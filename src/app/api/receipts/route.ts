import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import type { Receipt } from "@/types/beresin";

export async function POST(request: Request) {
  const sql = getSql();
  if (!sql) {
    return NextResponse.json({ cloudEnabled: false }, { status: 200 });
  }

  try {
    const body = (await request.json()) as {
      workspaceId?: string;
      receipt?: Receipt;
    };
    const workspaceId = (body.workspaceId ?? body.receipt?.projectId ?? "").trim();
    const r = body.receipt;

    if (!workspaceId || !r?.id) {
      return NextResponse.json(
        { error: "Data nota atau workspaceId tidak lengkap." },
        { status: 400 }
      );
    }

    await sql`
      INSERT INTO workspaces (id, report_title)
      VALUES (${workspaceId}, 'Laporan Pengeluaran Kegiatan')
      ON CONFLICT (id) DO NOTHING
    `;

    await sql`
      INSERT INTO receipts (
        id, workspace_id, reference_number, image_url, image_hash, extraction_mode,
        merchant_name, transaction_date, category, subtotal, tax_and_service,
        discount, total_amount, payment_method, confidence_score, warning_message,
        is_duplicate, duplicate_of_ref, is_simulation, status, notes, items
      )
      VALUES (
        ${r.id},
        ${workspaceId},
        ${r.referenceNumber},
        ${r.imageUrl},
        ${r.imageHash || null},
        ${r.extractionMode || "detailed"},
        ${r.merchantName || ""},
        ${r.transactionDate || null},
        ${r.category || "Lain-lain"},
        ${r.subtotal || 0},
        ${r.taxAndService || 0},
        ${r.discount || 0},
        ${r.totalAmount || 0},
        ${r.paymentMethod || "Tunai"},
        ${r.confidenceScore ?? 1},
        ${r.warningMessage || null},
        ${Boolean(r.isDuplicate)},
        ${r.duplicateOfRef || null},
        ${Boolean(r.isSimulation)},
        ${r.status || "needs_review"},
        ${r.notes || ""},
        ${JSON.stringify(r.items ?? [])}::jsonb
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
    `;

    return NextResponse.json({ ok: true, cloudEnabled: true });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Gagal menyimpan nota ke database.",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const sql = getSql();
  if (!sql) {
    return NextResponse.json({ cloudEnabled: false }, { status: 200 });
  }

  const { searchParams } = new URL(request.url);
  const receiptId = searchParams.get("id")?.trim();
  const workspaceId = searchParams.get("workspaceId")?.trim();

  try {
    if (receiptId) {
      await sql`DELETE FROM receipts WHERE id = ${receiptId}`;
      return NextResponse.json({ ok: true });
    }
    if (workspaceId) {
      await sql`DELETE FROM receipts WHERE workspace_id = ${workspaceId}`;
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json(
      { error: "Parameter id atau workspaceId diperlukan." },
      { status: 400 }
    );
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Gagal menghapus nota.",
      },
      { status: 500 }
    );
  }
}
