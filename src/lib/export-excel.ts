import * as XLSX from "xlsx";
import type { Project, Receipt } from "@/types/beresin";
import { formatShortDateId, todayIsoDate } from "@/lib/format";

function sanitizeFileSlug(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/\[.*?\]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "lpj-beresinhahay"
  );
}

export function exportProjectToExcel(project: Project, receipts: Receipt[]): void {
  const workbook = XLSX.utils.book_new();

  const totalSpent = receipts.reduce((acc, r) => acc + r.totalAmount, 0);
  const remainingBalance = project.initialBudget - totalSpent;
  const verifiedCount = receipts.filter((r) => r.status === "verified").length;

  const categoryTotals = new Map<string, { count: number; amount: number }>();
  for (const cat of project.categories) {
    categoryTotals.set(cat, { count: 0, amount: 0 });
  }
  for (const r of receipts) {
    const prev = categoryTotals.get(r.category) ?? { count: 0, amount: 0 };
    categoryTotals.set(r.category, {
      count: prev.count + 1,
      amount: prev.amount + r.totalAmount,
    });
  }

  const summaryRows: Array<Array<string | number>> = [
    ["LAPORAN PERTANGGUNGJAWABAN KEUANGAN (BERESinHAHAY)"],
    ["Nama Proyek / Kegiatan", project.title],
    ["Deskripsi", project.description || "-"],
    ["Ketua Pelaksana", project.chairpersonName || "-"],
    ["Bendahara", project.treasurerName || "-"],
    ["Tanggal Unduh", formatShortDateId(todayIsoDate())],
    [],
    ["RINGKASAN NERACA DANA"],
    ["Dana Awal / Pemasukan (Rp)", project.initialBudget],
    ["Total Pengeluaran (Rp)", totalSpent],
    ["Sisa Saldo (Rp)", remainingBalance],
    ["Jumlah Bukti Nota", `${receipts.length} nota (${verifiedCount} sah)`],
    [],
    ["REKAPITULASI PER KATEGORI / POS ANGGARAN"],
    ["Pos Anggaran", "Jumlah Nota", "Total Pengeluaran (Rp)", "Porsi Pengeluaran (%)"],
  ];

  for (const [catName, stat] of categoryTotals.entries()) {
    const pct = totalSpent > 0 ? Number(((stat.amount / totalSpent) * 100).toFixed(1)) : 0;
    summaryRows.push([catName, stat.count, stat.amount, pct]);
  }
  summaryRows.push(["TOTAL KESELURUHAN", receipts.length, totalSpent, totalSpent > 0 ? 100 : 0]);

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSummary["!cols"] = [{ wch: 34 }, { wch: 18 }, { wch: 24 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(workbook, wsSummary, "Ringkasan Kategori");

  const receiptHeader = [
    "No. Referensi",
    "Tanggal Transaksi",
    "Nama Toko / Penerima",
    "Pos Anggaran",
    "Metode Bayar",
    "Subtotal (Rp)",
    "Pajak & Layanan (Rp)",
    "Diskon (Rp)",
    "Total Akhir (Rp)",
    "Status Verifikasi",
    "Peringatan Ganda",
    "Catatan Bendahara",
  ];

  const receiptRows: Array<Array<string | number>> = [receiptHeader];
  for (const r of receipts) {
    const statusLabel =
      r.status === "verified"
        ? "Sah (Terverifikasi)"
        : r.status === "needs_review"
        ? "Perlu Dicek"
        : r.status === "processing"
        ? "Memproses"
        : "Gagal";
    receiptRows.push([
      r.referenceNumber,
      r.transactionDate ?? "-",
      r.merchantName,
      r.category,
      r.paymentMethod,
      r.subtotal,
      r.taxAndService,
      r.discount,
      r.totalAmount,
      statusLabel,
      r.isDuplicate ? `Cek kesamaan dgn ${r.duplicateOfRef ?? "nota lain"}` : "-",
      r.notes || "-",
    ]);
  }
  receiptRows.push([
    "TOTAL",
    "",
    "",
    "",
    "",
    receipts.reduce((s, r) => s + r.subtotal, 0),
    receipts.reduce((s, r) => s + r.taxAndService, 0),
    receipts.reduce((s, r) => s + r.discount, 0),
    totalSpent,
    "",
    "",
    "",
  ]);

  const wsReceipts = XLSX.utils.aoa_to_sheet(receiptRows);
  wsReceipts["!cols"] = [
    { wch: 15 },
    { wch: 18 },
    { wch: 30 },
    { wch: 18 },
    { wch: 14 },
    { wch: 16 },
    { wch: 18 },
    { wch: 14 },
    { wch: 18 },
    { wch: 20 },
    { wch: 24 },
    { wch: 30 },
  ];
  XLSX.utils.book_append_sheet(workbook, wsReceipts, "Rekap Per Nota");

  const itemRows: Array<Array<string | number>> = [
    [
      "No. Referensi Nota",
      "Tanggal",
      "Nama Toko",
      "Kategori",
      "Nama Barang / Uraian",
      "Kuantitas",
      "Harga Satuan (Rp)",
      "Subtotal Baris (Rp)",
    ],
  ];

  for (const r of receipts) {
    if (r.items.length === 0) {
      itemRows.push([
        r.referenceNumber,
        r.transactionDate ?? "-",
        r.merchantName,
        r.category,
        "(Rekap langsung tanpa rincian baris)",
        1,
        r.totalAmount,
        r.totalAmount,
      ]);
      continue;
    }
    for (const item of r.items) {
      itemRows.push([
        r.referenceNumber,
        r.transactionDate ?? "-",
        r.merchantName,
        r.category,
        item.itemName,
        item.quantity,
        item.unitPrice,
        item.totalPrice,
      ]);
    }
  }

  const wsItems = XLSX.utils.aoa_to_sheet(itemRows);
  wsItems["!cols"] = [
    { wch: 18 },
    { wch: 15 },
    { wch: 28 },
    { wch: 16 },
    { wch: 34 },
    { wch: 12 },
    { wch: 18 },
    { wch: 18 },
  ];
  XLSX.utils.book_append_sheet(workbook, wsItems, "Rincian per Barang");

  const fileName = `Rekap-LPJ-${sanitizeFileSlug(project.title)}-${todayIsoDate()}.xlsx`;
  XLSX.writeFile(workbook, fileName);
}
