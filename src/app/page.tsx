"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import imageCompression from "browser-image-compression";
import type {
  ExtractionMode,
  OcrExtractedPayload,
  PdfGridDensity,
  Project,
  Receipt,
} from "@/types/beresin";
import {
  clearAllWorkspaceReceipts,
  deleteReceipt,
  loadLocalWorkspaceFast,
  nextReferenceNumber,
  saveReceipt,
  syncWorkspaceFromCloud,
  updateWorkspaceMeta,
} from "@/lib/storage";
import {
  computeBlobHash,
  findDuplicateReceipt,
  formatRupiah,
  formatShortDateId,
  parseIndonesianMoneyInput,
  todayIsoDate,
} from "@/lib/format";
import { computeLpjNarrative } from "@/lib/lpj-narrative";
import { verifyImageMagicBytes } from "@/lib/security";
import { createManualNoteDataUrl } from "@/lib/manual-note-image";
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
  DownloadTrayIcon,
  PdfDocumentIcon,
  PlusBoxIcon,
  SpreadsheetIcon,
  StampCheckIcon,
  TrashBinIcon,
  UploadStackIcon,
  WordDocumentIcon,
} from "@/components/icons/LedgerIcons";

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Gagal membaca berkas gambar."));
    reader.readAsDataURL(blob);
  });
}

export default function HomePage() {
  const { settings, announcePolite } = useLedger();

  const [project, setProject] = useState<Project | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [viewState, setViewState] = useState<"loading" | "ready" | "error">("loading");
  const [errorText, setErrorText] = useState("");
  const [cloudConnected, setCloudConnected] = useState(false);

  const [extractionMode, setExtractionMode] = useState<ExtractionMode>("detailed");
  const [pdfGrid, setPdfGrid] = useState<PdfGridDensity>("2x2");
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadStatusText, setUploadStatusText] = useState("");
  const [busyExport, setBusyExport] = useState<"pdf" | "docx" | null>(null);

  const [titleInput, setTitleInput] = useState("Laporan Pengeluaran Kegiatan");
  const [budgetInput, setBudgetInput] = useState("");
  const [chairpersonInput, setChairpersonInput] = useState("");
  const [treasurerInput, setTreasurerInput] = useState("");

  const [activeReceiptId, setActiveReceiptId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const userMutatedRef = useRef(false);

  const loadData = useCallback(async () => {
    setErrorText("");
    try {
      const localData = await loadLocalWorkspaceFast();
      setProject(localData.project);
      setReceipts(localData.receipts);
      setTitleInput(localData.project.title);
      setBudgetInput(
        localData.project.initialBudget > 0
          ? String(localData.project.initialBudget)
          : ""
      );
      setChairpersonInput(localData.project.chairpersonName || "");
      setTreasurerInput(localData.project.treasurerName || "");
      setViewState("ready");

      // Reconcile with Supabase in background without delaying initial render or clicks.
      void syncWorkspaceFromCloud().then((cloudData) => {
        if (!cloudData || userMutatedRef.current) return;
        setCloudConnected(cloudData.cloudConnected);
        setProject(cloudData.project);
        setReceipts(cloudData.receipts);
        setTitleInput(cloudData.project.title);
        setBudgetInput(
          cloudData.project.initialBudget > 0
            ? String(cloudData.project.initialBudget)
            : ""
        );
        setChairpersonInput(cloudData.project.chairpersonName || "");
        setTreasurerInput(cloudData.project.treasurerName || "");
      });
    } catch (err) {
      setErrorText(
        err instanceof Error ? err.message : "Gagal memuat daftar nota di peramban."
      );
      setViewState("error");
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

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

  function saveHeaderInBackground(): Project | null {
    if (!liveProject) return null;
    userMutatedRef.current = true;
    setProject(liveProject);
    void updateWorkspaceMeta(liveProject);
    return liveProject;
  }

  async function processFiles(fileList: FileList | File[] | null) {
    if (!fileList || !project) return;
    const rawCandidates = Array.from(fileList);
    if (rawCandidates.length === 0) return;

    const verifiedFiles: File[] = [];
    let skippedCount = 0;
    for (const candidate of rawCandidates) {
      const isGenuineImage = await verifyImageMagicBytes(candidate);
      if (isGenuineImage) {
        verifiedFiles.push(candidate);
      } else {
        skippedCount += 1;
      }
    }

    if (verifiedFiles.length === 0) {
      setErrorText(
        "File tidak dapat dibuka: pilih foto asli berformat JPG, PNG, atau WebP (maksimal 25 MB per foto)."
      );
      return;
    }

    userMutatedRef.current = true;
    setErrorText(
      skippedCount > 0
        ? `${skippedCount} file dilewati karena bukan foto JPG, PNG, atau WebP (maksimal 25 MB).`
        : ""
    );
    setUploading(true);
    let firstAddedId: string | null = null;
    const createdList: Receipt[] = [];

    try {
      for (let i = 0; i < verifiedFiles.length; i += 1) {
        const file = verifiedFiles[i];
        setUploadStatusText(
          `Membaca foto struk ${i + 1} dari ${verifiedFiles.length} (${file.name})...`
        );

        let compressed: Blob = file;
        try {
          compressed = await imageCompression(file, {
            maxSizeMB: 1,
            maxWidthOrHeight: 1200,
            fileType: "image/jpeg",
            useWebWorker: false,
          });
        } catch {
          compressed = file;
        }

        const [dataUrl, imageHash, refNum] = await Promise.all([
          blobToDataUrl(compressed),
          computeBlobHash(compressed),
          nextReferenceNumber(project.id),
        ]);

        const receiptId = crypto.randomUUID();
        if (!firstAddedId) firstAddedId = receiptId;

        let extracted: OcrExtractedPayload | null = null;
        let aiUsed = false;

        try {
          const headers: Record<string, string> = {
            "Content-Type": "application/json",
          };
          if (settings.geminiApiKey.trim()) {
            headers["x-gemini-api-key"] = settings.geminiApiKey.trim();
          }

          const resp = await fetch("/api/ocr", {
            method: "POST",
            headers,
            body: JSON.stringify({
              imageBase64: dataUrl,
              mimeType: compressed.type || "image/jpeg",
              fileName: file.name,
              categories: project.categories,
              extractionMode,
            }),
          });

          if (resp.ok) {
            const json = await resp.json();
            extracted = json.data as OcrExtractedPayload;
            aiUsed = Boolean(json.aiUsed);
          }
        } catch {
          // Keep compressed photo for manual entry when offline
        }

        const confidence = extracted?.confidence_score ?? 0.5;
        const autoVerified =
          aiUsed && confidence >= 0.85 && (extracted?.total_amount ?? 0) > 0;

        const nextItem: Receipt = {
          id: receiptId,
          projectId: project.id,
          referenceNumber: refNum,
          imageUrl: dataUrl,
          imageHash,
          extractionMode,
          merchantName:
            extracted?.merchant_name ||
            file.name.replace(/\.[^.]+$/, "").slice(0, 80) ||
            "Nota Baru",
          transactionDate: extracted?.transaction_date ?? todayIsoDate(),
          category:
            extracted?.category && project.categories.includes(extracted.category)
              ? extracted.category
              : project.categories[0] ?? "Lain-lain",
          subtotal: extracted?.subtotal ?? extracted?.total_amount ?? 0,
          taxAndService: extracted?.tax_and_service ?? 0,
          discount: extracted?.discount ?? 0,
          totalAmount: extracted?.total_amount ?? 0,
          paymentMethod: extracted?.payment_method ?? "Tunai",
          confidenceScore: confidence,
          warningMessage: extracted?.warning_message ?? null,
          isDuplicate: false,
          duplicateOfRef: null,
          status: autoVerified ? "verified" : "needs_review",
          notes: "",
          items: (extracted?.items ?? []).map((it) => ({
            id: crypto.randomUUID(),
            receiptId,
            itemName: it.item_name,
            quantity: it.quantity,
            unitPrice: it.unit_price,
            totalPrice: it.total_price,
          })),
          createdAt: new Date().toISOString(),
        };

        const saved = await saveReceipt(nextItem);
        createdList.push(saved);
      }

      setReceipts((prev) =>
        [...prev, ...createdList].sort((a, b) =>
          a.referenceNumber.localeCompare(b.referenceNumber)
        )
      );
      announcePolite(`${createdList.length} foto struk selesai ditambahkan.`);

      if (createdList.length === 1 && createdList[0].totalAmount === 0 && firstAddedId) {
        setActiveReceiptId(firstAddedId);
      }
    } finally {
      setUploading(false);
      setUploadStatusText("");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  async function handleAddManualReceipt() {
    if (!project) return;
    userMutatedRef.current = true;
    const refNum = await nextReferenceNumber(project.id);
    const receiptId = crypto.randomUUID();
    const dateToday = todayIsoDate();
    const blankImg = createManualNoteDataUrl(refNum, dateToday);

    const draft: Receipt = {
      id: receiptId,
      projectId: project.id,
      referenceNumber: refNum,
      imageUrl: blankImg,
      imageHash: `manual-${receiptId}`,
      extractionMode: "detailed",
      merchantName: "Pengeluaran Tanpa Struk",
      transactionDate: dateToday,
      category: project.categories[0] ?? "Lain-lain",
      subtotal: 0,
      taxAndService: 0,
      discount: 0,
      totalAmount: 0,
      paymentMethod: "Tunai",
      confidenceScore: 0.5,
      warningMessage: "Silakan isi nama keperluan dan nominal pengeluarannya.",
      isDuplicate: false,
      duplicateOfRef: null,
      status: "needs_review",
      notes: "",
      items: [
        {
          id: crypto.randomUUID(),
          receiptId,
          itemName: "",
          quantity: 1,
          unitPrice: 0,
          totalPrice: 0,
        },
      ],
      createdAt: new Date().toISOString(),
    };

    setReceipts((prev) => [...prev, draft]);
    setActiveReceiptId(receiptId);
    void saveReceipt(draft);
  }

  async function handleSaveVerified(updated: Receipt, moveNext: boolean) {
    userMutatedRef.current = true;
    const dupRef = findDuplicateReceipt(
      {
        id: updated.id,
        imageHash: updated.imageHash,
        transactionDate: updated.transactionDate,
        totalAmount: updated.totalAmount,
        merchantName: updated.merchantName,
      },
      receipts
    );
    const finalized: Receipt = {
      ...updated,
      isDuplicate: Boolean(dupRef),
      duplicateOfRef: dupRef,
    };

    const nextList = receipts.map((r) => (r.id === finalized.id ? finalized : r));
    setReceipts(nextList);
    announcePolite(`Nota ${finalized.referenceNumber} disimpan.`);
    void saveReceipt(finalized);

    if (!moveNext) {
      setActiveReceiptId(null);
      return;
    }

    const idx = nextList.findIndex((r) => r.id === finalized.id);
    const nextTarget =
      nextList.find((r, i) => i > idx && r.status === "needs_review") ??
      nextList.find((r) => r.id !== finalized.id && r.status === "needs_review") ??
      null;

    setActiveReceiptId(nextTarget ? nextTarget.id : null);
  }

  function handleDeleteOne(id: string) {
    if (!project) return;
    userMutatedRef.current = true;
    setReceipts((prev) => prev.filter((r) => r.id !== id));
    if (activeReceiptId === id) setActiveReceiptId(null);
    announcePolite("Nota dihapus.");
    void deleteReceipt(id, project.id);
  }

  function handleClearAll() {
    if (!project) return;
    userMutatedRef.current = true;
    setReceipts([]);
    announcePolite("Seluruh daftar nota dibersihkan.");
    void clearAllWorkspaceReceipts(project.id);
  }

  function handleDownloadExcel() {
    const snap = saveHeaderInBackground();
    if (!snap) return;
    exportProjectToExcel(snap, receipts);
    announcePolite("File Excel berhasil diunduh.");
  }

  async function handleDownloadPdf() {
    const snap = saveHeaderInBackground();
    if (!snap) return;
    setBusyExport("pdf");
    try {
      await exportProjectToPdfLpj(snap, receipts, pdfGrid);
      announcePolite("Dokumen PDF LPJ berhasil diunduh.");
    } finally {
      setBusyExport(null);
    }
  }

  async function handleDownloadDocx() {
    const snap = saveHeaderInBackground();
    if (!snap) return;
    setBusyExport("docx");
    try {
      await exportProjectToDocx(snap, receipts);
      announcePolite("Dokumen Word LPJ berhasil diunduh.");
    } finally {
      setBusyExport(null);
    }
  }

  function handleDownloadCsv() {
    const snap = saveHeaderInBackground();
    if (!snap) return;
    exportProjectToCsv(snap, receipts);
    announcePolite("File CSV berhasil diunduh.");
  }

  function handleDownloadHtml() {
    const snap = saveHeaderInBackground();
    if (!snap) return;
    exportProjectToHtml(snap, receipts);
    announcePolite("File Web HTML berhasil diunduh.");
  }

  function handleDownloadTxt() {
    const snap = saveHeaderInBackground();
    if (!snap) return;
    exportProjectToTxt(snap, receipts);
    announcePolite("File teks ringkasan berhasil diunduh.");
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-10 md:py-12 space-y-6 sm:space-y-8">
      <section className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="font-serif-ledger font-bold text-[clamp(1.65rem,4vw,2.35rem)] leading-tight text-[var(--ink-primary)] tracking-tight">
            Ubah foto struk jadi laporan keuangan rapi.
          </h1>
          <p className="text-sm sm:text-base text-[var(--ink-secondary)] max-w-2xl">
            Masukkan foto struk belanja atau nota warung sebanyak yang Anda punya, gratis tanpa daftar akun. Kalimat laporan LPJ, hitungan saldo, dan lampiran foto langsung tersusun otomatis.
          </p>
        </div>

        <Link
          href="/panduan"
          className="btn-secondary text-xs sm:text-sm no-underline shrink-0 self-start sm:self-auto"
        >
          <BookGuideIcon className="w-4 h-4 shrink-0" />
          <span>Cara Pakai &amp; Syarat Foto</span>
        </Link>
      </section>

      <section
        aria-label="Area unggah foto struk"
        onDragOver={(e) => {
          e.preventDefault();
          setIsDraggingOver(true);
        }}
        onDragLeave={() => setIsDraggingOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDraggingOver(false);
          void processFiles(e.dataTransfer.files);
        }}
        className={`rounded-[8px] border-2 border-dashed p-5 sm:p-8 text-center transition-colors ${
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
          disabled={uploading || viewState === "loading"}
          onChange={(e) => void processFiles(e.target.files)}
          className="sr-only"
        />

        <div className="max-w-xl mx-auto space-y-5">
          <div className="space-y-2.5">
            <label
              htmlFor="input-upload-nota-utama"
              className={`btn-stamp text-sm sm:text-base px-5 sm:px-7 py-3 w-full sm:w-auto ${
                uploading ? "opacity-60 pointer-events-none" : ""
              }`}
            >
              <UploadStackIcon className="w-5 h-5 shrink-0" />
              <span>
                {uploading
                  ? "Sedang Membaca Foto Struk..."
                  : "Pilih Foto Struk (Bisa Banyak Sekaligus)"}
              </span>
            </label>

            <p className="text-xs sm:text-sm text-[var(--ink-secondary)]">
              Bisa juga tarik foto dari folder ke kotak ini (JPG, PNG, atau WebP · maks. 25 MB/foto).
            </p>
          </div>

          <fieldset className="text-left space-y-2 pt-2 border-t border-[var(--border-subtle)]">
            <legend className="text-xs font-bold uppercase text-[var(--ink-secondary)] mb-1.5">
              Pilih cara mencatat isi struk:
            </legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                aria-pressed={extractionMode === "detailed"}
                onClick={() => setExtractionMode("detailed")}
                className={`min-h-[44px] p-3 rounded-[6px] border text-left transition-colors ${
                  extractionMode === "detailed"
                    ? "bg-[var(--verified-bg)] border-[var(--border-strong)]"
                    : "bg-[var(--bg-paper)] border-[var(--border-control)] hover:bg-[var(--bg-subtle)]"
                }`}
              >
                <span className="block text-xs sm:text-sm font-bold text-[var(--ink-primary)]">
                  Catat nama tiap barang
                </span>
                <span className="block text-xs text-[var(--ink-secondary)] mt-0.5">
                  Nama barang, jumlah beli, dan harga satuannya ditulis satu per satu.
                </span>
              </button>

              <button
                type="button"
                aria-pressed={extractionMode === "summary"}
                onClick={() => setExtractionMode("summary")}
                className={`min-h-[44px] p-3 rounded-[6px] border text-left transition-colors ${
                  extractionMode === "summary"
                    ? "bg-[var(--verified-bg)] border-[var(--border-strong)]"
                    : "bg-[var(--bg-paper)] border-[var(--border-control)] hover:bg-[var(--bg-subtle)]"
                }`}
              >
                <span className="block text-xs sm:text-sm font-bold text-[var(--ink-primary)]">
                  Catat total belanja saja
                </span>
                <span className="block text-xs text-[var(--ink-secondary)] mt-0.5">
                  Cukup ambil nama toko, tanggal, dan total bayar akhirnya (lebih cepat).
                </span>
              </button>
            </div>
          </fieldset>

          <div className="flex justify-center">
            <button
              type="button"
              disabled={uploading}
              onClick={() => void handleAddManualReceipt()}
              className="btn-secondary text-xs sm:text-sm w-full sm:w-auto"
            >
              <PlusBoxIcon className="w-4 h-4 shrink-0" />
              <span>Tambah pengeluaran tanpa foto struk</span>
            </button>
          </div>
        </div>

        {uploading && uploadStatusText && (
          <div
            role="status"
            aria-live="polite"
            className="mt-5 p-3 rounded-[6px] bg-[var(--bg-subtle)] border border-[var(--border-card)] text-xs font-mono-tabular text-[var(--ink-primary)] max-w-lg mx-auto"
          >
            {uploadStatusText}
          </div>
        )}
      </section>

      {viewState === "loading" && (
        <div
          role="status"
          aria-live="polite"
          className="p-6 rounded-[8px] bg-[var(--bg-surface)] border border-[var(--border-card)] text-center text-sm text-[var(--ink-secondary)]"
        >
          Menyiapkan ruang kerja nota...
        </div>
      )}

      {errorText && (
        <div
          role="alert"
          className="p-4 rounded-[8px] border-2 flex flex-wrap items-center justify-between gap-3 text-sm"
          style={{
            backgroundColor: "var(--stamp-tint-bg)",
            color: "var(--stamp-tint-ink)",
            borderColor: "var(--stamp-tint-border)",
          }}
        >
          <div className="flex items-start gap-2 font-semibold">
            <AlertTriangleIcon className="w-5 h-5 shrink-0 mt-0.5" />
            <span>{errorText}</span>
          </div>
          {viewState === "error" && (
            <button
              type="button"
              onClick={() => void loadData()}
              className="btn-secondary text-xs"
            >
              Muat Ulang
            </button>
          )}
        </div>
      )}

      {viewState === "ready" && receipts.length > 0 && project && narrative && (
        <section aria-label="Unduh laporan LPJ dan daftar nota" className="space-y-5">
          <div className="rounded-[8px] bg-[var(--bg-surface)] border-2 border-[var(--border-strong)] p-4 sm:p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
              <div className="md:col-span-7 min-w-0">
                <label
                  htmlFor="input-judul-laporan"
                  className="block text-xs font-bold uppercase text-[var(--ink-secondary)] mb-1"
                >
                  Judul Laporan / Nama Kegiatan
                </label>
                <input
                  id="input-judul-laporan"
                  type="text"
                  maxLength={140}
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  onBlur={() => saveHeaderInBackground()}
                  placeholder="Contoh: Laporan Keuangan Panitia Pentas Seni"
                  className="input-ledger font-semibold"
                />
              </div>

              <div className="md:col-span-5">
                <label
                  htmlFor="select-grid-pdf"
                  className="block text-xs font-bold uppercase text-[var(--ink-secondary)] mb-1"
                >
                  Ukuran Lampiran Foto di PDF
                </label>
                <select
                  id="select-grid-pdf"
                  value={pdfGrid}
                  onChange={(e) => setPdfGrid(e.target.value as PdfGridDensity)}
                  className="input-ledger text-sm font-semibold"
                >
                  <option value="2x2">4 foto struk per halaman (Lebih besar)</option>
                  <option value="2x3">6 foto struk per halaman (Hemat kertas)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <button
                type="button"
                disabled={busyExport !== null}
                onClick={() => void handleDownloadPdf()}
                className="btn-stamp w-full"
              >
                <PdfDocumentIcon className="w-4 h-4 shrink-0" />
                <span>
                  {busyExport === "pdf" ? "Menyusun PDF..." : "Unduh PDF (.pdf)"}
                </span>
              </button>

              <button
                type="button"
                disabled={busyExport !== null}
                onClick={() => void handleDownloadDocx()}
                className="btn-ledger w-full"
              >
                <WordDocumentIcon className="w-4 h-4 shrink-0" />
                <span>
                  {busyExport === "docx" ? "Menyusun Word..." : "Unduh Word (.docx)"}
                </span>
              </button>

              <button
                type="button"
                onClick={handleDownloadExcel}
                className="btn-secondary w-full"
              >
                <SpreadsheetIcon className="w-4 h-4 shrink-0" />
                <span>Unduh Excel (.xlsx)</span>
              </button>
            </div>

            <div className="pt-2.5 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[var(--ink-secondary)]">
                Ekspor ke format file lainnya:
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadCsv}
                  className="btn-secondary !py-1.5 !px-3 text-xs"
                >
                  <DownloadTrayIcon className="w-3.5 h-3.5 shrink-0" />
                  <span>CSV (.csv)</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadHtml}
                  className="btn-secondary !py-1.5 !px-3 text-xs"
                >
                  <DownloadTrayIcon className="w-3.5 h-3.5 shrink-0" />
                  <span>Halaman Web (.html)</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadTxt}
                  className="btn-secondary !py-1.5 !px-3 text-xs"
                >
                  <DownloadTrayIcon className="w-3.5 h-3.5 shrink-0" />
                  <span>Teks Ringkas (.txt)</span>
                </button>
              </div>
            </div>

            <details className="pt-2 border-t border-[var(--border-subtle)] text-sm">
              <summary className="font-semibold text-[var(--ink-primary)] min-h-[44px] inline-flex items-center">
                Isi dana awal &amp; nama penanda tangan laporan (opsional)
              </summary>
              <div className="pt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label
                    htmlFor="opt-dana-awal"
                    className="block text-xs font-semibold text-[var(--ink-secondary)] mb-1"
                  >
                    Dana Awal yang Diterima (Rp)
                  </label>
                  <input
                    id="opt-dana-awal"
                    type="text"
                    inputMode="numeric"
                    maxLength={20}
                    value={budgetInput}
                    onChange={(e) => setBudgetInput(e.target.value)}
                    onBlur={() => saveHeaderInBackground()}
                    placeholder="Contoh: 3000000"
                    className="input-ledger font-mono-tabular text-sm"
                  />
                </div>
                <div>
                  <label
                    htmlFor="opt-ketua"
                    className="block text-xs font-semibold text-[var(--ink-secondary)] mb-1"
                  >
                    Nama Ketua / Penanggung Jawab
                  </label>
                  <input
                    id="opt-ketua"
                    type="text"
                    maxLength={100}
                    value={chairpersonInput}
                    onChange={(e) => setChairpersonInput(e.target.value)}
                    onBlur={() => saveHeaderInBackground()}
                    placeholder="Boleh dikosongkan"
                    className="input-ledger text-sm"
                  />
                </div>
                <div>
                  <label
                    htmlFor="opt-bendahara"
                    className="block text-xs font-semibold text-[var(--ink-secondary)] mb-1"
                  >
                    Nama Bendahara / Penyusun
                  </label>
                  <input
                    id="opt-bendahara"
                    type="text"
                    maxLength={100}
                    value={treasurerInput}
                    onChange={(e) => setTreasurerInput(e.target.value)}
                    onBlur={() => saveHeaderInBackground()}
                    placeholder="Boleh dikosongkan"
                    className="input-ledger text-sm"
                  />
                </div>
              </div>
            </details>

            <details className="pt-2 border-t border-[var(--border-subtle)] text-sm">
              <summary className="font-semibold text-[var(--ink-secondary)] min-h-[44px] inline-flex items-center">
                Lihat kalimat laporan LPJ yang dibuat otomatis dari data Anda
              </summary>
              <div className="mt-2 p-3.5 sm:p-4 rounded-[6px] bg-[var(--bg-paper)] border border-[var(--border-card)] space-y-2.5 text-xs sm:text-sm text-[var(--ink-primary)] leading-relaxed">
                <p>{narrative.openingParagraph}</p>
                <p>{narrative.financialParagraph}</p>
                <p>{narrative.categoryParagraph}</p>
                <p>{narrative.closingParagraph}</p>
              </div>
            </details>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2.5 px-1">
            <div className="text-sm text-[var(--ink-secondary)] flex flex-wrap items-center gap-2">
              <span>
                <strong className="text-[var(--ink-primary)] font-mono-tabular">
                  {receipts.length} nota
                </strong>{" "}
                · Total belanja{" "}
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
                  {needsReviewCount} perlu dicek angkanya
                </span>
              )}
              {cloudConnected && (
                <span className="text-xs text-[var(--ink-muted)]">
                  · Tersimpan otomatis
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={handleClearAll}
              className="btn-secondary !py-1.5 !px-3 text-xs"
            >
              <TrashBinIcon className="w-4 h-4 shrink-0" />
              <span>Hapus Semua</span>
            </button>
          </div>

          <ul className="space-y-3">
            {receipts.map((r) => (
              <li
                key={r.id}
                className="rounded-[8px] bg-[var(--bg-surface)] border border-[var(--border-card)] p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => setActiveReceiptId(r.id)}
                    aria-label={`Lihat foto struk ${r.referenceNumber}`}
                    className="w-12 h-14 shrink-0 rounded-[4px] border border-[var(--border-control)] overflow-hidden bg-white"
                  >
                    <img
                      src={r.imageUrl}
                      alt={`Foto ${r.referenceNumber}`}
                      width={48}
                      height={56}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="stamp-ref">#{r.referenceNumber}</span>
                      <span className="text-xs font-mono-tabular text-[var(--ink-secondary)]">
                        {formatShortDateId(r.transactionDate)} · {r.category}
                      </span>
                      {r.isDuplicate && (
                        <span
                          className="text-[11px] font-bold px-2 py-0.5 rounded-[3px] border"
                          style={{
                            backgroundColor: "var(--stamp-tint-bg)",
                            color: "var(--stamp-tint-ink)",
                            borderColor: "var(--stamp-tint-border)",
                          }}
                        >
                          Mirip dengan #{r.duplicateOfRef}
                        </span>
                      )}
                    </div>

                    <p className="font-bold text-base text-[var(--ink-primary)] truncate mt-0.5">
                      {r.merchantName}
                    </p>
                    <p className="sm:hidden font-mono-tabular font-bold text-base text-[var(--ink-primary)] mt-1">
                      {formatRupiah(r.totalAmount)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-2 pt-2.5 sm:pt-0 border-t sm:border-t-0 border-[var(--border-subtle)]">
                  <span className="hidden sm:inline font-mono-tabular font-bold text-lg text-[var(--ink-primary)] mr-1">
                    {formatRupiah(r.totalAmount)}
                  </span>

                  <button
                    type="button"
                    onClick={() => setActiveReceiptId(r.id)}
                    className={`${
                      r.status === "needs_review" ? "btn-stamp" : "btn-secondary"
                    } flex-1 sm:flex-initial !py-1.5 !px-3.5 text-xs`}
                  >
                    {r.status === "verified" ? (
                      <>
                        <StampCheckIcon className="w-4 h-4 shrink-0" />
                        <span>Sudah pas · Ubah</span>
                      </>
                    ) : (
                      <span>Cek angkanya</span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDeleteOne(r.id)}
                    aria-label={`Hapus ${r.referenceNumber}`}
                    className="btn-secondary !p-2.5 min-w-[44px]"
                  >
                    <TrashBinIcon className="w-4 h-4" />
                  </button>
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
          onSaveReceipt={handleSaveVerified}
          onDeleteReceipt={async (id) => handleDeleteOne(id)}
        />
      )}
    </div>
  );
}
