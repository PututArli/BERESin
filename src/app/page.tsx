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
        err instanceof Error ? err.message : "Gagal memuat daftar nota."
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

  const requestOcrExtraction = useCallback(
    async (
      imageDataUrl: string,
      mimeType: string,
      fileName: string,
      categories: string[],
      mode: ExtractionMode
    ): Promise<{
      extracted: OcrExtractedPayload | null;
      aiUsed: boolean;
      errorDetail: string | null;
    }> => {
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
            imageBase64: imageDataUrl,
            mimeType: mimeType || "image/jpeg",
            fileName,
            categories,
            extractionMode: mode,
          }),
        });

        const json = await resp.json().catch(() => ({}));
        if (resp.ok && json?.data) {
          return {
            extracted: json.data as OcrExtractedPayload,
            aiUsed: Boolean(json.aiUsed),
            errorDetail: null,
          };
        }

        return {
          extracted: null,
          aiUsed: false,
          errorDetail:
            typeof json?.error === "string"
              ? json.error
              : "Analisis foto belum berhasil dijalankan.",
        };
      } catch {
        return {
          extracted: null,
          aiUsed: false,
          errorDetail: "Gagal terhubung ke server pembaca struk.",
        };
      }
    },
    [settings.geminiApiKey]
  );

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
      setErrorText("Format ditolak: gunakan foto JPG, PNG, atau WebP (maks. 25 MB).");
      return;
    }

    userMutatedRef.current = true;
    let noticeMessage =
      skippedCount > 0
        ? `${skippedCount} file dilewati (hanya menerima JPG, PNG, WebP maks. 25 MB).`
        : "";
    setErrorText(noticeMessage);
    setUploading(true);
    let firstAddedId: string | null = null;
    const createdList: Receipt[] = [];

    try {
      for (let i = 0; i < verifiedFiles.length; i += 1) {
        const file = verifiedFiles[i];
        setUploadStatusText(`Membaca ${i + 1}/${verifiedFiles.length}: ${file.name}`);

        let compressed: Blob = file;
        try {
          // Keep 2048px resolution so tall supermarket/thermal receipts stay sharp for OCR.
          compressed = await imageCompression(file, {
            maxSizeMB: 1.8,
            maxWidthOrHeight: 2048,
            initialQuality: 0.88,
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

        const { extracted, aiUsed, errorDetail } = await requestOcrExtraction(
          dataUrl,
          compressed.type || "image/jpeg",
          file.name,
          project.categories,
          extractionMode
        );

        if (errorDetail) {
          noticeMessage = errorDetail;
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
          merchantName: extracted?.merchant_name || "Struk Belum Terbaca",
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
          warningMessage: extracted?.warning_message ?? errorDetail ?? null,
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

      if (noticeMessage) {
        setErrorText(noticeMessage);
      }

      setReceipts((prev) =>
        [...prev, ...createdList].sort((a, b) =>
          a.referenceNumber.localeCompare(b.referenceNumber)
        )
      );
      announcePolite(`${createdList.length} nota ditambahkan.`);

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

  const handleReanalyzeReceipt = useCallback(
    async (targetReceipt: Receipt): Promise<Receipt | null> => {
      if (!project) return null;
      const mimeMatch = targetReceipt.imageUrl.match(/^data:(image\/[a-z+]+);base64,/i);
      const mime = mimeMatch ? mimeMatch[1] : "image/jpeg";

      const { extracted, aiUsed, errorDetail } = await requestOcrExtraction(
        targetReceipt.imageUrl,
        mime,
        targetReceipt.referenceNumber,
        project.categories,
        targetReceipt.extractionMode || extractionMode
      );

      if (!extracted) {
        throw new Error(errorDetail ?? "Gagal membaca ulang foto.");
      }

      const confidence = extracted.confidence_score ?? 0.85;
      const autoVerified =
        aiUsed && confidence >= 0.85 && (extracted.total_amount ?? 0) > 0;

      const refreshed: Receipt = {
        ...targetReceipt,
        merchantName: extracted.merchant_name || targetReceipt.merchantName,
        transactionDate: extracted.transaction_date ?? targetReceipt.transactionDate,
        category:
          extracted.category && project.categories.includes(extracted.category)
            ? extracted.category
            : targetReceipt.category,
        subtotal: extracted.subtotal ?? extracted.total_amount ?? 0,
        taxAndService: extracted.tax_and_service ?? 0,
        discount: extracted.discount ?? 0,
        totalAmount: extracted.total_amount ?? 0,
        paymentMethod: extracted.payment_method ?? "Tunai",
        confidenceScore: confidence,
        warningMessage: extracted.warning_message ?? null,
        status: autoVerified ? "verified" : "needs_review",
        items: (extracted.items ?? []).map((it) => ({
          id: crypto.randomUUID(),
          receiptId: targetReceipt.id,
          itemName: it.item_name,
          quantity: it.quantity,
          unitPrice: it.unit_price,
          totalPrice: it.total_price,
        })),
      };

      userMutatedRef.current = true;
      setReceipts((prev) =>
        prev.map((r) => (r.id === refreshed.id ? refreshed : r))
      );
      void saveReceipt(refreshed);
      announcePolite(`Nota ${refreshed.referenceNumber} diperbarui.`);
      return refreshed;
    },
    [announcePolite, extractionMode, project, requestOcrExtraction]
  );

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
      merchantName: "Pengeluaran Manual",
      transactionDate: dateToday,
      category: project.categories[0] ?? "Lain-lain",
      subtotal: 0,
      taxAndService: 0,
      discount: 0,
      totalAmount: 0,
      paymentMethod: "Tunai",
      confidenceScore: 1,
      warningMessage: null,
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
    announcePolite("Daftar nota dibersihkan.");
    void clearAllWorkspaceReceipts(project.id);
  }

  function handleDownloadExcel() {
    const snap = saveHeaderInBackground();
    if (!snap) return;
    exportProjectToExcel(snap, receipts);
    announcePolite("Excel diunduh.");
  }

  async function handleDownloadPdf() {
    const snap = saveHeaderInBackground();
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
    const snap = saveHeaderInBackground();
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
    const snap = saveHeaderInBackground();
    if (!snap) return;
    exportProjectToCsv(snap, receipts);
  }

  function handleDownloadHtml() {
    const snap = saveHeaderInBackground();
    if (!snap) return;
    exportProjectToHtml(snap, receipts);
  }

  function handleDownloadTxt() {
    const snap = saveHeaderInBackground();
    if (!snap) return;
    exportProjectToTxt(snap, receipts);
  }

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
          setIsDraggingOver(true);
        }}
        onDragLeave={() => setIsDraggingOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDraggingOver(false);
          void processFiles(e.dataTransfer.files);
        }}
        className={`rounded-[8px] border-2 border-dashed p-4 sm:p-7 text-center transition-colors ${
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

        <div className="max-w-md mx-auto space-y-3.5">
          <div className="space-y-1.5">
            <label
              htmlFor="input-upload-nota-utama"
              className={`btn-stamp text-sm sm:text-base px-5 py-2.5 w-full sm:w-auto ${
                uploading ? "opacity-60 pointer-events-none" : ""
              }`}
            >
              <UploadStackIcon className="w-5 h-5 shrink-0" />
              <span>
                {uploading ? "Menganalisis Foto..." : "Pilih Foto Struk"}
              </span>
            </label>

            <p className="text-xs text-[var(--ink-secondary)]">
              Bisa banyak sekaligus · JPG, PNG, WebP (maks. 25 MB)
            </p>
          </div>

          <div className="pt-1 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2">
            <fieldset className="grid grid-cols-2 sm:inline-flex p-0.5 rounded-[6px] bg-[var(--bg-paper)] border border-[var(--border-control)]">
              <legend className="sr-only">Detail pencatatan struk</legend>
              <button
                type="button"
                aria-pressed={extractionMode === "detailed"}
                onClick={() => setExtractionMode("detailed")}
                className={`min-h-[44px] px-3 rounded-[5px] text-xs font-semibold ${
                  extractionMode === "detailed"
                    ? "bg-[var(--color-ledger)] text-[var(--color-ledger-ink)]"
                    : "text-[var(--ink-primary)]"
                }`}
              >
                Per Barang
              </button>
              <button
                type="button"
                aria-pressed={extractionMode === "summary"}
                onClick={() => setExtractionMode("summary")}
                className={`min-h-[44px] px-3 rounded-[5px] text-xs font-semibold ${
                  extractionMode === "summary"
                    ? "bg-[var(--color-ledger)] text-[var(--color-ledger-ink)]"
                    : "text-[var(--ink-primary)]"
                }`}
              >
                Total Saja
              </button>
            </fieldset>

            <button
              type="button"
              disabled={uploading}
              onClick={() => void handleAddManualReceipt()}
              className="btn-secondary text-xs !px-3"
            >
              <PlusBoxIcon className="w-4 h-4 shrink-0" />
              <span>Input Manual</span>
            </button>
          </div>
        </div>

        {uploading && uploadStatusText && (
          <div
            role="status"
            aria-live="polite"
            className="mt-4 p-2.5 rounded-[6px] bg-[var(--bg-subtle)] border border-[var(--border-card)] text-xs font-mono-tabular text-[var(--ink-primary)] max-w-md mx-auto truncate"
          >
            {uploadStatusText}
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

      {errorText && (
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
            <span>{errorText}</span>
          </div>
          {viewState === "error" && (
            <button
              type="button"
              onClick={() => void loadData()}
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
                onBlur={() => saveHeaderInBackground()}
                placeholder="Laporan Keuangan Kegiatan"
                className="input-ledger font-semibold text-sm"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                disabled={busyExport !== null}
                onClick={() => void handleDownloadPdf()}
                className="btn-stamp w-full text-sm"
              >
                <PdfDocumentIcon className="w-4 h-4 shrink-0" />
                <span>{busyExport === "pdf" ? "Menyusun..." : "Unduh PDF"}</span>
              </button>

              <button
                type="button"
                disabled={busyExport !== null}
                onClick={() => void handleDownloadDocx()}
                className="btn-ledger w-full text-sm"
              >
                <WordDocumentIcon className="w-4 h-4 shrink-0" />
                <span>{busyExport === "docx" ? "Menyusun..." : "Unduh Word"}</span>
              </button>

              <button
                type="button"
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
                onClick={handleDownloadCsv}
                className="btn-secondary !py-1.5 !px-2 text-xs"
              >
                CSV (.csv)
              </button>
              <button
                type="button"
                onClick={handleDownloadHtml}
                className="btn-secondary !py-1.5 !px-2 text-xs"
              >
                Web (.html)
              </button>
              <button
                type="button"
                onClick={handleDownloadTxt}
                className="btn-secondary !py-1.5 !px-2 text-xs"
              >
                Teks (.txt)
              </button>
            </div>

            <details className="pt-2 border-t border-[var(--border-subtle)] text-xs sm:text-sm">
              <summary className="font-semibold text-[var(--ink-secondary)] min-h-[44px] py-1.5 flex items-center justify-between gap-2">
                <span>Pengaturan LPJ &amp; pratinjau teks otomatis</span>
              </summary>
              <div className="pt-3 space-y-3">
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
                      onBlur={() => saveHeaderInBackground()}
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
                      onBlur={() => saveHeaderInBackground()}
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
                      onBlur={() => saveHeaderInBackground()}
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

                <div className="p-3 rounded-[6px] bg-[var(--bg-paper)] border border-[var(--border-card)] space-y-2 text-xs text-[var(--ink-secondary)] leading-relaxed">
                  <p className="font-bold text-[var(--ink-primary)]">
                    Pratinjau Narasi LPJ Otomatis:
                  </p>
                  <p>{narrative.openingParagraph}</p>
                  <p>{narrative.financialParagraph}</p>
                  <p>{narrative.categoryParagraph}</p>
                </div>
              </div>
            </details>
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
              onClick={handleClearAll}
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
                      onClick={() => handleDeleteOne(r.id)}
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
          onSaveReceipt={handleSaveVerified}
          onDeleteReceipt={async (id) => handleDeleteOne(id)}
          onReanalyzeReceipt={handleReanalyzeReceipt}
        />
      )}
    </div>
  );
}
