import type { Receipt } from "@/types/beresin";

const rupiahFormatter = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 0,
});

export function formatRupiah(amount: number): string {
  const safe = Number.isFinite(amount) ? Math.round(amount) : 0;
  if (safe < 0) {
    return `-Rp ${rupiahFormatter.format(Math.abs(safe))}`;
  }
  return `Rp ${rupiahFormatter.format(safe)}`;
}

// Parse shorthand Indonesian money inputs such as "25k", "15.000,-", or "150rb".
export function parseIndonesianMoneyInput(raw: string): number {
  const cleaned = raw.trim().toLowerCase().replace(/rp|\s|,-|\/-/g, "");
  if (!cleaned) return 0;

  const shorthandMatch = cleaned.match(/^(\d+(?:[.,]\d+)?)(k|rb|ribu|jt|juta)$/);
  if (shorthandMatch) {
    const base = parseFloat(shorthandMatch[1].replace(",", "."));
    const unit = shorthandMatch[2];
    const multiplier = unit === "jt" || unit === "juta" ? 1_000_000 : 1_000;
    return Math.round(base * multiplier);
  }

  const digitsOnly = cleaned.replace(/[^\d-]/g, "");
  const parsed = parseInt(digitsOnly, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

const INDONESIAN_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agt",
  "Sep",
  "Okt",
  "Nov",
  "Des",
];

export function formatShortDateId(isoDate: string | null | undefined): string {
  if (!isoDate) return "Tanggal belum diisi";
  const parts = isoDate.split("-");
  if (parts.length !== 3) return isoDate;
  const year = parseInt(parts[0], 10);
  const monthIdx = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  if (!year || monthIdx < 0 || monthIdx > 11 || !day) return isoDate;
  return `${String(day).padStart(2, "0")} ${INDONESIAN_MONTHS[monthIdx]} ${year}`;
}

export function todayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatReferenceNumber(sequenceIndex: number): string {
  return `NOTA-${String(sequenceIndex).padStart(3, "0")}`;
}

export function getInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "BR";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export async function computeBlobHash(blob: Blob): Promise<string> {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    return `${blob.size}-${blob.type}`;
  }
  const buffer = await blob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const bytes = Array.from(new Uint8Array(hashBuffer));
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function normalizeMerchant(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Flag possible duplicate receipts by matching either exact image hash or same date + total + merchant.
export function findDuplicateReceipt(
  candidate: {
    id?: string;
    imageHash?: string;
    transactionDate: string | null;
    totalAmount: number;
    merchantName: string;
  },
  existingReceipts: Receipt[]
): string | null {
  for (const existing of existingReceipts) {
    if (candidate.id && existing.id === candidate.id) continue;

    if (
      candidate.imageHash &&
      existing.imageHash &&
      candidate.imageHash === existing.imageHash
    ) {
      return existing.referenceNumber;
    }

    const sameDate =
      Boolean(candidate.transactionDate) &&
      candidate.transactionDate === existing.transactionDate;
    const sameTotal =
      candidate.totalAmount > 0 && candidate.totalAmount === existing.totalAmount;
    const normA = normalizeMerchant(candidate.merchantName);
    const normB = normalizeMerchant(existing.merchantName);
    const sameMerchant = normA.length >= 3 && normA === normB;

    if (sameDate && sameTotal && sameMerchant) {
      return existing.referenceNumber;
    }
  }
  return null;
}
