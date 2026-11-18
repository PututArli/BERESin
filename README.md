# BERESinHAHAY

Aplikasi web simpel tanpa batas kuota untuk:
1. **Rekap Foto Nota ke Excel & PDF LPJ**: Unggah puluhan foto struk belanja atau nota warung sekaligus, cek angkanya bila perlu di layar belah (`Ctrl+Enter`), lalu langsung unduh rekap `.xlsx` (3 lembar kerja) dan dokumen `.pdf` A4 lengkap kisi lampiran foto bernomor `#NOTA-001`.
2. **Kompres Foto Instan (`/kompres`)**: Kecilkan ukuran banyak foto sekaligus (`< 200 KB`, `< 500 KB`, `< 1 MB`) langsung di peramban dan unduh satuan atau dalam satu berkas `.zip`.

## Menjalankan Secara Lokal

```bash
npm install
npm run dev
```

Buka `http://localhost:3000` di peramban.

## Konfigurasi Lingkungan (`.env.local`)
Salin `.env.example` menjadi `.env.local`:
- `DATABASE_URL`: String koneksi PostgreSQL Supabase (skema SQL tersedia pada `supabase/schema.sql`).
- `GEMINI_API_KEY` *(opsional)*: Kunci Google Gemini 2.5 Flash API agar ekstraksi AI berjalan otomatis di sisi server (pengguna juga dapat memasukkan kunci sendiri melalui tombol **Kunci AI** di aplikasi).

## Memasang Gambar QR E-Wallet Donasi
Simpan gambar kode QR e-wallet Anda ke `public/qr-donasi.png`. Dialog **Donasi** pada aplikasi akan otomatis menampilkan gambar tersebut.
