# DESIGN.md: Sistem Identitas Visual BERESin

## Design Read
Reading this as: Aplikasi web penyusun laporan keuangan LPJ otomatis dari foto struk dan pengecil ukuran banyak foto sekaligus untuk kepanitiaan, mahasiswa, staf kantor, dan UMKM di Indonesia, dalam gaya Lembar Kertas Bersih & Tinta Buku Kas (Calm Minimalist Ledger), dial ENERGY 1 / RHYTHM 1 / MOTION 1.

## Resolusi Aturan R-37 & R-23
1. **Ikon Garis Kuitansi Kustom (R-04)**: Memakai ikon SVG bergaris tegas (`strokeWidth="2"`, sudut `square`/`miter`) hanya pada tombol aksi agar mudah dikenali fungsinya.
2. **Tanpa Data Contoh Palsu (R-38)**: Layar awal langsung menampilkan kotak unggah bersih tanpa data simulasi agar pengguna tidak bingung.
3. **QRIS Donasi Asli (`public/qris-beresin.jpeg`)**: Menampilkan gambar QRIS resmi `BERESin, Service` dengan bingkai putih berdimensi intrinsik penuh (`1136x1600`) sehingga tetap mudah dipindai kamera di mode terang maupun gelap.

## Jiwa & Karakter Produk
BERESin membuang keramaian dashboard berlapis dan istilah teknis mesin. Begitu pengguna membuka halaman, mereka langsung mengerti fungsinya: pilih foto struk, cek sebentar jika ada tulisan buram, lalu unduh laporan LPJ yang kalimat pengantar, tabel dana, tanda tangan, dan lampiran fotonya sudah tersusun otomatis dalam berbagai format file (`.pdf`, `.docx`, `.xlsx`, `.csv`, `.html`, `.txt`).

## Tiga Dial Liveliness
- **ENERGY: 1 (Calm)**: Tenang, lapang (`max-w-4xl`), satu kalimat judul lugas, dan satu kotak unggah utama tanpa bagian promosi panjang.
- **RHYTHM: 1 (Uniform & Predictable)**: Alur konsisten di `Rekap Nota` dan `Kompres Foto`: judul singkat -> kotak unggah -> panel unduh -> daftar berkas, dilengkapi halaman `Cara Pakai` berstruktur buku pedoman.
- **MOTION: 1 (Hover & state feedback only)**: Umpan balik instan tanpa jeda pada `:hover`, `:active`, dan `:focus-visible`, ditambah pembaruan antarmuka optimistik (`local-first`) sehingga tombol merespons seketika tanpa menunggu jaringan.

## Palet Warna Terverifikasi WCAG AA (R-25, R-29, R-34)
Seluruh pasangan teks memenuhi WCAG AA (`>= 4.5:1`) dan batas kontrol interaktif memenuhi kontras non-teks (`>= 3.0:1`) berdasarkan perhitungan `contrast-check.py`.

### Mode Terang ("Kertas Arsip")
- **Inti 1 (Kertas Hangat)**: Latar halaman `#F6F2EA`, permukaan `#FDFBF7`, latar lembut `#ECE6DA`, teks utama `#181B19` (`15.55:1`), teks sekunder `#434B46` (`8.06:1`), teks redup `#525B55` (`6.30:1`), tepi kartu `#C5BDB0`, tepi kontrol `#707A73` (`>= 3.58:1`).
- **Inti 2 (Hijau Buku Kas)**: `#164231` berteks `#FDFBF7` (`10.94:1`); latar status cocok `#E2F0EA` berteks `#164231` (`9.63:1`).
- **Inti 3 (Kuning Cek Angka)**: Latar `#FEF3C7`, teks `#78350F` (`8.15:1`), tepi `#92400E` (`6.86:1`).
- **Aksen Tunggal (Merah Stempel)**: `#A82819` berteks `#FDFBF7` (`6.81:1`) khusus pada aksi utama unggah/unduh PDF dan penanda selisih hitung.

### Mode Gelap ("Meja Redup Nyaman")
Dirancang dengan `color-scheme: dark` serta pemisahan antara tepi kartu pasif (`#343F3A`) dan tepi kontrol interaktif (`#73807A`) agar nyaman dilihat lama di layar laptop maupun ponsel tanpa garis neon menyilaukan:
- **Inti 1 (Arang Hangat)**: Latar halaman `#131615`, permukaan `#1B201E`, latar lembut `#242B28`, teks utama `#F3F1EC` (`14.63:1`), teks sekunder `#C4CCC8` (`10.08:1`), teks redup `#9CA7A2` (`6.65:1`), tepi kontrol `#73807A` (`4.01:1` pada permukaan, `4.42:1` pada latar), tepi aksen panel `#4B8B6F` (`4.11:1`).
- **Inti 2 (Hijau Sage Lembut)**: Tombol `#47B889` berteks gelap `#0B2219` (`6.75:1`, hover `#5ECF9F` `8.67:1`); status cocok `#162C23` berteks `#7CE6B9` (`9.78:1`).
- **Inti 3 (Kuning Cek Malam)**: Latar `#2E220E`, teks `#FCD34D` (`10.78:1`), tepi `#C88A1E` (`5.26:1`).
- **Aksen Tunggal (Merah Terakota)**: Tombol `#B83221` berteks `#FFFDFB` (`5.89:1`, hover `#9E291A` `7.43:1`), serta kotak peringatan `#341815` berteks `#FCA5A5` (`8.59:1`), cincin fokus `#FCD34D` (`11.45:1`).

## Alasan Satu Baris Setiap Keputusan Utama (R-31)
- **Palet Mode Terang & Gelap**: Kertas krem hangat di siang hari dan arang-sage redup tanpa garis neon di malam hari menjaga mata tidak cepat lelah di monitor maupun ponsel.
- **Pemisahan Tepi Kartu vs Kontrol**: Kartu pembungkus memakai garis tenang (`--border-card`), sedangkan tombol dan kolom isian memakai garis tegas (`--border-control` `>= 3:1`) agar mata langsung mengenali bagian yang bisa diklik.
- **Bahasa Sehari-hari Tanpa Istilah Mesin**: Mengganti label teknis menjadi kalimat awam (*Catat nama tiap barang* vs *Catat total belanja saja*) agar bendahara kepanitiaan maupun warga umum langsung paham tanpa menebak-nebak.
- **Uraian LPJ & Multi-Ekstensi Otomatis**: Menyusun paragraf laporan otomatis dan mendukung unduhan `.pdf`, `.docx`, `.xlsx`, `.csv`, `.html`, serta `.txt` karena tiap organisasi memiliki kebutuhan format pengumpulan yang berbeda.
- **Arsitektur Local-First Tanpa Jeda**: Menyimpan ke IndexedDB lokal terlebih dulu dan menyinkronkan database di latar belakang agar seluruh tombol bereaksi instan tanpa *delay* jaringan.
- **Tipografi**: Kombinasi `Newsreader` pada judul, `Plus Jakarta Sans` pada antarmuka, dan `IBM Plex Mono` (`tabular-nums`) pada nominal Rupiah menjaga keterbacaan angka sejajar.
