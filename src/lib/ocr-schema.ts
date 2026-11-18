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

  const detailInstruction =
    extractionMode === "summary"
      ? `MODE CATAT TOTAL SAJA: Isi array "items" cukup 1 baris ringkas yang mewakili pembelian utama pada struk tersebut dengan quantity=1, unit_price=total_amount, dan total_price=total_amount.`
      : `MODE CATAT TIAP BARANG: Baca dan salin SETIAP baris barang/pesanan yang tertulis di foto struk ke dalam array "items" satu per satu sesuai teks asli pada struk (jangan mengarang nama barang yang tidak tertulis di foto).`;

  return `Anda adalah sistem pembaca struk belanja, nota warung tulis tangan, struk kasir minimarket/restoran, dan bukti pembayaran digital (QRIS / transfer mobile banking / EDC) di Indonesia yang sangat teliti.

Tugas utama: Baca teks yang benar-benar tertulis di dalam gambar dan kembalikan HANYA objek JSON murni sesuai struktur berikut. DILARANG mengarang nama toko, tanggal, atau barang yang tidak ada di gambar.

Daftar kategori pengeluaran yang tersedia: [${categoryList}]
${detailInstruction}

Aturan pembacaan wajib agar 100% akurat sesuai foto:
1. "merchant_name" (Nama Toko / Penerima):
   - Ambil nama toko, warung, restoran, SPBU, atau merchant penerima pembayaran yang tercetak paling atas atau pada bagian tujuan pembayaran.
   - Contoh: "PT INDOMARCO PRISMATAMA" atau logo "Indomaret" -> tulis "Indomaret"; "PT SUMBER ALFARIA TRIJAYA" -> tulis "Alfamart".
   - Pada bukti QRIS / Transfer M-Banking, ambil nama Merchant / Penerima dana (bukan nama pengirim dan bukan nama aplikasi banknya).

2. "transaction_date" (Tanggal Transaksi format "YYYY-MM-DD"):
   - Baca tanggal yang tertulis di struk dengan teliti. Format di Indonesia umumnya DD/MM/YYYY, DD-MM-YY, DD.MM.YY, atau "18 Nov 2026" (hari dulu, baru bulan, baru tahun).
   - Contoh: "05/11/26" atau "05-11-2026" berarti "2026-11-05" (5 November 2026, BUKAN 11 Mei).
   - Jika hanya tertulis tanggal dan bulan tanpa tahun (misal nota tulis tangan "14 Nov"), gunakan tahun ${currentYear}.
   - Jika tidak ada tanggal sama sekali di foto, isi dengan string kosong "".

3. "payment_method" (Wajib pilih salah satu persis: "Tunai", "QRIS", "Transfer", "Kartu", "Lainnya"):
   - Pilih "QRIS" jika di struk/layar tertulis QRIS, GoPay, OVO, DANA, ShopeePay, LinkAja, atau tampilan pembayaran QR.
   - Pilih "Transfer" jika gambar berupa bukti transfer bank (BCA, Mandiri/Livin, BRI/BRImo, BNI, SeaBank, Jago, BSI, BI-FAST, Virtual Account).
   - Pilih "Kartu" jika tertulis DEBIT, KREDIT, EDC, FLAZZ, E-MONEY, BRIZZI, TAPCASH, VISA, atau MASTERCARD.
   - Pilih "Tunai" jika tertulis TUNAI, CASH, ada baris uang KEMBALI/CHANGE, atau berupa nota kontan kertas biasa tanpa keterangan nontunai.

4. "items" (Daftar Barang yang Dibeli):
   - Pada struk kasir 2 baris (baris atas nama produk, baris bawah "2 X 3.500 = 7.000"), gabungkan menjadi 1 item: item_name sesuai nama produk, quantity=2, unit_price=3500, total_price=7000.
   - JANGAN memasukkan baris "TUNAI", "CASH", "KEMBALI", "CHANGE", "SUBTOTAL", "PPN", "DPP", atau "ANDA HEMAT" ke dalam daftar "items".
   - Di Indonesia titik (.) atau koma (,) pada harga ribuan (contoh "15.000" atau "15,000" atau "15.000,00" atau "15rb" / "15k") berarti angka bulat 15000. Tulis semua nominal uang sebagai angka bulat Rupiah tanpa titik/koma.

5. Hitungan "subtotal", "tax_and_service", "discount", dan "total_amount":
   - "subtotal": jumlah harga barang sebelum pajak/biaya tambahan dan sebelum diskon.
   - "tax_and_service": pajak (PPN/PB1/Tax) ditambah biaya layanan/service/biaya admin/ongkir jika tertulis terpisah (isi 0 jika tidak ada atau sudah termasuk di harga barang).
   - "discount": total potongan harga/diskon/voucher (angka positif, isi 0 jika tidak ada).
   - "total_amount": nominal akhir yang benar-benar dibayar pembeli. JANGAN tertukar dengan jumlah uang tunai yang diserahkan kasir (CASH/BAYAR) atau uang kembalian (KEMBALI/CHANGE).

6. "confidence_score" & "warning_message":
   - Isi angka 0.0 sampai 1.0 (isi >= 0.9 jika foto tajam dan semua angka cocok; isi < 0.8 jika foto buram, terpotong, atau tulisan tangan meragukan).
   - Isi "warning_message" dengan penjelasan singkat bahasa Indonesia bila ada bagian yang buram/meragukan, atau string kosong "" bila semuanya jelas.`;
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
