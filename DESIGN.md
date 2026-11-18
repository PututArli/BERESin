# DESIGN.md: Sistem Identitas Visual BERESinHAHAY

## Design Read
Reading this as: Aplikasi web satu layar pengubah foto nota ke Excel/PDF serta pengompres foto instan tanpa batas kuota untuk kepanitiaan, staf kantor, dan UMKM di Indonesia, dalam gaya Lembar Kertas Bersih & Tinta Buku Kas (Calm Minimalist Ledger), dial ENERGY 1 / RHYTHM 1 / MOTION 1.

## Resolusi Aturan R-37 & R-23
1. **Lucide Icons vs R-04**: Menggunakan ikon SVG kustom bergaya garis dokumen kuitansi hanya pada kontrol yang membutuhkan penanda fungsi.
2. **Tanpa Data Simulasi vs R-38**: Sesuai arahan pemilik proyek, aplikasi sama sekali tidak memuat data contoh atau simulasi agar pengguna tidak bingung; layar awal langsung bersih pada kotak unggah nota asli.
3. **QR E-Wallet Donasi vs R-23**: Ruang QR donasi menampilkan kotak penanda jujur `[PLACEHOLDER QR E-WALLET]` sampai gambar QR asli ditaruh ke `public/qr-donasi.png`, dan otomatis menampilkan gambar tersebut begitu berkas tersedia.

## Jiwa & Karakter Produk
BERESinHAHAY membuang keramaian dashboard berlapis. Begitu pengguna membuka halaman, mereka langsung mengerti fungsi utamanya dalam satu pandangan: unggah foto nota, cek sekilas bila perlu, lalu langsung unduh Excel atau PDF LPJ. Fitur pendamping kompresi foto diletakkan di satu tab berdampingan dengan pola kerja yang sama sederhananya.

## Tiga Dial Liveliness
- **ENERGY: 1 (Calm)**: Tenang, lapang (`max-w-4xl`), satu kalimat judul utama, dan satu kotak unggah besar tanpa seksi pemasaran panjang yang memecah fokus.
- **RHYTHM: 1 (Uniform & Predictable)**: Pola interaksi konsisten di kedua alat (`Rekap Nota` dan `Kompres Foto`): kepala ringkas -> kotak unggah -> bilah unduh -> daftar berkas.
- **MOTION: 1 (Hover & state feedback only)**: Hanya perubahan warna/tepi instan pada `:hover`, `:active`, `:focus-visible`, serta transformasi langsung saat memutar/memperbesar gambar struk; mematuhi `prefers-reduced-motion: reduce`.

## Palet Warna (Maksimal 3 Warna Inti + 1 Aksen, R-29)
Seluruh pasangan teks memenuhi WCAG AA (`>= 4.5:1` teks normal) dan batas kontrol interaktif memenuhi kontras non-teks (`>= 3.0:1`) pada kedua tema (`R-25`, `R-34`).

### Tema Terang ("Kertas Arsip")
- **Inti 1 (Kertas Hangat)**: Latar halaman `#F6F2EA`, permukaan kartu `#FDFBF7`, latar kepala `#ECE6DA`, teks utama `#181B19` (`15.55:1`), teks sekunder `#434B46` (`8.06:1`), teks keterangan `#525B55` (`6.30:1`), batas kontrol `#707A73` (`>= 3.58:1`).
- **Inti 2 (Hijau Buku Kas)**: `#164231` dengan teks `#FDFBF7` (`10.94:1`); latar status sah `#E2F0EA` dengan teks `#164231` (`9.63:1`).
- **Inti 3 (Kuning Pemeriksaan)**: Khusus status `Perlu Dicek`; latar `#FEF3C7`, teks `#78350F` (`8.15:1`), tepi `#92400E` (`6.86:1`).
- **Aksen Tunggal (Merah-Bata Stempel)**: `#A82819` dengan teks `#FDFBF7` (`6.81:1`); dipakai terukur pada aksi utama unggah/pengesahan dan peringatan selisih angka.

### Tema Gelap ("Meja Malam")
- **Inti 1 (Meja Malam)**: Latar halaman `#141715`, permukaan `#1C211E`, latar kepala `#252C28`, teks utama `#F2EFE9` (`14.23:1`), teks sekunder `#C4CCC7` (`8.72:1`), teks keterangan `#A3AEA7` (`6.24:1`), batas kontrol `#8E9B93` (`>= 4.94:1`).
- **Inti 2 (Hijau Kas Malam)**: `#6EE7B7` dengan teks tombol `#10281E` (`10.25:1`); latar status sah `#163026` dengan teks `#6EE7B7` (`9.28:1`).
- **Inti 3 (Kuning Pemeriksaan Malam)**: Latar `#33240B`, teks `#FCD34D` (`10.42:1`), tepi `#D97706`.
- **Aksen Tunggal (Merah Stempel Malam)**: Tombol aksen `#A82819` berteks `#FDFBF7` (`6.81:1`) dengan tepi `#FCA5A5` (`8.61:1`), serta teks peringatan `#FCA5A5` di atas `#3B1816` (`8.33:1`).

## Tipografi (R-06)
- **Antarmuka (`Plus Jakarta Sans`)**: Proporsi huruf lugas dan mudah dipindai cepat untuk label bahasa Indonesia.
- **Judul Halaman (`Newsreader`)**: Memberi karakter lembar dokumen yang tenang dan jelas membedakan judul utama dari tombol kerja.
- **Angka & Kode Nota (`IBM Plex Mono` `tabular-nums`)**: Menjaga kesejajaran vertikal nominal Rupiah, ukuran kilobyte foto, dan kode `#NOTA-001`.

## Motif Identitas
Garis atas hijau buku kas berpasangan dengan label kode persegi `.stamp-ref` (`#NOTA-001`) berhuruf monospace tabular dari layar web hingga dokumen PDF A4.

## Alasan Satu Baris Setiap Keputusan Utama (R-31)
- **Palet Warna**: Kertas krem hangat dan hijau buku kas menjaga mata tetap rileks tanpa silau putih mentah saat mengunggah banyak struk.
- **Aksen Merah-Bata**: Satu aksen warna dipakai khusus pada tombol aksi utama dan penanda selisih hitung agar pengguna langsung melihat langkah berikutnya.
- **Tata Letak Satu Kolom Terpusat**: Lebar `max-w-4xl` dengan ruang kosong lega menghilangkan kesan padat sehingga pengguna baru langsung paham alur unggah-lalu-unduh.
- **Tipografi**: Kombinasi serif tenang pada judul, sans-serif bersih pada kontrol, dan monospace tabular pada angka memisahkan instruksi dari data.
- **Jarak & Spasi**: Jeda antarblok diperlebar dan opsi lanjutan (penanda tangan LPJ) disimpan dalam lipatan `<details>` agar tampilan awal tetap bersih.
- **Sudut Komponen**: Sudut tegas (`2px` cap kode, `6px` tombol/input, `8px` kotak unggah) selaras dengan karakter potongan kertas kuitansi.
- **Bayangan**: Seluruh kartu di halaman dibuat rata bergaris batas tegas, sedangkan bayangan hanya dipakai pada dialog modal yang mengambang di atas layar.
- **Daftar Ringkas vs Kartu**: Bukti nota dan hasil kompresi foto ditampilkan sebagai baris ringkas satu lajur agar mudah diunduh atau diperiksa tanpa tabel berlapis.
- **Ikon SVG Kustom**: Hanya memakai ikon fungsional sederhana (unggah, unduh Excel, unduh PDF, kompres foto, putar, perbesar, hapus, donasi QR).
