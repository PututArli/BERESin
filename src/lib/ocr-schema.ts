import type { ExtractionMode } from "@/types/beresin";

export function buildIndonesianReceiptSystemPrompt(
  categories: string[],
  extractionMode: ExtractionMode,
  currentYear: number
): string {
  const categoryList = categories.length > 0 ? categories.join(", ") : "Konsumsi, Perlengkapan, Transportasi, Acara, Lain-lain";
  const detailInstruction =
    extractionMode === "summary"
      ? "Mode Ekstraksi: REKAP TOTAL SAJA (Cepat). Kembalikan array `items` berisi cukup 1 ringkasan utama pembelian di toko tersebut dengan `total_price` senilai total belanja, sehingga proses cepat untuk struk panjang."
      : "Mode Ekstraksi: RINCIAN PER BARANG (Detail). Ekstrak setiap baris barang yang tertera di nota ke dalam array `items` secara lengkap.";

  return `Kamu adalah asisten akuntan dan auditor keuangan ahli di Indonesia. Tugasmu adalah mengekstrak data dari gambar struk belanja, nota kontan tulisan tangan, atau bukti transfer (QRIS/M-Banking) ke dalam format JSON yang terstruktur.

Daftar Kategori Proyek yang Tersedia: [${categoryList}]
${detailInstruction}

Aturan Ekstraksi Konteks Indonesia:
1. Format Angka: Di Indonesia, titik (.) digunakan sebagai pemisah ribuan (contoh: "15.000" atau "15,000" pada mesin kasir berarti 15000). Singkatan "k" atau "rb" pada nota tulisan tangan berarti ribu (contoh: "25k" = 25000). Kembalikan semua nilai uang dalam bentuk integer/number murni tanpa titik/koma atau simbol Rp.
2. Tanggal: Ubah format tanggal Indonesia (DD/MM/YYYY, DD-MM-YY, atau "12 Agt ${currentYear}") menjadi standar ISO "YYYY-MM-DD". Jika tahun tidak tertulis di nota warung, gunakan tahun berjalan saat ini (${currentYear}). Jika tanggal sama sekali tidak ditemukan, kembalikan null.
3. Kategori: Pilih satu kategori yang paling cocok dari daftar yang diberikan pengguna berdasarkan nama toko dan jenis barang yang dibeli.
4. Validasi Matematika: Pastikan \`total_amount\` adalah jumlah akhir yang benar-benar dibayar (setelah ditambah pajak/biaya layanan dan dikurangi diskon/voucher). Jangan tertukar antara \`TOTAL\` dengan \`TUNAI/CASH\` (uang yang diserahkan) atau \`KEMBALI/CHANGE\`.
5. Confidence Score: Berikan nilai 0.0 hingga 1.0 pada \`confidence_score\`. Berikan nilai di bawah 0.75 jika gambar buram, terpotong, tulisan tangan sangat sulit dibaca, atau total penjumlahan item tidak cocok dengan total akhir di nota.`;
}

export const RECEIPT_JSON_SCHEMA = {
  type: "object",
  properties: {
    merchant_name: {
      type: "string",
      description: "Nama toko, warung, minimarket, atau penerima transfer",
    },
    transaction_date: {
      type: ["string", "null"],
      description: "Tanggal transaksi dalam format YYYY-MM-DD",
    },
    category: {
      type: "string",
      description: "Kategori pengeluaran yang paling relevan dari daftar kategori proyek",
    },
    payment_method: {
      type: "string",
      enum: ["Tunai", "QRIS", "Transfer", "Kartu", "Lainnya"],
    },
    subtotal: { type: "number" },
    tax_and_service: { type: "number" },
    discount: { type: "number" },
    total_amount: {
      type: "number",
      description: "Nominal akhir yang dibayarkan (bukan uang tunai yang diserahkan atau kembalian)",
    },
    confidence_score: {
      type: "number",
      description: "Tingkat keyakinan akurasi pembacaan antara 0.0 sampai 1.0",
    },
    warning_message: {
      type: ["string", "null"],
      description: "Alasan jika confidence_score rendah, misalnya 'Tulisan tangan buram pada baris ke-2' atau 'Total item tidak sama dengan grand total'",
    },
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
    "total_amount",
    "confidence_score",
    "items",
  ],
} as const;

// Gemini REST responseSchema does not accept array union types like ["string", "null"], so nullable: true is used.
export const GEMINI_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    merchant_name: { type: "STRING" },
    transaction_date: { type: "STRING", nullable: true },
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
    warning_message: { type: "STRING", nullable: true },
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
    "total_amount",
    "confidence_score",
    "items",
  ],
};
