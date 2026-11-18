import type { ExtractionMode } from "@/types/beresin";

export function buildIndonesianReceiptSystemPrompt(
  categories: string[],
  extractionMode: ExtractionMode,
  currentYear: number
): string {
  const categoryList =
    categories.length > 0
      ? categories.join(", ")
      : "Konsumsi, Perlengkapan, Transportasi, Acara, Lain-lain";

  const detailRule =
    extractionMode === "summary"
      ? `Mode HANYA TOTAL: isi "items" cukup 1 ringkasan utama (quantity=1, unit_price=subtotal, total_price=subtotal).`
      : `Mode RINCIAN BARANG: salin setiap baris produk di struk ke "items" (gabungkan baris nama produk dengan baris "qty x harga" di bawahnya; abaikan baris TUNAI/KEMBALI/SUBTOTAL/PPN).`;

  return `Ekstrak data foto struk/nota/bukti bayar Indonesia ke JSON murni sesuai teks asli di gambar (jangan mengarang).
Kategori tersedia: [${categoryList}]. ${detailRule}
Aturan:
- merchant_name: nama toko/warung/merchant penerima (PT Indomarco -> Indomaret, PT Sumber Alfaria -> Alfamart).
- transaction_date: format "YYYY-MM-DD" (di Indonesia urutan DD/MM/YY, misal 05/11/26 -> 2026-11-05; jika tanpa tahun pakai ${currentYear}; jika kosong isi "").
- payment_method: wajib pilih "Tunai", "QRIS" (QRIS/GoPay/OVO/DANA/ShopeePay), "Transfer" (BCA/Livin/BRImo/BNI/SeaBank/VA), "Kartu" (Debit/Kredit/EDC/Flazz/e-Money), atau "Lainnya".
- Angka uang: bilangan bulat Rupiah murni tanpa titik/koma ("15.000" atau "15rb" -> 15000).
- total_amount: nominal akhir yang dibayar (bukan uang tunai diserahkan atau kembalian). tax_and_service=0 bila PPN sudah termasuk harga barang.
- confidence_score: 0.0-1.0 (<0.8 bila buram/meragukan, isi alasan singkat di warning_message, atau "" bila jelas).`;
}

export const RECEIPT_JSON_SCHEMA = {
  type: "object",
  properties: {
    merchant_name: { type: "string" },
    transaction_date: { type: "string" },
    category: { type: "string" },
    payment_method: {
      type: "string",
      enum: ["Tunai", "QRIS", "Transfer", "Kartu", "Lainnya"],
    },
    subtotal: { type: "number" },
    tax_and_service: { type: "number" },
    discount: { type: "number" },
    total_amount: { type: "number" },
    confidence_score: { type: "number" },
    warning_message: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          item_name: { type: "string" },
          quantity: { type: "number" },
          unit_price: { type: "number" },
          total_price: { type: "number" },
        },
        required: ["item_name", "quantity", "unit_price", "total_price"],
      },
    },
  },
  required: [
    "merchant_name",
    "transaction_date",
    "category",
    "payment_method",
    "subtotal",
    "tax_and_service",
    "discount",
    "total_amount",
    "confidence_score",
    "warning_message",
    "items",
  ],
} as const;

export const GEMINI_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    merchant_name: { type: "STRING" },
    transaction_date: { type: "STRING" },
    category: { type: "STRING" },
    payment_method: {
      type: "STRING",
      enum: ["Tunai", "QRIS", "Transfer", "Kartu", "Lainnya"],
    },
    subtotal: { type: "NUMBER" },
    tax_and_service: { type: "NUMBER" },
    discount: { type: "NUMBER" },
    total_amount: { type: "NUMBER" },
    confidence_score: { type: "NUMBER" },
    warning_message: { type: "STRING" },
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          item_name: { type: "STRING" },
          quantity: { type: "NUMBER" },
          unit_price: { type: "NUMBER" },
          total_price: { type: "NUMBER" },
        },
        required: ["item_name", "quantity", "unit_price", "total_price"],
      },
    },
  },
  required: [
    "merchant_name",
    "transaction_date",
    "category",
    "payment_method",
    "subtotal",
    "tax_and_service",
    "discount",
    "total_amount",
    "confidence_score",
    "warning_message",
    "items",
  ],
};
