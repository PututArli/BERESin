import type { Metadata } from "next";
import Link from "next/link";
import {
  PhotoCompressIcon,
  ReceiptSheetIcon,
  StampCheckIcon,
} from "@/components/icons/LedgerIcons";

export const metadata: Metadata = {
  title: "Cara Pakai & Syarat Foto Struk",
  description:
    "Panduan lengkap memakai BERESin untuk menyusun laporan LPJ otomatis ke PDF, Word, Excel, CSV, HTML, dan cara mengecilkan ukuran banyak foto sekaligus.",
};

const REKAP_STEPS = [
  {
    num: "01",
    title: "Pilih cara catat struk & masukkan foto nota",
    body: "Pilih Catat nama tiap barang bila Anda butuh rincian setiap barang, jumlah beli, dan harga satuannya tertulis satu per satu. Pilih Catat total belanja saja bila hanya butuh nama toko, tanggal, dan total akhirnya. Klik Pilih Foto Struk (Bisa Banyak Sekaligus) untuk memasukkan banyak foto dari galeri HP atau laptop. Untuk pengeluaran yang tidak ada kertas struknya (seperti parkir atau iuran), klik Tambah pengeluaran tanpa foto struk.",
  },
  {
    num: "02",
    title: "Angka struk dibaca & diberi nomor urut otomatis",
    body: "Setiap foto yang masuk langsung diberi kode urut (#NOTA-001, #NOTA-002, dan seterusnya), lalu dibaca nama tokonya, tanggal belanja, kategori pengeluaran, dan nominalnya. Bila ada foto yang tidak sengaja terunggah dua kali, baris tersebut diberi tanda Mirip dengan nota sebelumnya.",
  },
  {
    num: "03",
    title: "Cek sebentar nota yang bertanda Perlu dicek",
    body: "Jika tulisan struk sangat jelas dan hitungan angkanya pas, statusnya langsung Sudah pas. Jika kertas struk agak pudar atau terlipat, klik tombol Cek angkanya untuk melihat foto struk berdampingan dengan kolom angka: Anda bisa memperbesar foto, memutar foto 90 derajat bila miring, membetulkan angka jika perlu, lalu menekan Sudah Pas & Lanjut.",
  },
  {
    num: "04",
    title: "Kalimat LPJ tersusun otomatis & pilih format unduhan",
    body: "Ketik Judul Laporan (serta dana awal dan nama Ketua/Bendahara bila diperlukan). BERESin otomatis merangkai kalimat pembuka LPJ, uraian penggunaan dana, sisa/kurang saldo, rincian kategori, kalimat penutup, hingga lembar tanda tangan. Anda tinggal klik unduh ke format PDF (.pdf), Word (.docx), Excel (.xlsx), CSV (.csv), Halaman Web (.html), atau Teks Ringkas (.txt).",
  },
];

const SPEC_ROWS = [
  {
    aspect: "Jenis file foto yang diterima",
    spec: "JPG / JPEG, PNG, dan WebP",
    note: "Sistem mengecek keaslian file foto. File selain foto tersebut (misalnya PDF atau dokumen teks) tidak dapat dimasukkan.",
  },
  {
    aspect: "Ukuran dimensi foto struk minimal",
    spec: "Minimal 600 x 800 piksel (disarankan 900 x 1200 piksel ke atas)",
    note: "Tulisan pada kertas struk kasir berukuran kecil. Jika foto terlalu kecil atau pecah, angka 3, 5, 6, dan 8 bisa tampak mirip.",
  },
  {
    aspect: "Batas berat file per foto",
    spec: "Maksimal 25 MB per 1 file foto",
    note: "Foto langsung dari kamera HP (misalnya 4 MB sampai 15 MB) boleh langsung dimasukkan karena ukurannya otomatis diringankan oleh aplikasi.",
  },
  {
    aspect: "Jumlah foto sekali masuk",
    spec: "Bisa puluhan foto sekaligus",
    note: "Gratis dipakai sepuasnya tanpa perlu daftar akun. Jika foto nota mencapai ratusan lembar, masukkan bertahap per 20 s.d. 30 foto agar HP tetap ringan.",
  },
  {
    aspect: "Cara foto struk yang panjang",
    spec: "Utuh dari nama toko sampai total bayar",
    note: "Untuk struk belanja minimarket/supermarket yang panjang, potret tegak lurus dari atas agar nama toko di atas dan baris Total di bawah tidak terpotong.",
  },
];

const EXPORT_FORMATS = [
  {
    ext: "PDF (.pdf)",
    desc: "Dokumen siap cetak A4 dan kirim WhatsApp: lengkap berisi kalimat LPJ otomatis, tabel dana, tanda tangan, serta halaman lampiran foto struk (pilihan 4 atau 6 foto per halaman).",
  },
  {
    ext: "Word (.docx)",
    desc: "Dokumen Microsoft Word / Google Docs yang bisa diedit bebas jika Anda ingin menambahkan kop surat organisasi: sudah berisi kalimat LPJ, tabel, tanda tangan, dan foto struk.",
  },
  {
    ext: "Excel (.xlsx)",
    desc: "Tabel Microsoft Excel 3 lembar kerja (Laporan & Ringkasan, Daftar Nota, dan Rincian Barang) lengkap dengan rumus penjumlahan otomatis.",
  },
  {
    ext: "CSV (.csv)",
    desc: "Tabel ringan untuk dibuka langsung di Google Sheets atau diimpor ke aplikasi catatan kas lain.",
  },
  {
    ext: "Web (.html)",
    desc: "Satu file laporan mandiri berisi teks LPJ, tabel, dan foto struk yang bisa dibuka di browser HP maupun laptop tanpa internet.",
  },
  {
    ext: "Teks (.txt)",
    desc: "Ringkasan laporan berbentuk tulisan rapi yang praktis disalin dan ditempel langsung ke grup WhatsApp panitia atau kantor.",
  },
];

const FAQ_ITEMS = [
  {
    q: "Apa bedanya pilihan 'Catat nama tiap barang' dan 'Catat total belanja saja'?",
    a: "Jika memilih 'Catat nama tiap barang', semua daftar belanjaan di dalam struk (misalnya Air Mineral 2 dus, Roti 10 bungkus) ikut dicatat satu per satu ke tabel rincian. Jika memilih 'Catat total belanja saja', aplikasi cukup mengambil nama toko, tanggal, dan angka total bayar akhirnya saja sehingga proses baca struk lebih cepat.",
  },
  {
    q: "Apakah saya harus mengetik kata-kata pengantar LPJ sendiri?",
    a: "Tidak perlu. Begitu Anda mengisi judul kegiatan dan memasukkan foto nota (serta dana awal jika ada), kalimat pembuka, penjelasan pemakaian dana, sisa saldo, rincian kategori, hingga kalimat penutup otomatis dibuatkan sesuai data Anda.",
  },
  {
    q: "Kenapa foto dari iPhone (.HEIC) tidak bisa langsung masuk?",
    a: "Sebagian browser belum mendukung format khusus iPhone (.HEIC). Agar kamera iPhone selalu menyimpan dalam bentuk JPG biasa, buka Pengaturan -> Kamera -> Format lalu pilih Paling Kompatibel (Most Compatible).",
  },
  {
    q: "Apakah catatan nota saya hilang kalau tidak sengaja menutup browser?",
    a: "Tidak hilang. Daftar nota yang sudah masuk tersimpan otomatis di browser perangkat Anda dan disinkronkan di latar belakang sampai Anda menekan tombol Hapus Semua.",
  },
  {
    q: "Apakah foto pribadi yang saya kecilkan di menu Kompres Foto aman?",
    a: "Aman karena seluruh proses pengecilan ukuran foto di halaman Kompres Foto berlangsung langsung di dalam HP atau laptop Anda sendiri tanpa dikirim ke server luar.",
  },
];

export default function PanduanPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-10 md:py-12 space-y-8 sm:space-y-10">
      <section className="space-y-4">
        <div className="space-y-2">
          <h1 className="font-serif-ledger font-bold text-[clamp(1.7rem,4vw,2.4rem)] leading-tight text-[var(--ink-primary)] tracking-tight">
            Petunjuk Pemakaian &amp; Syarat Foto Struk
          </h1>
          <p className="text-sm sm:text-base text-[var(--ink-secondary)] max-w-2xl">
            Panduan lengkap menyusun laporan keuangan LPJ otomatis ke berbagai jenis file, ukuran foto struk yang pas, serta cara mengecilkan ukuran banyak foto sekaligus.
          </p>
        </div>

        <nav
          aria-label="Daftar isi panduan"
          className="flex flex-wrap items-center gap-2 pt-1"
        >
          <a
            href="#cara-rekap-nota"
            className="btn-secondary !py-1.5 !px-3 text-xs no-underline"
          >
            1. Cara Rekap Nota
          </a>
          <a
            href="#syarat-foto-struk"
            className="btn-secondary !py-1.5 !px-3 text-xs no-underline"
          >
            2. Ukuran &amp; Tips Foto Struk
          </a>
          <a
            href="#pilihan-format-ekspor"
            className="btn-secondary !py-1.5 !px-3 text-xs no-underline"
          >
            3. Pilihan Format File LPJ
          </a>
          <a
            href="#cara-kompres-foto"
            className="btn-secondary !py-1.5 !px-3 text-xs no-underline"
          >
            4. Kompres Banyak Foto
          </a>
          <a
            href="#tanya-jawab"
            className="btn-secondary !py-1.5 !px-3 text-xs no-underline"
          >
            5. Tanya Jawab
          </a>
        </nav>
      </section>

      <section
        id="cara-rekap-nota"
        aria-labelledby="heading-rekap"
        className="scroll-mt-6 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2
            id="heading-rekap"
            className="font-serif-ledger font-bold text-xl sm:text-2xl text-[var(--ink-primary)]"
          >
            1. Cara Menyusun Laporan LPJ dari Foto Struk
          </h2>
          <Link href="/" className="btn-stamp text-xs sm:text-sm no-underline">
            <ReceiptSheetIcon className="w-4 h-4 shrink-0" />
            <span>Buka Rekap Nota</span>
          </Link>
        </div>

        <ol className="rounded-[8px] bg-[var(--bg-surface)] border-2 border-[var(--border-strong)] divide-y divide-[var(--border-subtle)]">
          {REKAP_STEPS.map((step) => (
            <li
              key={step.num}
              className="p-4 sm:p-5 flex flex-col sm:flex-row gap-3 sm:gap-4"
            >
              <div className="shrink-0">
                <span className="stamp-ref">LANGKAH {step.num}</span>
              </div>
              <div className="space-y-1 min-w-0">
                <h3 className="font-bold text-base text-[var(--ink-primary)]">
                  {step.title}
                </h3>
                <p className="text-sm text-[var(--ink-secondary)] leading-relaxed">
                  {step.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section
        id="syarat-foto-struk"
        aria-labelledby="heading-syarat"
        className="scroll-mt-6 space-y-4"
      >
        <div className="space-y-1">
          <h2
            id="heading-syarat"
            className="font-serif-ledger font-bold text-xl sm:text-2xl text-[var(--ink-primary)]"
          >
            2. Ukuran Minimal &amp; Tips Memotret Struk
          </h2>
          <p className="text-sm text-[var(--ink-secondary)]">
            Ketentuan foto struk belanja atau nota warung agar tulisan dan angkanya langsung terbaca jelas.
          </p>
        </div>

        <div className="rounded-[8px] bg-[var(--bg-surface)] border border-[var(--border-card)] overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-[var(--bg-subtle)] border-b border-[var(--border-card)]">
                <th className="py-3 px-4 font-bold text-xs uppercase text-[var(--ink-primary)] w-1/4 min-w-[150px]">
                  Hal
                </th>
                <th className="py-3 px-4 font-bold text-xs uppercase text-[var(--ink-primary)] w-1/3 min-w-[180px]">
                  Ukuran &amp; Ketentuan
                </th>
                <th className="py-3 px-4 font-bold text-xs uppercase text-[var(--ink-primary)] min-w-[230px]">
                  Penjelasan Mudah
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {SPEC_ROWS.map((row) => (
                <tr key={row.aspect}>
                  <td className="py-3.5 px-4 font-semibold text-[var(--ink-primary)] align-top">
                    {row.aspect}
                  </td>
                  <td className="py-3.5 px-4 font-mono-tabular font-semibold text-[var(--ink-primary)] align-top">
                    {row.spec}
                  </td>
                  <td className="py-3.5 px-4 text-[var(--ink-secondary)] align-top">
                    {row.note}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div
            className="rounded-[8px] border p-4 sm:p-5 space-y-2.5"
            style={{
              backgroundColor: "var(--verified-bg)",
              borderColor: "var(--verified-border)",
            }}
          >
            <h3
              className="font-bold text-sm sm:text-base flex items-center gap-2"
              style={{ color: "var(--verified-ink)" }}
            >
              <StampCheckIcon className="w-4 h-4 shrink-0" />
              <span>Cara Foto yang Bagus</span>
            </h3>
            <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm text-[var(--ink-primary)]">
              <li>Taruh kertas struk di meja datar yang warnanya tidak putih polos agar tepi kertas terlihat jelas.</li>
              <li>Ratakan dulu lipatan kertas struk supaya baris harga tidak tertutup lipatan.</li>
              <li>Arahkan kamera HP tegak lurus dari atas hingga struk memenuhi sebagian besar layar.</li>
              <li>Pastikan tempat cukup terang tanpa tertutup bayangan tangan atau HP.</li>
            </ul>
          </div>

          <div
            className="rounded-[8px] border p-4 sm:p-5 space-y-2.5"
            style={{
              backgroundColor: "var(--stamp-tint-bg)",
              borderColor: "var(--stamp-tint-border)",
            }}
          >
            <h3
              className="font-bold text-sm sm:text-base"
              style={{ color: "var(--stamp-tint-ink)" }}
            >
              Yang Sebaiknya Dihindari
            </h3>
            <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm text-[var(--ink-primary)]">
              <li>Menyalakan lampu kilat (flash) tepat dari atas kertas struk licin karena menimbulkan pantulan putih.</li>
              <li>Memotret terlalu jauh sehingga kertas struk tampak sangat kecil di tengah foto.</li>
              <li>Memotong bagian bawah struk tempat angka Total Bayar tertulis.</li>
              <li>Menumpuk beberapa struk sekaligus dalam 1 foto (sebaiknya 1 foto untuk 1 struk agar nomor urut bukti rapi).</li>
            </ul>
          </div>
        </div>
      </section>

      <section
        id="pilihan-format-ekspor"
        aria-labelledby="heading-ekspor"
        className="scroll-mt-6 space-y-4"
      >
        <div className="space-y-1">
          <h2
            id="heading-ekspor"
            className="font-serif-ledger font-bold text-xl sm:text-2xl text-[var(--ink-primary)]"
          >
            3. Pilihan Jenis File Laporan LPJ yang Bisa Diunduh
          </h2>
          <p className="text-sm text-[var(--ink-secondary)]">
            Semua jenis file di bawah ini otomatis menyertakan kalimat uraian LPJ sesuai data yang Anda masukkan.
          </p>
        </div>

        <dl className="rounded-[8px] bg-[var(--bg-surface)] border border-[var(--border-card)] divide-y divide-[var(--border-subtle)]">
          {EXPORT_FORMATS.map((f) => (
            <div
              key={f.ext}
              className="p-4 flex flex-col sm:flex-row sm:items-baseline gap-1.5 sm:gap-4"
            >
              <dt className="font-mono-tabular font-bold text-sm text-[var(--ink-primary)] sm:w-44 shrink-0">
                {f.ext}
              </dt>
              <dd className="text-xs sm:text-sm text-[var(--ink-secondary)]">
                {f.desc}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section
        id="cara-kompres-foto"
        aria-labelledby="heading-kompres"
        className="scroll-mt-6 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2
            id="heading-kompres"
            className="font-serif-ledger font-bold text-xl sm:text-2xl text-[var(--ink-primary)]"
          >
            4. Cara Mengecilkan Ukuran Banyak Foto Sekaligus
          </h2>
          <Link
            href="/kompres"
            className="btn-ledger text-xs sm:text-sm no-underline"
          >
            <PhotoCompressIcon className="w-4 h-4 shrink-0" />
            <span>Buka Kompres Foto</span>
          </Link>
        </div>

        <div className="rounded-[8px] bg-[var(--bg-surface)] border border-[var(--border-card)] p-4 sm:p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <h3 className="font-bold text-base text-[var(--ink-primary)]">
                Langkah Mudah Kompres Banyak Foto
              </h3>
              <ol className="list-decimal pl-5 space-y-1.5 text-sm text-[var(--ink-secondary)]">
                <li>
                  Pilih batas ukuran hasil yang diinginkan (<strong>Di bawah 200 KB</strong>, <strong>Di bawah 500 KB</strong>, atau <strong>Di bawah 1 MB</strong>).
                </li>
                <li>
                  Klik <strong>Pilih Foto (Bisa Banyak Sekaligus)</strong> lalu pilih puluhan foto dari galeri HP atau folder laptop.
                </li>
                <li>
                  Mau menambah foto dari folder lain? Klik <strong>Tambah Foto Lagi</strong> agar foto baru digabung ke daftar yang sama.
                </li>
                <li>
                  Jika ingin mengganti batas ukuran setelah foto masuk, klik <strong>Proses Ulang Semua</strong> tanpa perlu memilih ulang foto dari awal.
                </li>
                <li>
                  Klik <strong>Unduh Semua Foto (.zip)</strong> untuk mengambil seluruh hasil sekaligus dalam satu file ZIP, atau klik <strong>Unduh</strong> di tiap baris untuk unduh satu per satu.
                </li>
              </ol>
            </div>

            <div className="space-y-2 rounded-[6px] bg-[var(--bg-paper)] border border-[var(--border-card)] p-4">
              <h3 className="font-bold text-base text-[var(--ink-primary)]">
                Kapan Memilih 200 KB, 500 KB, atau 1 MB?
              </h3>
              <dl className="space-y-2.5 text-xs sm:text-sm">
                <div>
                  <dt className="font-bold text-[var(--ink-primary)]">
                    Di bawah 200 KB · Lebar 1200 px
                  </dt>
                  <dd className="text-[var(--ink-secondary)]">
                    Pas untuk syarat unggah berkas pendaftaran kampus, formulir instansi, atau kirim banyak foto lewat email.
                  </dd>
                </div>
                <div className="pt-2 border-t border-[var(--border-subtle)]">
                  <dt className="font-bold text-[var(--ink-primary)]">
                    Di bawah 500 KB · Lebar 1600 px
                  </dt>
                  <dd className="text-[var(--ink-secondary)]">
                    Seimbang antara gambar tetap tajam dan ukuran file hemat untuk dokumentasi kegiatan LPJ atau foto produk toko online.
                  </dd>
                </div>
                <div className="pt-2 border-t border-[var(--border-subtle)]">
                  <dt className="font-bold text-[var(--ink-primary)]">
                    Di bawah 1 MB · Ukuran asli foto
                  </dt>
                  <dd className="text-[var(--ink-secondary)]">
                    Cocok untuk menyimpan arsip foto kamera resolusi tinggi supaya memori HP/laptop tidak cepat penuh.
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </section>

      <section
        id="tanya-jawab"
        aria-labelledby="heading-faq"
        className="scroll-mt-6 space-y-4"
      >
        <h2
          id="heading-faq"
          className="font-serif-ledger font-bold text-xl sm:text-2xl text-[var(--ink-primary)]"
        >
          5. Pertanyaan yang Sering Ditanyakan
        </h2>

        <div className="space-y-2.5">
          {FAQ_ITEMS.map((item) => (
            <details
              key={item.q}
              className="rounded-[8px] bg-[var(--bg-surface)] border border-[var(--border-card)] px-4 py-1"
            >
              <summary className="min-h-[44px] py-2.5 font-semibold text-sm sm:text-base text-[var(--ink-primary)] flex items-center justify-between gap-2">
                <span>{item.q}</span>
              </summary>
              <p className="pb-3.5 pt-1 text-xs sm:text-sm text-[var(--ink-secondary)] leading-relaxed border-t border-[var(--border-subtle)]">
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </section>

      <section className="rounded-[8px] bg-[var(--bg-surface)] border-2 border-[var(--border-strong)] p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="font-serif-ledger font-bold text-lg sm:text-xl text-[var(--ink-primary)]">
            Siap mulai merapikan nota atau foto?
          </h2>
          <p className="text-xs sm:text-sm text-[var(--ink-secondary)]">
            Pilih fitur yang ingin langsung Anda gunakan di bawah ini.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
          <Link href="/" className="btn-stamp text-sm no-underline">
            <ReceiptSheetIcon className="w-4 h-4 shrink-0" />
            <span>Mulai Rekap Nota</span>
          </Link>
          <Link href="/kompres" className="btn-ledger text-sm no-underline">
            <PhotoCompressIcon className="w-4 h-4 shrink-0" />
            <span>Buka Kompres Foto</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
