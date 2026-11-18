import type { Metadata } from "next";
import Link from "next/link";
import {
  PhotoCompressIcon,
  ReceiptSheetIcon,
} from "@/components/icons/LedgerIcons";

export const metadata: Metadata = {
  title: "Panduan Penggunaan",
  description:
    "Cara ringkas memakai BERESin untuk rekap nota LPJ otomatis, syarat foto struk, dan kompresi banyak foto.",
};

const REKAP_STEPS = [
  {
    num: "01",
    title: "Pilih mode & unggah foto struk",
    body: "Gunakan Per Barang untuk mencatat daftar belanjaan satu per satu, atau Total Saja untuk cukup mengambil nama toko dan nominal akhir.",
  },
  {
    num: "02",
    title: "Periksa baris bertanda Cek",
    body: "Struk yang jelas langsung disahkan otomatis. Jika tulisan samar, klik Cek untuk melihat foto dan menyesuaikan angka.",
  },
  {
    num: "03",
    title: "Unduh laporan LPJ otomatis",
    body: "Narasi LPJ, hitungan saldo, tabel rincian, tanda tangan, dan lampiran foto langsung tersedia dalam format PDF, Word, Excel, CSV, HTML, atau TXT.",
  },
];

const PHOTO_SPECS = [
  { label: "Format foto", value: "JPG, PNG, WebP (maks. 25 MB / foto)" },
  { label: "Resolusi disarankan", value: "Minimal 600 x 800 px (tegak lurus & tajam)" },
  { label: "Pencahayaan", value: "Terang merata, hindari kilau flash pada kertas struk" },
  { label: "Struk panjang", value: "Pastikan nama toko hingga baris Total masuk utuh" },
];

const EXPORT_LIST = [
  { ext: ".pdf", desc: "Siap cetak A4 lengkap uraian LPJ, tanda tangan & lampiran foto." },
  { ext: ".docx", desc: "Dokumen Microsoft Word yang bisa diedit & ditambah kop surat." },
  { ext: ".xlsx", desc: "Tabel Excel 3 lembar lengkap dengan rumus penjumlahan." },
  { ext: ".csv / .html / .txt", desc: "Untuk Google Sheets, arsip web mandiri, atau salin teks ke WhatsApp." },
];

const FAQ_ITEMS = [
  {
    q: "Kenapa foto iPhone (.HEIC) tidak terbaca?",
    a: "Ubah pengaturan iPhone di Pengaturan -> Kamera -> Format -> Paling Kompatibel agar tersimpan sebagai JPG.",
  },
  {
    q: "Bagaimana mencatat pengeluaran tanpa kuitansi fisik?",
    a: "Klik tombol Input Manual di halaman Rekap Nota, lalu isi keperluan dan nominalnya.",
  },
  {
    q: "Apakah foto di menu Kompres Foto dikirim ke server?",
    a: "Tidak. Kompresi foto berjalan 100% lokal di browser perangkat Anda dan dapat diunduh sekaligus sebagai ZIP.",
  },
];

export default function PanduanPage() {
  return (
    <div className="max-w-3xl mx-auto px-3.5 sm:px-6 py-5 sm:py-9 space-y-6 sm:space-y-8">
      <section className="space-y-1.5">
        <h1 className="font-serif-ledger font-bold text-[clamp(1.5rem,3.8vw,2.15rem)] leading-tight text-[var(--ink-primary)] tracking-tight">
          Panduan Singkat BERESin
        </h1>
        <p className="text-xs sm:text-sm text-[var(--ink-secondary)]">
          Alur kerja rekap nota LPJ, ketentuan foto struk, dan kompresi foto massal.
        </p>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-serif-ledger font-bold text-lg sm:text-xl text-[var(--ink-primary)]">
            1. Alur Rekap Nota LPJ
          </h2>
          <Link href="/" className="btn-stamp !py-1.5 !px-3 text-xs no-underline">
            <ReceiptSheetIcon className="w-4 h-4 shrink-0" />
            <span>Rekap Nota</span>
          </Link>
        </div>

        <ol className="rounded-[8px] bg-[var(--bg-surface)] border border-[var(--border-card)] divide-y divide-[var(--border-subtle)]">
          {REKAP_STEPS.map((s) => (
            <li key={s.num} className="p-3.5 sm:p-4 flex gap-3 items-start">
              <span className="stamp-ref shrink-0">{s.num}</span>
              <div className="min-w-0">
                <h3 className="font-bold text-sm text-[var(--ink-primary)]">
                  {s.title}
                </h3>
                <p className="text-xs sm:text-sm text-[var(--ink-secondary)] mt-0.5">
                  {s.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section id="syarat-foto-struk" className="space-y-3">
        <h2 className="font-serif-ledger font-bold text-lg sm:text-xl text-[var(--ink-primary)]">
          2. Syarat Foto Struk
        </h2>
        <dl className="rounded-[8px] bg-[var(--bg-surface)] border border-[var(--border-card)] divide-y divide-[var(--border-subtle)]">
          {PHOTO_SPECS.map((row) => (
            <div
              key={row.label}
              className="p-3.5 flex flex-col sm:flex-row sm:justify-between gap-1 text-xs sm:text-sm"
            >
              <dt className="font-semibold text-[var(--ink-secondary)]">
                {row.label}
              </dt>
              <dd className="font-mono-tabular font-semibold text-[var(--ink-primary)]">
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="space-y-3">
        <h2 className="font-serif-ledger font-bold text-lg sm:text-xl text-[var(--ink-primary)]">
          3. Format Ekspor LPJ
        </h2>
        <dl className="rounded-[8px] bg-[var(--bg-surface)] border border-[var(--border-card)] divide-y divide-[var(--border-subtle)]">
          {EXPORT_LIST.map((f) => (
            <div
              key={f.ext}
              className="p-3.5 flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4 text-xs sm:text-sm"
            >
              <dt className="font-mono-tabular font-bold text-[var(--ink-primary)] sm:w-36 shrink-0">
                {f.ext}
              </dt>
              <dd className="text-[var(--ink-secondary)]">{f.desc}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section id="cara-kompres-foto" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-serif-ledger font-bold text-lg sm:text-xl text-[var(--ink-primary)]">
            4. Kompres Banyak Foto
          </h2>
          <Link
            href="/kompres"
            className="btn-ledger !py-1.5 !px-3 text-xs no-underline"
          >
            <PhotoCompressIcon className="w-4 h-4 shrink-0" />
            <span>Kompres Foto</span>
          </Link>
        </div>
        <div className="rounded-[8px] bg-[var(--bg-surface)] border border-[var(--border-card)] p-3.5 sm:p-4 text-xs sm:text-sm text-[var(--ink-secondary)] space-y-1.5">
          <p>
            Pilih target ukuran (<strong className="text-[var(--ink-primary)] font-mono-tabular">&lt; 200 KB</strong>,{" "}
            <strong className="text-[var(--ink-primary)] font-mono-tabular">&lt; 500 KB</strong>, atau{" "}
            <strong className="text-[var(--ink-primary)] font-mono-tabular">&lt; 1 MB</strong>), unggah puluhan foto sekaligus, lalu klik{" "}
            <strong className="text-[var(--ink-primary)]">Unduh ZIP</strong>.
          </p>
        </div>
      </section>

      <section className="space-y-2.5">
        <h2 className="font-serif-ledger font-bold text-lg sm:text-xl text-[var(--ink-primary)]">
          5. Tanya Jawab
        </h2>
        <div className="space-y-2">
          {FAQ_ITEMS.map((item) => (
            <details
              key={item.q}
              className="rounded-[8px] bg-[var(--bg-surface)] border border-[var(--border-card)] px-3.5"
            >
              <summary className="min-h-[44px] py-2 font-semibold text-xs sm:text-sm text-[var(--ink-primary)] flex items-center justify-between gap-2">
                <span>{item.q}</span>
              </summary>
              <p className="pb-3 pt-1 text-xs sm:text-sm text-[var(--ink-secondary)] border-t border-[var(--border-subtle)]">
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
