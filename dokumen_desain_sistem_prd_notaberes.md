# Dokumen Desain Sistem & Spesifikasi Produk: NotaBeres
**Deskripsi Singkat:** Aplikasi web *Automated Receipt Recap & LPJ Generator* untuk mengubah puluhan foto struk/nota kusut menjadi tabel laporan keuangan (Excel) dan lampiran bukti foto rapi (PDF) secara otomatis menggunakan AI Vision.

---

## 1. Konteks Produk & Target Pasar
### 1.1 Masalah Utama (Pain Points)
Bendahara kepanitiaan (kampus, sekolah, acara warga, organisasi), staf *reimbursement* kantor, dan pemilik UMKM di Indonesia sering menghabiskan waktu berjam-jam untuk:
1. Mengumpulkan puluhan struk fisik (struk kasir thermal, nota kontan tulisan tangan, bukti transfer QRIS).
2. Mengetik ulang tanggal, nama toko, rincian barang, dan total harga satu per satu ke Excel.
3. Menyusun dan menempelkan foto-foto nota ke dokumen Word/PDF sebagai **Lampiran Bukti LPJ (Laporan Pertanggungjawaban)** dengan nomor urut yang sesuai dengan tabel pengeluaran.

### 1.2 Solusi Nilai Jual Utama (Killer Features)
1. **Bulk Upload & AI OCR Konteks Lokal:** Unggah 10–50 foto nota sekaligus. AI otomatis mengenali format angka Indonesia (`Rp15.000`, `15k`, `15.000,-`), membedakan diskon/pajak, dan mampu membaca nota kontan tulisan tangan warung.
2. **Split-Screen Cepat Periksa (Fast Verification UI):** Tampilan layar belah—kiri gambar nota (bisa di-*zoom*/putar), kanan form hasil bacaan AI yang bisa langsung diedit jika ada *typo*.
3. **Auto-Generator Lampiran LPJ (PDF) & Tabel Rekap (Excel):** Tidak hanya ekspor ke `.xlsx`, tapi juga otomatis menghasilkan file `.pdf` berisi tabel rekapitulasi yang diikuti halaman lampiran berisi kisi-kisi (*grid*) foto nota yang sudah diberi nomor referensi (`#REF-01`, `#REF-02`, dst.).

### 1.3 Model Monetisasi
* **Tanpa Langganan Bulanan (Pay-as-you-go / Sistem Kuota Token):** Pengguna membeli kuota per kepanitiaan/acara via QRIS.
* **Skema Harga:**
  * **Gratis (Trial):** 5 kuota nota saat pertama daftar (1 Proyek).
  * **Paket Panitia Kecil (Rp10.000):** 50 kuota nota + Ekspor Excel & PDF LPJ tanpa *watermark*.
  * **Paket Acara Besar / UMKM (Rp25.000):** 150 kuota nota + Fitur Kategori Anggaran/Pos Dana.

---

## 2. Rekomendasi Tech Stack (Ramah AI Coding)
Gunakan *stack* modern berikut agar proses pembuatan dengan bantuan AI berjalan cepat, minim konfigurasi rumit, dan mudah di-*deploy*:

* **Framework:** Next.js (App Router) + TypeScript
* **Styling & UI:** Tailwind CSS + `shadcn/ui` + Lucide Icons
* **Backend & Database:** Supabase (PostgreSQL, Supabase Auth, Supabase Storage untuk simpan foto nota)
* **AI Vision Engine:** Google Gemini 2.5 Flash API atau OpenAI `gpt-4o-mini` (menggunakan fitur *Structured Outputs* / JSON Schema agar hasil ekstraksi selalu konsisten)
* **Pemrosesan Gambar (Client-side):** `browser-image-compression` (wajib kompres foto nota di *browser* menjadi maksimal 1MB / lebar 1200px sebelum diunggah agar hemat *bandwidth* dan token AI)
* **Export Engine:**
  * Excel: `exceljs` atau `xlsx` (SheetJS)
  * PDF LPJ: `@react-pdf/renderer` atau `jspdf` + `jspdf-autotable`
* **Payment Gateway (Lokal):** Midtrans, Xendit, atau Mayar (fokus ke pembayaran instan QRIS)

---

## 3. Alur Pengguna (User Flow)
1. **Onboarding & Buat Proyek:** Pengguna *login* (Google OAuth) -> Klik **"Buat Laporan Baru"** (contoh: *"LPJ Malam Keakraban 2026"*) -> Opsional: Masukkan saldo awal/pemasukan dan daftar Pos Anggaran (Konsumsi, Perlengkapan, Acara, Transportasi).
2. **Unggah Massal (Bulk Upload):** Pengguna memilih banyak foto struk dari galeri HP atau *drag-and-drop* di laptop -> Sistem mengompresi gambar di *browser* -> Mengunggah ke penyimpanan dan memprosesnya via AI Vision secara paralel.
3. **Verifikasi & Koreksi (Review):** Nota yang selesai diproses berstatus `Perlu Dicek` (terutama jika tingkat keyakinan AI/confidence rendah) atau `Siap`. Pengguna mengecek di layar *Split-Screen* dan mengklik **"Tandai Valid"**.
4. **Cetak & Unduh Laporan:** Pengguna klik **"Unduh Laporan"** -> Memilih format:
   * **File Excel (.xlsx):** Berisi *Sheet* Ringkasan per Kategori, *Sheet* Rekap Per Nota, dan *Sheet* Rincian per Item Barang.
   * **Dokumen LPJ Siap Cetak (.pdf):** Halaman 1 berisi kop laporan, ringkasan pemasukan vs pengeluaran, dan tabel rekapitulasi. Halaman 2 dst. berisi foto-foto nota (4–6 nota per halaman A4) lengkap dengan label nomor urut (`[Nota #01 - Rp45.000]`).

---

## 4. Skema Database (PostgreSQL / Supabase)

```sql
-- 1. Tabel Profil Pengguna & Kuota
CREATE TABLE profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  full_name TEXT,
  quota_balance INT DEFAULT 5 NOT NULL, -- Gratis 5 kuota awal
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabel Proyek / Kegiatan (Satu LPJ = Satu Proyek)
CREATE TABLE projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL, -- contoh: "LPJ Seminar Nasional"
  description TEXT,
  initial_budget NUMERIC(15, 2) DEFAULT 0, -- Pemasukan / Dana Awal
  categories JSONB DEFAULT '["Konsumsi", "Perlengkapan", "Transportasi", "Acara", "Lain-lain"]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Tabel Nota / Struk (Header)
CREATE TABLE receipts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  reference_number TEXT NOT NULL, -- contoh: "NOTA-001" (urut otomatis per proyek)
  image_url TEXT NOT NULL,
  merchant_name TEXT, -- Nama toko/warung
  transaction_date DATE,
  category TEXT DEFAULT 'Lain-lain',
  subtotal NUMERIC(15, 2) DEFAULT 0,
  tax_and_service NUMERIC(15, 2) DEFAULT 0,
  discount NUMERIC(15, 2) DEFAULT 0,
  total_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
  payment_method TEXT, -- Tunai, QRIS, Transfer
  confidence_score FLOAT DEFAULT 1.0, -- 0.0 s/d 1.0 dari AI
  status TEXT DEFAULT 'processing' CHECK (status IN ('processing', 'needs_review', 'verified', 'failed')),
  notes TEXT, -- Catatan tambahan bendahara
  raw_ai_response JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Tabel Rincian Barang per Nota (Line Items)
CREATE TABLE receipt_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  receipt_id UUID REFERENCES receipts(id) ON DELETE CASCADE NOT NULL,
  item_name TEXT NOT NULL,
  quantity FLOAT DEFAULT 1,
  unit_price NUMERIC(15, 2) DEFAULT 0,
  total_price NUMERIC(15, 2) NOT NULL DEFAULT 0
);

-- 5. Tabel Riwayat Transaksi Top-up Kuota
CREATE TABLE quota_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  package_name TEXT NOT NULL,
  quota_added INT NOT NULL,
  amount_paid NUMERIC(15, 2) NOT NULL,
  payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'expired')),
  external_payment_id TEXT, -- ID dari Midtrans/Mayar
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 5. Spesifikasi AI Vision (Prompt & JSON Schema)

Bagian ini adalah inti kecerdasan aplikasi. Gunakan **Structured Outputs** pada panggilan API AI Vision.

### 5.1 System Prompt untuk AI
```text
Kamu adalah asisten akuntan dan auditor keuangan ahli di Indonesia. Tugasmu adalah mengekstrak data dari gambar struk belanja, nota kontan tulisan tangan, atau bukti transfer (QRIS/M-Banking) ke dalam format JSON yang terstruktur.

Aturan Ekstraksi Konteks Indonesia:
1. Format Angka: Di Indonesia, titik (.) digunakan sebagai pemisah ribuan (contoh: "15.000" atau "15,000" pada mesin kasir berarti 15000). Singkatan "k" atau "rb" pada nota tulisan tangan berarti ribu (contoh: "25k" = 25000). Kembalikan semua nilai uang dalam bentuk integer/number murni tanpa titik/koma atau simbol Rp.
2. Tanggal: Ubah format tanggal Indonesia (DD/MM/YYYY, DD-MM-YY, atau "12 Agt 2026") menjadi standar ISO "YYYY-MM-DD". Jika tahun tidak tertulis di nota warung, gunakan tahun berjalan saat ini. Jika tanggal sama sekali tidak ditemukan, kembalikan null.
3. Kategori: Pilih satu kategori yang paling cocok dari daftar yang diberikan pengguna berdasarkan nama toko dan jenis barang yang dibeli.
4. Validasi Matematika: Pastikan `total_amount` adalah jumlah akhir yang benar-benar dibayar (setelah ditambah pajak/biaya layanan dan dikurangi diskon/voucher). Jangan tertukar antara `TOTAL` dengan `TUNAI/CASH` (uang yang diserahkan) atau `KEMBALI/CHANGE`.
5. Confidence Score: Berikan nilai 0.0 hingga 1.0 pada `confidence_score`. Berikan nilai di bawah 0.75 jika gambar buram, terpotong, tulisan tangan sangat sulit dibaca, atau total penjumlahan item tidak cocok dengan total akhir di nota.
```

### 5.2 Skema Output JSON (Structured Output Schema)
```json
{
  "type": "object",
  "properties": {
    "merchant_name": {
      "type": "string",
      "description": "Nama toko, warung, minimarket, atau penerima transfer"
    },
    "transaction_date": {
      "type": ["string", "null"],
      "description": "Tanggal transaksi dalam format YYYY-MM-DD"
    },
    "category": {
      "type": "string",
      "description": "Kategori pengeluaran yang paling relevan dari daftar kategori proyek"
    },
    "payment_method": {
      "type": "string",
      "enum": ["Tunai", "QRIS", "Transfer", "Kartu", "Lainnya"]
    },
    "subtotal": { "type": "number" },
    "tax_and_service": { "type": "number" },
    "discount": { "type": "number" },
    "total_amount": {
      "type": "number",
      "description": "Nominal akhir yang dibayarkan (bukan uang tunai yang diserahkan atau kembalian)"
    },
    "confidence_score": {
      "type": "number",
      "description": "Tingkat keyakinan akurasi pembacaan antara 0.0 sampai 1.0"
    },
    "warning_message": {
      "type": ["string", "null"],
      "description": "Alasan jika confidence_score rendah, misalnya 'Tulisan tangan buram pada baris ke-2' atau 'Total item tidak sama dengan grand total'"
    },
    "items": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "item_name": { "type": "string" },
          "quantity": { "type": "number" },
          "unit_price": { "type": "number" },
          "total_price": { "type": "number" }
        },
        "required": ["item_name", "quantity", "unit_price", "total_price"]
      }
    }
  },
  "required": [
    "merchant_name",
    "transaction_date",
    "category",
    "total_amount",
    "confidence_score",
    "items"
  ]
}
```

---

## 6. Spesifikasi Desain UI/UX per Halaman

### 6.1 Dashboard Proyek (`/projects/[id]`)
* **Header Ringkasan (Summary Cards):**
  * **Dana Awal:** `Rp 5.000.000`
  * **Total Pengeluaran:** `Rp 3.450.000` (dari 24 Nota)
  * **Sisa Saldo:** `Rp 1.550.000`
  * **Status Verifikasi:** `20 Terverifikasi` | `4 Perlu Dicek` (warna kuning mencolok)
* **Tombol Aksi Utama (Kanan Atas):**
  * `+ Unggah Nota` (Bisa pilih banyak foto sekaligus)
  * `Unduh LPJ (Excel / PDF)`
* **Tabel Daftar Nota:**
  * Kolom: `No. Ref` (`#001`), `Foto (Thumbnail)`, `Tanggal`, `Nama Toko`, `Kategori (Badge)`, `Total (Rp)`, `Status`, `Aksi (Periksa/Hapus)`.

### 6.2 Modal / Halaman Verifikasi Split-Screen (Komponen Paling Krusial)
Saat pengguna mengklik salah satu baris nota, buka tampilan layar belah (Modal *Full-screen* atau *Drawer* lebar):
* **Panel Kiri (50% Lebar) - Penampil Gambar Nota:**
  * Menampilkan foto struk asli.
  * Kontrol wajib: **Zoom In (+), Zoom Out (-), Putar 90 Derajat (Rotate)**, dan **Geser (Pan)**. Banyak pengguna memfoto struk dalam keadaan miring/terbalik.
* **Panel Kanan (50% Lebar) - Form Editor Hasil AI:**
  * Jika `confidence_score < 0.8`, tampilkan *Alert Banner* kuning di atas form berisi `warning_message` dari AI.
  * Input `Nama Toko`, `Tanggal`, `Kategori` (*Dropdown*), dan `Metode Bayar`.
  * **Tabel Rincian Item Dinamis:** Pengguna bisa mengedit nama barang, jumlah, harga satuan, atau klik `+ Tambah Baris` / `Hapus`.
  * **Kalkulator Selisih Otomatis:** Tampilkan perbandingan antara `Jumlah Total Item` vs `Total Akhir Nota`. Jika tidak sama, beri warna merah agar bendahara sadar ada angka yang salah baca.
  * **Footer Sticky:** Tombol `Simpan & Lanjut ke Nota Berikutnya (Shortcut: Ctrl + Enter)`. Ini membuat pengecekan 50 nota bisa selesai dalam 3 menit.

### 6.3 Desain Output PDF Lampiran LPJ
Dokumen PDF yang dihasilkan harus mengikuti format standar administrasi kepanitiaan Indonesia:
* **Halaman 1 (Rekapitulasi):**
  * Judul Proyek, Tanggal Cetak, Ringkasan Saldo.
  * Tabel Rekapitulasi Pengeluaran (No. Ref, Tanggal, Uraian/Toko, Kategori, Nominal).
  * Area Tanda Tangan di bagian bawah (Ketua Pelaksana & Bendahara).
* **Halaman 2 dan seterusnya (Lampiran Bukti Nota):**
  * Menggunakan *Grid Layout* **2 kolom x 2 baris** (4 nota per halaman A4) atau **2 kolom x 3 baris** (6 nota per halaman).
  * Setiap kotak memiliki *border* rapi, gambar nota yang di-*fit* proporsional (`object-contain`), dan *header* kotak bertuliskan: **`[ #NOTA-001 ] - 12 Nov 2026 - Indomaret (Rp 45.500)`**.

---

## 7. Logika Keamanan & Pembatasan Kuota (Edge Cases)
1. **Pemotongan Kuota yang Adil:** Kuota pengguna (`quota_balance`) **hanya dipotong 1** ketika AI berhasil mengembalikan respons JSON yang valid. Jika server AI *timeout* atau gambar gagal diproses karena error sistem, kuota tidak boleh berkurang.
2. **Deteksi Nota Duplikat:** Saat mengunggah banyak foto, hitung *hash* file atau cek kesamaan kombinasi (`tanggal` + `total_amount` + `merchant_name`) di dalam proyek yang sama. Jika sama persis, beri *badge* peringatan **"Kemungkinan Nota Ganda"** agar bendahara tidak menghitung pengeluaran dua kali.
3. **Penanganan Struk Panjang:** Untuk struk belanja bulanan yang sangat panjang, pengguna cukup memfotonya dalam 1 bingkai penuh (meskipun agak jauh) atau hanya memfoto bagian atas (nama toko) dan bawah (total akhir) jika tidak butuh rincian per barang. Berikan opsi *toggle* sebelum *upload*: **"Rekap Total Saja (Cepat)"** vs **"Ekstrak Rincian per Barang (Detail)"**.

---

## 8. Panduan Bertahap untuk Prompting ke AI (Implementation Roadmap)

Agar pembuatan aplikasi tidak berantakan, berikan instruksi ke AI *coding* kamu secara bertahap mengikuti urutan fase ini:

* **Fase 1 (Setup & UI Dasar):**
  > *"Baca file `desain.md`. Buat proyek Next.js (App Router) dengan Tailwind dan shadcn/ui. Buat halaman Dashboard Proyek (`/projects/[id]`) lengkap dengan komponen Summary Cards, Tabel Daftar Nota, dan Modal Split-Screen Verifikasi menggunakan data dummy terlebih dahulu."*
* **Fase 2 (Integrasi Database & Upload):**
  > *"Berdasarkan skema SQL di `desain.md`, buatkan konfigurasi Supabase client, fungsi autentikasi, dan fitur Bulk Image Upload yang mengompresi gambar di browser sebelum menyimpannya ke Supabase Storage."*
* **Fase 3 (Integrasi AI Vision OCR):**
  > *"Buatkan API Route `/api/ocr` yang menerima URL/base64 gambar nota, mengirimkannya ke Gemini Flash / OpenAI Vision menggunakan System Prompt dan JSON Schema dari Bagian 5 di `desain.md`, lalu menyimpan hasilnya ke tabel `receipts` dan `receipt_items`, serta mengurangi 1 `quota_balance` pengguna."*
* **Fase 4 (Fitur Export Excel & PDF LPJ):**
  > *"Implementasikan fitur ekspor berdasarkan Bagian 6.3 di `desain.md`. Buat fungsi untuk mengunduh file `.xlsx` (terdiri dari sheet Ringkasan dan Rincian) serta fungsi generator `.pdf` yang berisi tabel rekap di halaman pertama dan grid lampiran foto nota (4 nota per halaman A4) di halaman berikutnya."*
* **Fase 5 (Sistem Kuota & Pembayaran QRIS):**
  > *"Tambahkan logika pengecekan kuota sebelum upload dan buat halaman Top-up Kuota sederhana yang terintegrasi dengan webhook pembayaran QRIS."*