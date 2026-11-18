"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { PdfGridDensity, Project, Receipt } from "@/types/beresin";
import {
  formatRupiah,
  formatShortDateId,
  parseIndonesianMoneyInput,
} from "@/lib/format";
import { computeLpjNarrative } from "@/lib/lpj-narrative";
import { exportProjectToExcel } from "@/lib/export-excel";
import { exportProjectToPdfLpj } from "@/lib/export-pdf";
import {
  exportProjectToCsv,
  exportProjectToDocx,
  exportProjectToHtml,
  exportProjectToTxt,
} from "@/lib/export-multi";
import { useLedger } from "@/components/providers/LedgerProvider";
import { SplitScreenVerifierModal } from "@/components/receipts/SplitScreenVerifierModal";
import {
  AlertTriangleIcon,
  BookGuideIcon,
  ChevronDownIcon,
  PdfDocumentIcon,
  PlusBoxIcon,
  SlidersLedgerIcon,
  SpreadsheetIcon,
  StampCheckIcon,
  TrashBinIcon,
  UploadStackIcon,
  WordDocumentIcon,
} from "@/components/icons/LedgerIcons";

export default function HomePage() {
  const {
    announcePolite,
    project,
    receipts,
    viewState,
    receiptError,
    extractionMode,
    setExtractionModeSafe,
    uploadingReceipts,
    receiptProgress,
    reloadWorkspace,
    updateProjectFields,
    processReceiptFiles,
    cancelReceiptUpload,
    reanalyzeReceipt,
    addManualReceipt,
    saveVerifiedReceipt,
    deleteOneReceipt,
    clearAllReceipts,
  } = useLedger();

  const [pdfGrid, setPdfGrid] = useState<PdfGridDensity>("2x2");
  const [lpjOptionsOpen, setLpjOptionsOpen] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [busyExport, setBusyExport] = useState<"pdf" | "docx" | null>(null);

  const [titleInput, setTitleInput] = useState("Laporan Pengeluaran Kegiatan");
  const [budgetInput, setBudgetInput] = useState("");
  const [chairpersonInput, setChairpersonInput] = useState("");
  const [treasurerInput, setTreasurerInput] = useState("");

  const [activeReceiptId, setActiveReceiptId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const initializedProjectIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!project || initializedProjectIdRef.current === project.id) return;
    initializedProjectIdRef.current = project.id;
    setTitleInput(project.title);
    setBudgetInput(project.initialBudget > 0 ? String(project.initialBudget) : "");
    setChairpersonInput(project.chairpersonName || "");
    setTreasurerInput(project.treasurerName || "");
  }, [project]);

  const liveProject = useMemo<Project | null>(() => {
    if (!project) return null;
    return {
      ...project,
      title: titleInput.trim() || "Laporan Pengeluaran Kegiatan",
      initialBudget: parseIndonesianMoneyInput(budgetInput),
      chairpersonName: chairpersonInput.trim(),
      treasurerName: treasurerInput.trim(),
    };
  }, [project, titleInput, budgetInput, chairpersonInput, treasurerInput]);

  const narrative = useMemo(
    () => (liveProject ? computeLpjNarrative(liveProject, receipts) : null),
    [liveProject, receipts]
  );

  const totalSpent = useMemo(
    () => receipts.reduce((sum, r) => sum + r.totalAmount, 0),
    [receipts]
  );

  const needsReviewCount = useMemo(
    () => receipts.filter((r) => r.status === "needs_review").length,
    [receipts]
  );

  const hasCustomLpjMeta = useMemo(
    () =>
      Boolean(
        parseIndonesianMoneyInput(budgetInput) > 0 ||
          chairpersonInput.trim() ||
          treasurerInput.trim()
      ),
    [budgetInput, chairpersonInput, treasurerInput]
  );

  function flushHeaderFields(): Project | null {
    return updateProjectFields({
      title: titleInput.trim() || "Laporan Pengeluaran Kegiatan",
      initialBudget: parseIndonesianMoneyInput(budgetInput),
      chairpersonName: chairpersonInput.trim(),
      treasurerName: treasurerInput.trim(),
    });
  }

  async function handleFileSelection(files: FileList | null) {
    if (!files || uploadingReceipts) return;
    const { firstZeroReceiptId } = await processReceiptFiles(files);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    if (firstZeroReceiptId) {
      setActiveReceiptId(firstZeroReceiptId);
    }
  }

  async function handleManualClick() {
    const newId = await addManualReceipt();
    if (newId) setActiveReceiptId(newId);
  }

  async function handleModalSave(updated: Receipt, moveNext: boolean) {
    saveVerifiedReceipt(updated);

    if (!moveNext) {
      setActiveReceiptId(null);
      return;
    }

    const idx = receipts.findIndex((r) => r.id === updated.id);
    const nextTarget =
      receipts.find((r, i) => i > idx && r.status === "needs_review") ??
      receipts.find((r) => r.id !== updated.id && r.status === "needs_review") ??
      null;

    setActiveReceiptId(nextTarget ? nextTarget.id : null);
  }

  function handleDelete(id: string) {
    if (activeReceiptId === id) setActiveReceiptId(null);
    deleteOneReceipt(id);
  }

  function handleDownloadExcel() {
    if (uploadingReceipts) return;
    const snap = flushHeaderFields();
    if (!snap) return;
    exportProjectToExcel(snap, receipts);
    announcePolite("Excel diunduh.");
  }

  async function handleDownloadPdf() {
    if (uploadingReceipts) return;
    const snap = flushHeaderFields();
    if (!snap) return;
    setBusyExport("pdf");
    try {
      await exportProjectToPdfLpj(snap, receipts, pdfGrid);
      announcePolite("PDF diunduh.");
    } finally {
      setBusyExport(null);
    }
  }

  async function handleDownloadDocx() {
    if (uploadingReceipts) return;
    const snap = flushHeaderFields();
    if (!snap) return;
    setBusyExport("docx");
    try {
      await exportProjectToDocx(snap, receipts);
      announcePolite("Word diunduh.");
    } finally {
      setBusyExport(null);
    }
  }

  function handleDownloadCsv() {
    if (uploadingReceipts) return;
    const snap = flushHeaderFields();
    if (!snap) return;
    exportProjectToCsv(snap, receipts);
  }

  function handleDownloadHtml() {
    if (uploadingReceipts) return;
    const snap = flushHeaderFields();
    if (!snap) return;
    exportProjectToHtml(snap, receipts);
  }

  function handleDownloadTxt() {
    if (uploadingReceipts) return;
    const snap = flushHeaderFields();
    if (!snap) return;
    exportProjectToTxt(snap, receipts);
  }

  const progressPct = receiptProgress
    ? Math.round(
        (receiptProgress.current / Math.max(1, receiptProgress.total)) * 100
      )
    : 0;

  const exportLocked = uploadingReceipts || busyExport !== null;

  return (
    <div className="max-w-4xl mx-auto px-3.5 sm:px-6 py-5 sm:py-9 space-y-5 sm:space-y-6">
      <section className="flex items-start sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-serif-ledger font-bold text-[clamp(1.45rem,3.8vw,2.1rem)] leading-tight text-[var(--ink-primary)] tracking-tight">
            Foto struk jadi laporan LPJ.
          </h1>
          <p className="text-xs sm:text-sm text-[var(--ink-secondary)]">
            Unggah foto struk, periksa angka, lalu unduh dokumen laporan otomatis.
          </p>
        </div>

        <Link
          href="/panduan"
          className="btn-secondary !px-3 text-xs no-underline shrink-0"
        >
          <BookGuideIcon className="w-4 h-4 shrink-0" />
          <span>Panduan</span>
        </Link>
      </section>

      <section
        aria-label="Unggah foto struk"
        onDragOver={(e) => {
          e.preventDefault();
          if (!uploadingReceipts) setIsDraggingOver(true);
        }}
        onDragLeave={() => setIsDraggingOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDraggingOver(false);
          if (!uploadingReceipts) void handleFileSelection(e.dataTransfer.files);
        }}
        className={`rounded-[8px] border-2 border-dashed p-4 sm:p-6 text-center transition-colors ${
          isDraggingOver
            ? "bg-[var(--verified-bg)] border-[var(--border-strong)]"
            : "bg-[var(--bg-surface)] border-[var(--border-control)]"
        }`}
      >
        <input
          ref={fileInputRef}
          id="input-upload-nota-utama"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          disabled={uploadingReceipts || viewState === "loading"}
          onChange={(e) => void handleFileSelection(e.target.files)}
          className="sr-only"
        />

        <div className="max-w-lg mx-auto space-y-4">
          <fieldset
            disabled={uploadingReceipts}
            className="space-y-1.5 text-left"
          >
            <legend className="text-xs font-bold uppercase text-[var(--ink-secondary)] text-center w-full mb-1">
              {uploadingReceipts
                ? "Mode baca struk (terkunci saat memproses):"
                : "1. Pilih mode baca struk sebelum unggah:"}
            </legend>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={uploadingReceipts}
                aria-pressed={extractionMode === "detailed"}
                onClick={() => setExtractionModeSafe("detailed")}
                className={`min-h-[48px] px-3 py-2 rounded-[6px] border text-left transition-colors ${
                  extractionMode === "detailed"
                    ? "bg-[var(--color-ledger)] text-[var(--color-ledger-ink)] border-[var(--color-ledger)]"
                    : "bg-[var(--bg-paper)] text-[var(--ink-primary)] border-[var(--border-control)] hover:bg-[var(--bg-subtle)]"
                }`}
              >
                <span className="block text-xs sm:text-sm font-bold leading-tight">
                  Rincian Barang
                </span>
                <span className="block text-[11px] opacity-90 mt-0.5 leading-tight">
                  Catat tiap barang &amp; harga
                </span>
              </button>

              <button
                type="button"
                disabled={uploadingReceipts}
                aria-pressed={extractionMode === "summary"}
                onClick={() => setExtractionModeSafe("summary")}
                className={`min-h-[48px] px-3 py-2 rounded-[6px] border text-left transition-colors ${
                  extractionMode === "summary"
                    ? "bg-[var(--color-ledger)] text-[var(--color-ledger-ink)] border-[var(--color-ledger)]"
                    : "bg-[var(--bg-paper)] text-[var(--ink-primary)] border-[var(--border-control)] hover:bg-[var(--bg-subtle)]"
                }`}
              >
                <span className="block text-xs sm:text-sm font-bold leading-tight">
                  Hanya Total
                </span>
                <span className="block text-[11px] opacity-90 mt-0.5 leading-tight">
                  Cukup toko, tanggal &amp; total
                </span>
              </button>
            </div>
          </fieldset>

          <div className="pt-1 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2">
            <label
              htmlFor="input-upload-nota-utama"
              aria-disabled={uploadingReceipts || viewState === "loading"}
              className={`btn-stamp text-sm px-5 py-2.5 flex-1 sm:flex-initial ${
                uploadingReceipts || viewState === "loading"
                  ? "opacity-60 pointer-events-none"
                  : ""
              }`}
            >
              <UploadStackIcon className="w-5 h-5 shrink-0" />
              <span>
                {uploadingReceipts ? "Sedang Memproses..." : "2. Pilih Foto Struk"}
              </span>
            </label>

            <button
              type="button"
              disabled={uploadingReceipts || viewState === "loading"}
              onClick={() => void handleManualClick()}
              className="btn-secondary text-xs !px-3.5"
            >
              <PlusBoxIcon className="w-4 h-4 shrink-0" />
              <span>Input Manual</span>
            </button>
          </div>

          <p className="text-xs text-[var(--ink-secondary)]">
            Bisa banyak foto sekaligus · JPG, PNG, WebP (maks. 25 MB)
          </p>
        </div>

        {uploadingReceipts && receiptProgress && (
          <div
            role="status"
            aria-live="polite"
            className="mt-4 p-3 rounded-[6px] bg-[var(--bg-subtle)] border border-[var(--border-card)] text-left max-w-lg mx-auto space-y-2"
          >
            <div className="flex items-center justify-between gap-2 text-xs font-mono-tabular text-[var(--ink-primary)]">
              <span className="truncate">
                [{receiptProgress.mode === "detailed" ? "Rincian" : "Total"}]{" "}
                <strong>{receiptProgress.fileName}</strong>
              </span>
              <span className="shrink-0 font-bold">
                {receiptProgress.current}/{receiptProgress.total}
              </span>
            </div>
            <div
              role="progressbar"
              aria-label="Progres pembacaan struk"
              aria-valuenow={receiptProgress.current}
              aria-valuemin={0}
              aria-valuemax={receiptProgress.total}
              className="h-2 w-full rounded-[3px] bg-[var(--bg-paper)] border border-[var(--border-control)] overflow-hidden"
            >
              <div
                className="h-full bg-[var(--color-ledger)]"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="flex items-center justify-between gap-2 pt-0.5">
              <span className="text-[11px] text-[var(--ink-secondary)]">
                Tetap berjalan meski Anda pindah menu.
              </span>
              <button
                type="button"
                onClick={cancelReceiptUpload}
                className="btn-secondary !py-1 !px-2.5 text-xs"
              >
                Batalkan
              </button>
            </div>
          </div>
        )}
      </section>

      {viewState === "loading" && (
        <div
          role="status"
          aria-live="polite"
          className="p-5 rounded-[8px] bg-[var(--bg-surface)] border border-[var(--border-card)] text-center text-xs sm:text-sm text-[var(--ink-secondary)]"
        >
          Memuat ruang kerja...
        </div>
      )}

      {receiptError && (
        <div
          role="alert"
          className="p-3.5 rounded-[8px] border-2 flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm"
          style={{
            backgroundColor: "var(--stamp-tint-bg)",
            color: "var(--stamp-tint-ink)",
            borderColor: "var(--stamp-tint-border)",
          }}
        >
          <div className="flex items-start gap-2 font-semibold">
            <AlertTriangleIcon className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{receiptError}</span>
          </div>
          {viewState === "error" && (
            <button
              type="button"
              onClick={() => void reloadWorkspace()}
              className="btn-secondary text-xs !py-1.5 !px-3"
            >
              Muat Ulang
            </button>
          )}
        </div>
      )}

      {viewState === "ready" && receipts.length > 0 && project && narrative && (
        <section aria-label="Ekspor dan daftar nota" className="space-y-4">
          <div className="rounded-[8px] bg-[var(--bg-surface)] border-2 border-[var(--border-strong)] p-4 sm:p-5 space-y-3.5">
            <div>
              <label
                htmlFor="input-judul-laporan"
                className="block text-xs font-bold uppercase text-[var(--ink-secondary)] mb-1"
              >
                Judul Laporan LPJ
              </label>
              <input
                id="input-judul-laporan"
                type="text"
                maxLength={140}
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                onBlur={() => flushHeaderFields()}
                placeholder="Laporan Keuangan Kegiatan"
                className="input-ledger font-semibold text-sm"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                disabled={exportLocked}
                onClick={() => void handleDownloadPdf()}
                className="btn-stamp w-full text-sm"
              >
                <PdfDocumentIcon className="w-4 h-4 shrink-0" />
                <span>{busyExport === "pdf" ? "Menyusun..." : "Unduh PDF"}</span>
              </button>

              <button
                type="button"
                disabled={exportLocked}
                onClick={() => void handleDownloadDocx()}
                className="btn-ledger w-full text-sm"
              >
                <WordDocumentIcon className="w-4 h-4 shrink-0" />
                <span>{busyExport === "docx" ? "Menyusun..." : "Unduh Word"}</span>
              </button>

              <button
                type="button"
                disabled={exportLocked}
                onClick={handleDownloadExcel}
                className="btn-secondary w-full text-sm"
              >
                <SpreadsheetIcon className="w-4 h-4 shrink-0" />
                <span>Unduh Excel</span>
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1">
              <button
                type="button"
                disabled={exportLocked}
                onClick={handleDownloadCsv}
                className="btn-secondary !py-1.5 !px-2 text-xs"
              >
                CSV (.csv)
              </button>
              <button
                type="button"
                disabled={exportLocked}
                onClick={handleDownloadHtml}
                className="btn-secondary !py-1.5 !px-2 text-xs"
              >
                Web (.html)
              </button>
              <button
                type="button"
                disabled={exportLocked}
                onClick={handleDownloadTxt}
                className="btn-secondary !py-1.5 !px-2 text-xs"
              >
                Teks (.txt)
              </button>
            </div>

            <div className="pt-2.5 border-t border-[var(--border-subtle)]">
              <button
                type="button"
                aria-expanded={lpjOptionsOpen}
                aria-controls="panel-pengaturan-lpj"
                onClick={() => setLpjOptionsOpen((prev) => !prev)}
                className={`w-full min-h-[54px] px-3 sm:px-3.5 py-2.5 rounded-[6px] border-[1.5px] flex items-center justify-between gap-2.5 text-left transition-colors active:translate-y-[1px] ${
                  lpjOptionsOpen
                    ? "bg-[var(--bg-subtle)] border-[var(--border-strong)]"
                    : "bg-[var(--bg-paper)] hover:bg-[var(--bg-subtle)] border-[var(--border-control)]"
                }`}
              >
                <span className="flex items-start sm:items-center gap-2.5 min-w-0">
                  <SlidersLedgerIcon className="w-4 h-4 shrink-0 mt-0.5 sm:mt-0 text-[var(--ink-primary)]" />
                  <span className="min-w-0 block">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="font-bold text-xs sm:text-sm text-[var(--ink-primary)] leading-snug">
                        Pengaturan LPJ &amp; Pratinjau Otomatis
                      </span>
                      <span className="px-1.5 py-0.5 rounded-[4px] bg-[var(--bg-surface)] border border-[var(--border-control)] font-mono-tabular text-[11px] font-semibold text-[var(--ink-secondary)] leading-none">
                        {hasCustomLpjMeta ? "Opsional · Terisi" : "Opsional"}
                      </span>
                    </span>
                    <span className="block text-[11px] sm:text-xs text-[var(--ink-secondary)] leading-snug mt-0.5">
                      Dana awal, nama penanda tangan &amp; cek teks narasi
                    </span>
                  </span>
                </span>

                <span className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-[5px] bg-[var(--bg-surface)] border border-[var(--border-control)] text-xs font-semibold text-[var(--ink-primary)]">
                  <span>{lpjOptionsOpen ? "Tutup" : "Atur"}</span>
                  <ChevronDownIcon
                    className={`w-3.5 h-3.5 shrink-0 transition-transform duration-150 ${
                      lpjOptionsOpen ? "rotate-180" : ""
                    }`}
                  />
                </span>
              </button>

              {lpjOptionsOpen && (
                <div
                  id="panel-pengaturan-lpj"
                  className="mt-2.5 p-3 sm:p-3.5 rounded-[6px] bg-[var(--bg-paper)] border border-[var(--border-card)] space-y-3"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                    <div>
                      <label
                        htmlFor="opt-dana-awal"
                        className="block text-xs font-semibold text-[var(--ink-secondary)] mb-1"
                      >
                        Dana Awal (Rp)
                      </label>
                      <input
                        id="opt-dana-awal"
                        type="text"
                        inputMode="numeric"
                        maxLength={20}
                        value={budgetInput}
                        onChange={(e) => setBudgetInput(e.target.value)}
                        onBlur={() => flushHeaderFields()}
                        placeholder="Opsional"
                        className="input-ledger font-mono-tabular text-sm"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="opt-ketua"
                        className="block text-xs font-semibold text-[var(--ink-secondary)] mb-1"
                      >
                        Ketua Pelaksana
                      </label>
                      <input
                        id="opt-ketua"
                        type="text"
                        maxLength={100}
                        value={chairpersonInput}
                        onChange={(e) => setChairpersonInput(e.target.value)}
                        onBlur={() => flushHeaderFields()}
                        placeholder="Opsional"
                        className="input-ledger text-sm"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="opt-bendahara"
                        className="block text-xs font-semibold text-[var(--ink-secondary)] mb-1"
                      >
                        Bendahara
                      </label>
                      <input
                        id="opt-bendahara"
                        type="text"
                        maxLength={100}
                        value={treasurerInput}
                        onChange={(e) => setTreasurerInput(e.target.value)}
                        onBlur={() => flushHeaderFields()}
                        placeholder="Opsional"
                        className="input-ledger text-sm"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="select-grid-pdf"
                        className="block text-xs font-semibold text-[var(--ink-secondary)] mb-1"
                      >
                        Lampiran PDF
                      </label>
                      <select
                        id="select-grid-pdf"
                        value={pdfGrid}
                        onChange={(e) => setPdfGrid(e.target.value as PdfGridDensity)}
                        className="input-ledger text-sm"
                      >
                        <option value="2x2">4 foto / halaman</option>
                        <option value="2x3">6 foto / halaman</option>
                      </select>
                    </div>
                  </div>

                  <div className="p-3 rounded-[6px] bg-[var(--bg-surface)] border border-[var(--border-card)] space-y-2 text-xs text-[var(--ink-secondary)] leading-relaxed">
                    <p className="font-bold text-[var(--ink-primary)]">
                      Pratinjau Narasi LPJ Otomatis:
                    </p>
                    <p>{narrative.openingParagraph}</p>
                    <p>{narrative.financialParagraph}</p>
                    <p>{narrative.categoryParagraph}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 px-0.5">
            <div className="text-xs sm:text-sm text-[var(--ink-secondary)] flex flex-wrap items-center gap-2">
              <span>
                <strong className="text-[var(--ink-primary)] font-mono-tabular">
                  {receipts.length} nota
                </strong>{" "}
                ·{" "}
                <strong className="text-[var(--ink-primary)] font-mono-tabular">
                  {formatRupiah(totalSpent)}
                </strong>
              </span>
              {needsReviewCount > 0 && (
                <span
                  className="px-2 py-0.5 rounded-[4px] border text-xs font-bold"
                  style={{
                    backgroundColor: "var(--amber-bg)",
                    color: "var(--amber-ink)",
                    borderColor: "var(--amber-border)",
                  }}
                >
                  {needsReviewCount} cek
                </span>
              )}
            </div>

            <button
              type="button"
              disabled={uploadingReceipts}
              onClick={clearAllReceipts}
              className="btn-secondary !py-1.5 !px-2.5 text-xs shrink-0"
            >
              <TrashBinIcon className="w-4 h-4 shrink-0" />
              <span>Hapus Semua</span>
            </button>
          </div>

          <ul className="space-y-2.5">
            {receipts.map((r) => (
              <li
                key={r.id}
                className="rounded-[8px] bg-[var(--bg-surface)] border border-[var(--border-card)] p-3 sm:p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => setActiveReceiptId(r.id)}
                    aria-label={`Buka struk ${r.referenceNumber}`}
                    className="w-11 h-13 shrink-0 rounded-[4px] border border-[var(--border-control)] overflow-hidden bg-white"
                  >
                    <img
                      src={r.imageUrl}
                      alt={`Foto ${r.referenceNumber}`}
                      width={44}
                      height={52}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="stamp-ref !text-xs !py-0 !px-1.5">
                        #{r.referenceNumber}
                      </span>
                      <span className="text-xs font-mono-tabular text-[var(--ink-secondary)]">
                        {formatShortDateId(r.transactionDate)} · {r.category}
                      </span>
                      {r.isDuplicate && (
                        <span
                          className="text-[11px] font-bold px-1.5 py-0.5 rounded-[3px] border"
                          style={{
                            backgroundColor: "var(--stamp-tint-bg)",
                            color: "var(--stamp-tint-ink)",
                            borderColor: "var(--stamp-tint-border)",
                          }}
                        >
                          Duplikat #{r.duplicateOfRef}
                        </span>
                      )}
                    </div>

                    <p className="font-bold text-sm sm:text-base text-[var(--ink-primary)] truncate mt-0.5">
                      {r.merchantName}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-[var(--border-subtle)]">
                  <span className="font-mono-tabular font-bold text-sm sm:text-base text-[var(--ink-primary)]">
                    {formatRupiah(r.totalAmount)}
                  </span>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setActiveReceiptId(r.id)}
                      className={`${
                        r.status === "needs_review" ? "btn-stamp" : "btn-secondary"
                      } !py-1.5 !px-3 text-xs`}
                    >
                      {r.status === "verified" ? (
                        <>
                          <StampCheckIcon className="w-3.5 h-3.5 shrink-0" />
                          <span>Edit</span>
                        </>
                      ) : (
                        <span>Cek</span>
                      )}
                    </button>

                    <button
                      type="button"
                      disabled={uploadingReceipts}
                      onClick={() => handleDelete(r.id)}
                      aria-label={`Hapus ${r.referenceNumber}`}
                      className="btn-secondary !p-2 min-w-[44px]"
                    >
                      <TrashBinIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {activeReceiptId && project && (
        <SplitScreenVerifierModal
          project={liveProject ?? project}
          receipts={receipts}
          activeReceiptId={activeReceiptId}
          onClose={() => setActiveReceiptId(null)}
          onSelectReceipt={(id) => setActiveReceiptId(id)}
          onSaveReceipt={handleModalSave}
          onDeleteReceipt={async (id) => handleDelete(id)}
          onReanalyzeReceipt={reanalyzeReceipt}
        />
      )}
    </div>
  );
}
