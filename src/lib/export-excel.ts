import * as XLSX from "xlsx";
import type { Project, Receipt } from "@/types/beresin";
import { computeLpjNarrative } from "@/lib/lpj-narrative";
import { sanitizeSpreadsheetCell } from "@/lib/security";

export function exportProjectToExcel(project: Project, receipts: Receipt[]): void {
  const workbook = XLSX.utils.book_new();
  const narrative = computeLpjNarrative(project, receipts);

  const summaryRows: Array<Array<string | number>> = [
    ["LAPORAN PERTANGGUNGJAWABAN KEUANGAN (LPJ) · BERESin"],
    ["Judul Laporan / Kegiatan", sanitizeSpreadsheetCell(narrative.safeTitle)],
    [
      "Ketua Pelaksana / Penanggung Jawab",
      sanitizeSpreadsheetCell(project.chairpersonName || "-"),
    ],
    [
      "Bendahara / Penyusun Laporan",
      sanitizeSpreadsheetCell(project.treasurerName || "-"),
    ],
    ["Tanggal Unduh", narrative.printDateLabel],
    [],
    ["URAIAN LAPORAN OTOMATIS"],
    [sanitizeSpreadsheetCell(narrative.openingParagraph)],
    [sanitizeSpreadsheetCell(narrative.financialParagraph)],
    [sanitizeSpreadsheetCell(narrative.categoryParagraph)],
    [sanitizeSpreadsheetCell(narrative.closingParagraph)],
    [],
    ["RINGKASAN DANA"],
    [
      "Dana Awal / Pemasukan (Rp)",
      narrative.hasInitialBudget ? narrative.initialBudget : "-",
    ],
    ["Total Pengeluaran (Rp)", narrative.totalSpent],
    [
      "Sisa / Selisih Dana (Rp)",
      narrative.hasInitialBudget ? narrative.remainingBalance : "-",
    ],
    [
      "Jumlah Bukti Nota",
      `${receipts.length} nota (${narrative.verifiedCount} sudah dicek)`,
    ],
    [],
    ["REKAP PENGELUARAN PER KATEGORI"],
    ["Kategori", "Jumlah Nota", "Total Pengeluaran (Rp)", "Porsi (%)"],
  ];

  for (const row of narrative.categoryRows) {
    summaryRows.push([
      sanitizeSpreadsheetCell(row.category),
      row.count,
      row.amount,
      row.pct,
    ]);
  }
  summaryRows.push([
    "TOTAL KESELURUHAN",
    receipts.length,
    narrative.totalSpent,
    narrative.totalSpent > 0 ? 100 : 0,
  ]);

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSummary["!cols"] = [{ wch: 36 }, { wch: 22 }, { wch: 24 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(workbook, wsSummary, "Laporan & Ringkasan");

  const receiptHeader = [
    "Kode Nota",
    "Tanggal Beli",
    "Nama Toko / Tempat Beli",
    "Kategori",
    "Cara Bayar",
    "Subtotal Barang (Rp)",
    "Biaya Tambahan / Pajak (Rp)",
    "Potongan / Diskon (Rp)",
    "Total Bayar (Rp)",
    "Status Cek",
    "Keterangan Kembar",
    "Catatan Tambahan",
  ];

  const receiptRows: Array<Array<string | number>> = [receiptHeader];
  for (const r of receipts) {
    const statusLabel =
      r.status === "verified"
        ? "Sudah pas"
        : r.status === "needs_review"
        ? "Perlu dicek"
        : r.status === "processing"
        ? "Sedang dibaca"
        : "Gagal";
    receiptRows.push([
      sanitizeSpreadsheetCell(r.referenceNumber),
      sanitizeSpreadsheetCell(r.transactionDate ?? "-"),
      sanitizeSpreadsheetCell(r.merchantName),
      sanitizeSpreadsheetCell(r.category),
      sanitizeSpreadsheetCell(r.paymentMethod),
      r.subtotal,
      r.taxAndService,
      r.discount,
      r.totalAmount,
      statusLabel,
      r.isDuplicate
        ? sanitizeSpreadsheetCell(`Mirip dengan ${r.duplicateOfRef ?? "nota lain"}`)
        : "-",
      sanitizeSpreadsheetCell(r.notes || "-"),
    ]);
  }

  const wsReceipts = XLSX.utils.aoa_to_sheet(receiptRows);
  const lastReceiptDataRow = receipts.length + 1;
  const totalReceiptRowIdx = lastReceiptDataRow + 1;

  XLSX.utils.sheet_add_aoa(
    wsReceipts,
    [["TOTAL", "", "", "", "", 0, 0, 0, 0, "", "", ""]],
    { origin: `A${totalReceiptRowIdx}` }
  );

  if (receipts.length > 0) {
    wsReceipts[`F${totalReceiptRowIdx}`] = {
      t: "n",
      f: `SUM(F2:F${lastReceiptDataRow})`,
      v: receipts.reduce((s, r) => s + r.subtotal, 0),
    };
    wsReceipts[`G${totalReceiptRowIdx}`] = {
      t: "n",
      f: `SUM(G2:G${lastReceiptDataRow})`,
      v: receipts.reduce((s, r) => s + r.taxAndService, 0),
    };
    wsReceipts[`H${totalReceiptRowIdx}`] = {
      t: "n",
      f: `SUM(H2:H${lastReceiptDataRow})`,
      v: receipts.reduce((s, r) => s + r.discount, 0),
    };
    wsReceipts[`I${totalReceiptRowIdx}`] = {
      t: "n",
      f: `SUM(I2:I${lastReceiptDataRow})`,
      v: narrative.totalSpent,
    };
  }

  wsReceipts["!cols"] = [
    { wch: 15 },
    { wch: 16 },
    { wch: 30 },
    { wch: 18 },
    { wch: 14 },
    { wch: 20 },
    { wch: 24 },
    { wch: 20 },
    { wch: 18 },
    { wch: 16 },
    { wch: 24 },
    { wch: 28 },
  ];
  XLSX.utils.book_append_sheet(workbook, wsReceipts, "Daftar Nota");

  const itemRows: Array<Array<string | number>> = [
    [
      "Kode Nota",
      "Tanggal Beli",
      "Nama Toko",
      "Kategori",
      "Nama Barang / Keperluan",
      "Jumlah",
      "Harga Satuan (Rp)",
      "Total Baris (Rp)",
    ],
  ];

  for (const r of receipts) {
    if (r.items.length === 0) {
      itemRows.push([
        sanitizeSpreadsheetCell(r.referenceNumber),
        sanitizeSpreadsheetCell(r.transactionDate ?? "-"),
        sanitizeSpreadsheetCell(r.merchantName),
        sanitizeSpreadsheetCell(r.category),
        "(Dicatat total langsung tanpa rincian per barang)",
        1,
        r.totalAmount,
        r.totalAmount,
      ]);
      continue;
    }
    for (const item of r.items) {
      itemRows.push([
        sanitizeSpreadsheetCell(r.referenceNumber),
        sanitizeSpreadsheetCell(r.transactionDate ?? "-"),
        sanitizeSpreadsheetCell(r.merchantName),
        sanitizeSpreadsheetCell(r.category),
        sanitizeSpreadsheetCell(item.itemName),
        item.quantity,
        item.unitPrice,
        item.totalPrice,
      ]);
    }
  }

  const wsItems = XLSX.utils.aoa_to_sheet(itemRows);
  const lastItemRow = itemRows.length;
  if (lastItemRow > 1) {
    const sumRowIdx = lastItemRow + 1;
    XLSX.utils.sheet_add_aoa(
      wsItems,
      [["TOTAL RINCIAN BARANG", "", "", "", "", "", "", 0]],
      { origin: `A${sumRowIdx}` }
    );
    wsItems[`H${sumRowIdx}`] = {
      t: "n",
      f: `SUM(H2:H${lastItemRow})`,
      v: itemRows.slice(1).reduce((s, row) => s + (Number(row[7]) || 0), 0),
    };
  }

  wsItems["!cols"] = [
    { wch: 16 },
    { wch: 15 },
    { wch: 28 },
    { wch: 16 },
    { wch: 34 },
    { wch: 10 },
    { wch: 18 },
    { wch: 18 },
  ];
  XLSX.utils.book_append_sheet(workbook, wsItems, "Rincian Barang");

  const fileName = `LPJ-${narrative.fileSlug}-${narrative.todayIso}.xlsx`;
  XLSX.writeFile(workbook, fileName);
}
