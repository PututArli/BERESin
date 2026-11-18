# DESIGN.md: Sistem Identitas Visual BERESin

## Design Read
Reading this as: Aplikasi web rekapitulasi nota & generator LPJ otomatis (Halaman Depan Ringkas + Workspace Buku Kas) untuk bendahara kepanitiaan, staf reimbursement, dan pemilik UMKM di Indonesia, dalam gaya Buku Kas Kertas Arsip & Tinta Stempel, dial ENERGY 2 / RHYTHM 2 / MOTION 1.

## Resolusi Aturan R-37 (Catatan Konflik PRD)
1. **Lucide Icons vs R-04**: Pemilik proyek memilih melepas Lucide Icons dari PRD dan menerapkan R-04 menggunakan set ikon SVG dokumen/audit kustom yang dipakai hanya saat relevan secara fungsional.
2. **Data Dummy Fase 1 vs R-38**: Pemilik proyek memilih melepas data dummy tersamar dan menerapkan R-38 melalui Empty State jujur yang dilengkapi tombol eksplisit pemuat sampel berlabel jelas `[DATA SIMULASI]`.

## Jiwa & Karakter Produk
BERESin menerjemahkan tradisi fisik pembukuan bendahara Indonesia (buku kas kuitansi bergaris ganda hijau tua, kertas arsip hangat yang tidak menyilaukan mata saat memeriksa puluhan struk, serta stempel pengesahan merah-bata) menjadi meja kerja digital yang cepat dan terstruktur.

## Tiga Dial Liveliness
- **ENERGY: 2 (Balanced)**: Tegas melalui garis ganda kepala tabel buku kas, kontras tipografi serif-sans, dan cap referensi `#NOTA-001`, tanpa dekorasi berlebihan yang mengganggu konsentrasi hitung angka.
- **RHYTHM: 2 (Consistent with deliberate breaks)**: Halaman depan berganti ritme dari blok pembuka asimetris (narasi masalah + lembar simulasi pembacaan struk) ke alur kerja bernomor 4 tahap nyata dan perbandingan 2 paket kuota top-up; halaman kerja proyek konsisten agar mata bendahara cepat memindai baris.
- **MOTION: 1 (Hover & state feedback only)**: Hanya perubahan warna/tepi instan pada `:hover`, `:active`, `:focus-visible`, dan transformasi langsung saat memutar/memperbesar gambar struk; nol animasi mengambang atau berkedip berulang, serta mematuhi `prefers-reduced-motion: reduce`.

## Palet Warna (Maksimal 3 Warna Inti + 1 Aksen, R-29)
Seluruh pasangan teks memenuhi WCAG AA (>= 4.5:1 teks normal, >= 3.0:1 teks besar) dan seluruh batas kontrol interaktif memenuhi kontras non-teks >= 3.0:1 pada kedua tema (R-25, R-34).

### Tema Terang ("Kertas Arsip")
- **Inti 1 (Kertas Buku Kas / Netral Hangat)**: Latar halaman `#F6F2EA`, permukaan lembar `#FDFBF7`, kepala tabel `#ECE6DA`, teks utama `#181B19` (15.55:1), teks sekunder `#434B46` (8.06:1), teks keterangan `#525B55` (6.30:1), batas kontrol `#707A73` (>= 3.58:1).
- **Inti 2 (Hijau Tinta Buku Kas)**: `#164231` dengan teks `#FDFBF7` (10.94:1); latar lencana terverifikasi `#E2F0EA` dengan teks `#164231` (9.63:1) dan tepi `#3B6E58` (5.71:1).
- **Inti 3 (Kuning-Cokelat Pemeriksaan Audit)**: Khusus penanda status `Perlu Dicek` dan peringatan akurasi AI rendah; latar `#FEF3C7`, teks `#78350F` (8.15:1), tepi `#92400E` (6.86:1).
- **Aksen Tunggal (Merah-Bata Stempel Pengesahan & Selisih)**: `#A82819` dengan teks `#FDFBF7` (6.81:1), serta teks peringatan `#942012` di atas `#FDECE9` (7.42:1); dipakai terukur hanya pada cap validasi utama, penanda selisih nominal nota, dan fokus aksi kritis.

### Tema Gelap ("Meja Malam")
- **Inti 1 (Meja Kerja Malam)**: Latar halaman `#141715`, permukaan lembar `#1C211E`, kepala tabel `#252C28`, teks utama `#F2EFE9` (14.23:1), teks sekunder `#C4CCC7` (8.72:1), teks keterangan `#A3AEA7` (6.24:1), batas kontrol `#8E9B93` (>= 4.94:1).
- **Inti 2 (Hijau Kas Malam)**: `#6EE7B7` dengan teks tombol `#10281E` (10.25:1); latar lencana terverifikasi `#163026` dengan teks `#6EE7B7` (9.28:1).
- **Inti 3 (Kuning Audit Malam)**: Latar `#33240B`, teks `#FCD34D` (10.42:1), tepi `#D97706`.
- **Aksen Tunggal (Merah Stempel Malam)**: Tombol aksen `#A82819` berteks `#FDFBF7` (6.81:1) dengan tepi `#FCA5A5` (8.61:1 terhadap latar gelap), serta teks peringatan `#FCA5A5` di atas `#3B1816` (8.33:1).

## Tipografi (R-06)
- **Antarmuka & Tabel (`Plus Jakarta Sans`)**: Dirancang dengan proporsi huruf yang jernih untuk kosakata bahasa Indonesia pada label formulir dan tabel padat.
- **Judul Dokumen & Kepala LPJ (`Newsreader` / Serif Arsip)**: Memberi wibawa dokumen pertanggungjawaban resmi dan membedakan hierarki judul halaman dari kontrol kerja.
- **Kode Referensi & Angka Rupiah (`IBM Plex Mono` dengan `tabular-nums`)**: Menjaga kesejajaran vertikal digit ribuan Rupiah (`Rp 1.550.000`) dan nomor urut `#NOTA-001` agar mudah diaudit dari atas ke bawah.

## Motif Identitas
Garis ganda buku kas (`border-double` / pita kepala kolom bergaris ganda) yang berpasangan dengan cap referensi bersudut tegas `[ #NOTA-001 ]` berhuruf monospace tabular di tabel rekap, modal periksa, dan cetakan PDF LPJ.

## Alasan Satu Baris Setiap Keputusan Utama (R-31)
- **Palet Warna**: Kertas krem hangat dan hijau tinta buku kas mengurangi kelelahan mata saat memeriksa puluhan foto struk sekaligus mengingatkan pada buku kas kuitansi Indonesia.
- **Aksen Merah-Bata**: Satu aksen warna stempel dipakai khusus pada tombol pengesahan nota dan peringatan selisih matematika agar mata bendahara langsung menangkap titik keputusan.
- **Tata Letak Halaman**: Setiap layar dibangun mengelilingi satu keputusan kerja (membuat proyek, mengunggah & menyaring nota yang perlu dicek, atau membandingkan foto struk di kiri dengan rincian angka di kanan).
- **Tipografi**: Perpaduan serif arsip pada judul laporan, Plus Jakarta Sans pada kontrol kerja, dan monospace tabular pada nominal Rupiah memisahkan narasi dokumen dari angka yang sedang diaudit.
- **Jarak & Spasi**: Spasi rapat terukur di dalam tabel dan panel verifikasi meminimalkan gulir layar, sedangkan jeda vertikal lebar memisahkan blok ringkasan saldo dari daftar bukti transaksi.
- **Sudut Komponen (Border Radius)**: Sudut tajam-terukur (`2px` pada lencana cap nomor nota, `6px` pada input/tombol, `8px` pada panel dokumen) mencerminkan potongan kertas nota dan kuitansi fisik, bukan gelembung aplikasi generik.
- **Bayangan (Shadow)**: Permukaan tabel dan kartu dibuat rata dengan garis batas tegas, sementara bayangan hanya diberikan pada modal layar belah verifikasi dan dialog top-up sebagai penanda elevasi lapisan di atas halaman.
- **Penggunaan Kartu vs Tabel**: Ringkasan kas memakai satu pita neraca bersekat (bukan 4 kartu identik), dan daftar nota memakai tabel lajur padat di desktop yang berubah menjadi tumpukan kartu kuitansi di layar ponsel.
- **Ikon SVG Kustom**: Setiap ikon menggambar objek fisik tugas bendahara (kuitansi bergerigi, putar 90 derajat, kaca pembesar, lembar Excel, dokumen A4, stempel centang) sehingga tidak ada ikon hiasan tanpa fungsi.
