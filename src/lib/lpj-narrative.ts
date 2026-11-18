import type { Project, Receipt } from "@/types/beresin";
import { formatRupiah, formatShortDateId, todayIsoDate } from "@/lib/format";
import { sanitizePlainText } from "@/lib/security";

export interface CategorySummaryRow {
  category: string;
  count: number;
  amount: number;
  pct: number;
}

export interface LpjReportComputed {
  safeTitle: string;
  fileSlug: string;
  todayIso: string;
  printDateLabel: string;
  periodLabel: string;
  chairpersonLabel: string;
  treasurerLabel: string;
  hasInitialBudget: boolean;
  initialBudget: number;
  totalSpent: number;
  remainingBalance: number;
  initialBudgetDisplay: string;
  remainingBalanceDisplay: string;
  verifiedCount: number;
  needsReviewCount: number;
  categoryRows: CategorySummaryRow[];
  openingParagraph: string;
  financialParagraph: string;
  categoryParagraph: string;
  closingParagraph: string;
}

export function buildFileSlug(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "lpj-beresin"
  );
}

export function computeLpjNarrative(
  project: Project,
  receipts: Receipt[]
): LpjReportComputed {
  const safeTitle =
    sanitizePlainText(project.title, 140) || "Laporan Pengeluaran Kegiatan";
  const fileSlug = buildFileSlug(safeTitle);
  const todayIso = todayIsoDate();
  const printDateLabel = formatShortDateId(todayIso);

  const chairpersonClean = sanitizePlainText(project.chairpersonName, 80);
  const treasurerClean = sanitizePlainText(project.treasurerName, 80);
  const chairpersonLabel =
    chairpersonClean || "( ........................................ )";
  const treasurerLabel =
    treasurerClean || "( ........................................ )";

  const initialBudget = Math.max(0, Math.round(project.initialBudget || 0));
  const hasInitialBudget = initialBudget > 0;
  const totalSpent = receipts.reduce((sum, r) => sum + (r.totalAmount || 0), 0);
  const remainingBalance = hasInitialBudget ? initialBudget - totalSpent : 0;
  const initialBudgetDisplay = hasInitialBudget
    ? formatRupiah(initialBudget)
    : "- (Tanpa dana awal)";
  const remainingBalanceDisplay = hasInitialBudget
    ? remainingBalance < 0
      ? `Kurang ${formatRupiah(Math.abs(remainingBalance))}`
      : formatRupiah(remainingBalance)
    : "-";
  const verifiedCount = receipts.filter((r) => r.status === "verified").length;
  const needsReviewCount = receipts.length - verifiedCount;

  const validDates = receipts
    .map((r) => r.transactionDate)
    .filter((d): d is string => Boolean(d && /^\d{4}-\d{2}-\d{2}$/.test(d)))
    .sort();

  let periodLabel = `tanggal ${printDateLabel}`;
  if (validDates.length === 1) {
    periodLabel = `tanggal ${formatShortDateId(validDates[0])}`;
  } else if (validDates.length > 1) {
    const firstDate = validDates[0];
    const lastDate = validDates[validDates.length - 1];
    periodLabel =
      firstDate === lastDate
        ? `tanggal ${formatShortDateId(firstDate)}`
        : `rentang tanggal ${formatShortDateId(firstDate)} sampai dengan ${formatShortDateId(lastDate)}`;
  }

  const catMap = new Map<string, { count: number; amount: number }>();
  for (const cat of project.categories) {
    catMap.set(cat, { count: 0, amount: 0 });
  }
  for (const r of receipts) {
    const key = sanitizePlainText(r.category, 50) || "Lain-lain";
    const cur = catMap.get(key) ?? { count: 0, amount: 0 };
    catMap.set(key, {
      count: cur.count + 1,
      amount: cur.amount + r.totalAmount,
    });
  }

  const categoryRows: CategorySummaryRow[] = Array.from(catMap.entries()).map(
    ([category, stat]) => ({
      category,
      count: stat.count,
      amount: stat.amount,
      pct:
        totalSpent > 0 ? Number(((stat.amount / totalSpent) * 100).toFixed(1)) : 0,
    })
  );

  const activeCategories = categoryRows
    .filter((c) => c.count > 0)
    .sort((a, b) => b.amount - a.amount);

  const openingParagraph =
    receipts.length > 0
      ? `Laporan Pertanggungjawaban (LPJ) Keuangan untuk "${safeTitle}" ini disusun sebagai catatan tertulis atas seluruh pengeluaran yang dilakukan pada ${periodLabel}. Seluruh angka di dalam laporan ini dirangkum langsung dari ${receipts.length} bukti pembayaran yang dilampirkan.`
      : `Laporan Pertanggungjawaban (LPJ) Keuangan untuk "${safeTitle}" ini disusun pada ${printDateLabel}. Hingga saat laporan ini diunduh, belum terdapat bukti pengeluaran yang dimasukkan.`;

  let financialParagraph = `Total keseluruhan pengeluaran yang tercatat dari ${receipts.length} bukti pembayaran adalah sebesar ${formatRupiah(totalSpent)}.`;
  if (initialBudget > 0) {
    if (remainingBalance > 0) {
      financialParagraph = `Berdasarkan dana awal yang tercatat sebesar ${formatRupiah(initialBudget)}, total dana yang terpakai untuk seluruh keperluan adalah sebesar ${formatRupiah(totalSpent)}. Dengan demikian, masih terdapat sisa dana sebesar ${formatRupiah(remainingBalance)}.`;
    } else if (remainingBalance === 0) {
      financialParagraph = `Berdasarkan dana awal yang tercatat sebesar ${formatRupiah(initialBudget)}, seluruh dana telah terpakai sesuai total pengeluaran sebesar ${formatRupiah(totalSpent)} sehingga sisa saldo akhir adalah Rp 0.`;
    } else {
      financialParagraph = `Berdasarkan dana awal yang tercatat sebesar ${formatRupiah(initialBudget)}, total pengeluaran mencapai ${formatRupiah(totalSpent)}. Terdapat selisih kekurangan dana (talangan) sebesar ${formatRupiah(Math.abs(remainingBalance))} yang melebihi dana awal.`;
    }
  }

  let categoryParagraph =
    "Rincian pengeluaran per kategori akan terisi otomatis setelah bukti pembayaran ditambahkan.";
  if (activeCategories.length > 0) {
    const parts = activeCategories.map(
      (c) => `${c.category} sebesar ${formatRupiah(c.amount)} (${c.count} nota)`
    );
    const joinedParts =
      parts.length === 1
        ? parts[0]
        : parts.length === 2
        ? `${parts[0]} dan ${parts[1]}`
        : `${parts.slice(0, -1).join(", ")}, serta ${parts[parts.length - 1]}`;

    const largest = [...receipts].sort((a, b) => b.totalAmount - a.totalAmount)[0];
    const largestSentence =
      largest && largest.totalAmount > 0
        ? ` Pengeluaran terbesar tercatat pada ${sanitizePlainText(largest.merchantName, 80)} (#${sanitizePlainText(largest.referenceNumber, 24)}) sebesar ${formatRupiah(largest.totalAmount)}.`
        : "";

    categoryParagraph = `Dilihat per kelompok kebutuhan, pengeluaran tersebut digunakan untuk ${joinedParts}.${largestSentence}`;
  }

  const statusNote =
    receipts.length > 0
      ? needsReviewCount === 0
        ? `Seluruh ${receipts.length} bukti nota telah diperiksa kesesuaian angkanya.`
        : `Sebanyak ${verifiedCount} dari ${receipts.length} bukti nota telah ditandai sesuai, sedangkan ${needsReviewCount} nota lainnya masih berstatus perlu dicek.`
      : "";

  const closingParagraph =
    `Demikian laporan pertanggungjawaban keuangan ini dibuat sesuai bukti pembayaran yang ada untuk dipergunakan sebagaimana mestinya.` +
    (statusNote ? ` ${statusNote}` : "");

  return {
    safeTitle,
    fileSlug,
    todayIso,
    printDateLabel,
    periodLabel,
    chairpersonLabel,
    treasurerLabel,
    hasInitialBudget,
    initialBudget,
    totalSpent,
    remainingBalance,
    initialBudgetDisplay,
    remainingBalanceDisplay,
    verifiedCount,
    needsReviewCount,
    categoryRows,
    openingParagraph,
    financialParagraph,
    categoryParagraph,
    closingParagraph,
  };
}
