"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  loadActiveWorkspace,
  nextReferenceNumber,
  saveReceipt,
  seedSampleReceipts,
  updateWorkspaceMeta,
} from "@/lib/storage";
import {
  computeBlobHash,
  formatRupiah,
  formatShortDateId,
  parseIndonesianMoneyInput,
  todayIsoDate,
} from "@/lib/format";
import { exportProjectToExcel } from "@/lib/export-excel";
import { exportProjectToPdfLpj } from "@/lib/export-pdf";
import { renderSimulatedReceiptDataUrl } from "@/lib/receipt-canvas";
import { useLedger } from "@/components/providers/LedgerProvider";
import { SplitScreenVerifierModal } from "@/components/receipts/SplitScreenVerifierModal";
import {
  AlertTriangleIcon,
  PdfDocumentIcon,
  PlusBoxIcon,
  SpreadsheetIcon,
  StampCheckIcon,
  TrashBinIcon,
  UploadStackIcon,
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
  const [exportingPdf, setExportingPdf] = useState(false);
  const [seedingSample, setSeedingSample] = useState(false);

  const [titleInput, setTitleInput] = useState("Laporan Pengeluaran Kegiatan");
  const [budgetInput, setBudgetInput] = useState("");
  const [chairpersonInput, setChairpersonInput] = useState("");
  const [treasurerInput, setTreasurerInput] = useState("");

  const [activeReceiptId, setActiveReceiptId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadData = useCallback(async () => {
    setViewState("loading");
    setErrorText("");
    try {
      const data = await loadActiveWorkspace();
      setProject(data.project);
      setReceipts(data.receipts);
      setCloudConnected(data.cloudConnected);
      setTitleInput(data.project.title);
      setBudgetInput(
        data.project.initialBudget > 0 ? String(data.project.initialBudget) : ""
      );
      setChairpersonInput(data.project.chairpersonName || "");
      setTreasurerInput(data.project.treasurerName || "");
      setViewState("ready");
    } catch (err) {
      setErrorText(
        err instanceof Error ? err.message : "Gagal memuat ruang kerja nota."
      );
      setViewState("error");
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const totalSpent = useMemo(
    () => receipts.reduce((sum, r) => sum + r.totalAmount, 0),
    [receipts]
  );

  const needsReviewCount = useMemo(
    () => receipts.filter((r) => r.status === "needs_review").length,
    [receipts]
  );

  async function persistHeaderMeta(overrides?: Partial<Project>): Promise<Project | null> {
    if (!project) return null;
    const updated: Project = {
      ...project,
      title: titleInput.trim() || "Laporan Pengeluaran Kegiatan",
      initialBudget: parseIndonesianMoneyInput(budgetInput),
      chairpersonName: chairpersonInput.trim(),
      treasurerName: treasurerInput.trim(),
      ...overrides,
    };
    setProject(updated);
    await updateWorkspaceMeta(updated);
    return updated;
  }

  async function processFiles(fileList: FileList | File[] | null) {
    if (!fileList || !project) return;
    const files = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
    if (files.length === 0) {
      setErrorText("Pilih berkas gambar berformat JPG, PNG, atau WebP.");
      return;
    }

    setErrorText("");
    setUploading(true);
    let firstAddedId: string | null = null;
    const createdList: Receipt[] = [];

    try {
      for (let i = 0; i < files.length; i += 1) {
        const file = files[i];
        setUploadStatusText(
          `Memproses foto ${i + 1} dari ${files.length} (${file.name})...`
        );

        let compressed: Blob = file;
        try {
          compressed = await imageCompression(file, {
            maxSizeMB: 1,
            maxWidthOrHeight: 1200,
            useWebWorker: true,
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
          // Keep compressed photo for manual review when offline
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
            file.name.replace(/\.[^.]+$/, "") ||
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
      announcePolite(`${createdList.length} foto nota selesai ditambahkan.`);

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
    const refNum = await nextReferenceNumber(project.id);
    const receiptId = crypto.randomUUID();
    const blankImg = renderSimulatedReceiptDataUrl({
      kind: "warung",
      refLabel: refNum,
      title: "CATATAN MANUAL",
      subtitle: "Isi rincian di formulir kanan",
      dateText: todayIsoDate(),
      lines: [{ label: "Pengeluaran manual", qty: "1x", price: "Rp 0" }],
      footerRows: [{ label: "TOTAL", value: "Rp 0", bold: true }],
    });

    const created = await saveReceipt({
      id: receiptId,
      projectId: project.id,
      referenceNumber: refNum,
      imageUrl: blankImg,
      imageHash: `manual-${receiptId}`,
      extractionMode: "detailed",
      merchantName: "Pengeluaran Manual",
      transactionDate: todayIsoDate(),
      category: project.categories[0] ?? "Lain-lain",
      subtotal: 0,
      taxAndService: 0,
      discount: 0,
      totalAmount: 0,
      paymentMethod: "Tunai",
      confidenceScore: 0.5,
      warningMessage: "Isi nama toko dan total pengeluaran sesuai bukti fisik.",
      isDuplicate: false,
      duplicateOfRef: null,
      isSimulation: true,
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
    });

    setReceipts((prev) => [...prev, created]);
    setActiveReceiptId(receiptId);
  }

  async function handleLoadSample() {
    if (!project) return;
    setSeedingSample(true);
    try {
      const added = await seedSampleReceipts(project.id);
      setReceipts((prev) =>
        [...prev, ...added].sort((a, b) =>
          a.referenceNumber.localeCompare(b.referenceNumber)
        )
      );
      announcePolite("3 contoh nota simulasi telah dimuat.");
    } finally {
      setSeedingSample(false);
    }
  }

  async function handleSaveVerified(updated: Receipt, moveNext: boolean) {
    const saved = await saveReceipt(updated);
    const nextList = receipts.map((r) => (r.id === saved.id ? saved : r));
    setReceipts(nextList);
    announcePolite(`Nota ${saved.referenceNumber} disimpan.`);

    if (!moveNext) {
      setActiveReceiptId(null);
      return;
    }

    const idx = nextList.findIndex((r) => r.id === saved.id);
    const nextTarget =
      nextList.find((r, i) => i > idx && r.status === "needs_review") ??
      nextList.find((r) => r.id !== saved.id && r.status === "needs_review") ??
      null;

    setActiveReceiptId(nextTarget ? nextTarget.id : null);
  }

  async function handleDeleteOne(id: string) {
    await deleteReceipt(id);
    setReceipts((prev) => prev.filter((r) => r.id !== id));
    if (activeReceiptId === id) setActiveReceiptId(null);
    announcePolite("Nota dihapus.");
  }

  async function handleClearAll() {
    if (!project) return;
    await clearAllWorkspaceReceipts(project.id);
    setReceipts([]);
    announcePolite("Seluruh daftar nota dibersihkan.");
  }

  async function handleDownloadExcel() {
    const latestProject = await persistHeaderMeta();
    if (!latestProject) return;
    const hasSimulation = receipts.some((r) => r.isSimulation);
    exportProjectToExcel(
      { ...latestProject, isSimulation: hasSimulation },
      receipts
    );
    announcePolite("Berkas Excel berhasil diunduh.");
  }

  async function handleDownloadPdf() {
    const latestProject = await persistHeaderMeta();
    if (!latestProject) return;
    setExportingPdf(true);
    try {
      const hasSimulation = receipts.some((r) => r.isSimulation);
      await exportProjectToPdfLpj(
        { ...latestProject, isSimulation: hasSimulation },
        receipts,
        pdfGrid
      );
      announcePolite("Dokumen PDF LPJ berhasil diunduh.");
    } finally {
      setExportingPdf(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8">
      <section className="space-y-2">
        <h1 className="font-serif-ledger font-bold text-3xl sm:text-4xl text-[var(--ink-primary)] tracking-tight">
          Ubah foto nota jadi Excel &amp; PDF LPJ.
        </h1>
        <p className="text-base text-[var(--ink-secondary)] max-w-2xl">
          Unggah foto struk belanja atau nota warung sebanyak apa pun secara gratis tanpa kuota, lalu langsung unduh tabel rekap dan lampiran fotonya.
        </p>
      </section>

      {/* Kotak Unggah Utama: fokus tunggal halaman */}
      <section
        aria-label="Area unggah foto nota"
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
        className={`rounded-[8px] border-2 border-dashed p-4 sm:p-10 text-center transition-colors ${
          isDraggingOver
            ? "bg-[var(--verified-bg)] border-[var(--color-ledger)]"
            : "bg-[var(--bg-surface)] border-[var(--border-control)]"
        }`}
      >
        <input
          ref={fileInputRef}
          id="input-upload-nota-utama"
          type="file"
          accept="image/*"
          multiple
          disabled={uploading || viewState === "loading"}
          onChange={(e) => void processFiles(e.target.files)}
          className="sr-only"
        />

        <div className="max-w-md mx-auto space-y-4">
          <label
            htmlFor="input-upload-nota-utama"
            className={`btn-stamp text-base px-4 sm:px-6 py-3 w-full sm:w-auto ${
              uploading ? "opacity-60 pointer-events-none" : ""
            }`}
          >
            <UploadStackIcon className="w-5 h-5" />
            <span>
              {uploading ? "Sedang Memproses Foto..." : "Pilih Foto Nota (Bisa Banyak)"}
            </span>
          </label>

          <p className="text-xs sm:text-sm text-[var(--ink-secondary)]">
            Atau tarik dan lepas foto struk ke kotak ini (JPG, PNG, WebP).
          </p>

          <div className="pt-2 flex flex-wrap items-center justify-center gap-2">
            <fieldset className="inline-flex flex-wrap items-center gap-1 p-1 rounded-[6px] bg-[var(--bg-paper)] border border-[var(--border-control)]">
              <legend className="sr-only">Cara baca nota</legend>
              <button
                type="button"
                aria-pressed={extractionMode === "detailed"}
                onClick={() => setExtractionMode("detailed")}
                className={`min-h-[44px] px-3 rounded-[4px] text-xs font-semibold ${
                  extractionMode === "detailed"
                    ? "bg-[var(--color-ledger)] text-[var(--color-ledger-ink)]"
                    : "text-[var(--ink-primary)]"
                }`}
              >
                Baca Rincian Barang
              </button>
              <button
                type="button"
                aria-pressed={extractionMode === "summary"}
                onClick={() => setExtractionMode("summary")}
                className={`min-h-[44px] px-3 rounded-[4px] text-xs font-semibold ${
                  extractionMode === "summary"
                    ? "bg-[var(--color-ledger)] text-[var(--color-ledger-ink)]"
                    : "text-[var(--ink-primary)]"
                }`}
              >
                Total Saja (Cepat)
              </button>
            </fieldset>

            <button
              type="button"
              disabled={uploading}
              onClick={() => void handleAddManualReceipt()}
              className="btn-secondary text-xs"
            >
              <PlusBoxIcon className="w-4 h-4" />
              <span>Catat Manual</span>
            </button>

            {receipts.length === 0 && (
              <button
                type="button"
                disabled={seedingSample || uploading}
                onClick={() => void handleLoadSample()}
                className="btn-secondary text-xs"
              >
                {seedingSample
                  ? "Memuat..."
                  : "Coba 3 Contoh [DATA SIMULASI]"}
              </button>
            )}
          </div>
        </div>

        {uploading && uploadStatusText && (
          <div
            role="status"
            aria-live="polite"
            className="mt-5 p-3 rounded-[6px] bg-[var(--bg-subtle)] border border-[var(--border-control)] text-xs font-mono-tabular text-[var(--ink-primary)] max-w-lg mx-auto"
          >
            {uploadStatusText}
          </div>
        )}
      </section>

      {viewState === "loading" && (
        <div
          role="status"
          aria-live="polite"
          className="p-6 rounded-[8px] bg-[var(--bg-surface)] border border-[var(--border-control)] text-center text-sm text-[var(--ink-secondary)]"
        >
          Memuat daftar nota tersimpan...
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
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangleIcon className="w-5 h-5 shrink-0" />
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

      {/* Bilah Langsung Unduh & Daftar Nota: hanya tampil saat sudah ada nota agar halaman awal tetap bersih */}
      {viewState === "ready" && receipts.length > 0 && project && (
        <section aria-label="Unduh laporan dan daftar nota" className="space-y-5">
          <div className="rounded-[8px] bg-[var(--bg-surface)] border-2 border-[var(--color-ledger)] p-4 sm:p-5 space-y-4">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div className="flex-1 min-w-0">
                <label
                  htmlFor="input-judul-laporan"
                  className="block text-xs font-bold uppercase text-[var(--ink-secondary)] mb-1"
                >
                  Judul Laporan LPJ
                </label>
                <input
                  id="input-judul-laporan"
                  type="text"
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  onBlur={() => void persistHeaderMeta()}
                  placeholder="Contoh: LPJ Kepanitiaan Seminar"
                  className="input-ledger font-semibold"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleDownloadExcel()}
                  className="btn-secondary"
                >
                  <SpreadsheetIcon className="w-4 h-4 text-[var(--color-ledger)]" />
                  <span>Unduh Excel (.xlsx)</span>
                </button>

                <label htmlFor="select-grid-pdf" className="sr-only">
                  Jumlah foto per halaman PDF
                </label>
                <select
                  id="select-grid-pdf"
                  value={pdfGrid}
                  onChange={(e) => setPdfGrid(e.target.value as PdfGridDensity)}
                  className="input-ledger !w-auto text-xs font-semibold"
                >
                  <option value="2x2">4 Nota / A4</option>
                  <option value="2x3">6 Nota / A4</option>
                </select>

                <button
                  type="button"
                  disabled={exportingPdf}
                  onClick={() => void handleDownloadPdf()}
                  className="btn-ledger"
                >
                  <PdfDocumentIcon className="w-4 h-4" />
                  <span>
                    {exportingPdf ? "Menyiapkan PDF..." : "Unduh PDF (.pdf)"}
                  </span>
                </button>
              </div>
            </div>

            <details className="pt-2 border-t border-[var(--border-subtle)] text-sm">
              <summary className="font-semibold text-[var(--ink-secondary)] min-h-[44px] inline-flex items-center">
                Opsi tambahan cetak PDF (dana awal &amp; nama tanda tangan)
              </summary>
              <div className="pt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                    value={budgetInput}
                    onChange={(e) => setBudgetInput(e.target.value)}
                    onBlur={() => void persistHeaderMeta()}
                    placeholder="Contoh: 3000000"
                    className="input-ledger font-mono-tabular text-sm"
                  />
                </div>
                <div>
                  <label
                    htmlFor="opt-ketua"
                    className="block text-xs font-semibold text-[var(--ink-secondary)] mb-1"
                  >
                    Nama Ketua Pelaksana
                  </label>
                  <input
                    id="opt-ketua"
                    type="text"
                    value={chairpersonInput}
                    onChange={(e) => setChairpersonInput(e.target.value)}
                    onBlur={() => void persistHeaderMeta()}
                    placeholder="Opsional"
                    className="input-ledger text-sm"
                  />
                </div>
                <div>
                  <label
                    htmlFor="opt-bendahara"
                    className="block text-xs font-semibold text-[var(--ink-secondary)] mb-1"
                  >
                    Nama Bendahara
                  </label>
                  <input
                    id="opt-bendahara"
                    type="text"
                    value={treasurerInput}
                    onChange={(e) => setTreasurerInput(e.target.value)}
                    onBlur={() => void persistHeaderMeta()}
                    placeholder="Opsional"
                    className="input-ledger text-sm"
                  />
                </div>
              </div>
            </details>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <div className="text-sm text-[var(--ink-secondary)] flex flex-wrap items-center gap-2">
              <span>
                <strong className="text-[var(--ink-primary)] font-mono-tabular">
                  {receipts.length} nota
                </strong>{" "}
                · Total{" "}
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
                  {needsReviewCount} perlu dicek
                </span>
              )}
              {cloudConnected && (
                <span className="text-xs text-[var(--ink-muted)]">
                  · Tersinkron ke Supabase
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => void handleClearAll()}
              className="btn-secondary !py-1.5 !px-3 text-xs"
            >
              <TrashBinIcon className="w-4 h-4" />
              <span>Bersihkan Semua</span>
            </button>
          </div>

          <ul className="space-y-3">
            {receipts.map((r) => (
              <li
                key={r.id}
                className="rounded-[8px] bg-[var(--bg-surface)] border border-[var(--border-control)] p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
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
                          className="text-[11px] font-bold px-2 py-0.5 rounded-[2px] border"
                          style={{
                            backgroundColor: "var(--stamp-tint-bg)",
                            color: "var(--stamp-tint-ink)",
                            borderColor: "var(--stamp-tint-border)",
                          }}
                        >
                          Kemungkinan ganda ({r.duplicateOfRef})
                        </span>
                      )}
                    </div>

                    <p className="font-bold text-base text-[var(--ink-primary)] truncate mt-0.5">
                      {r.merchantName}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 ml-auto">
                  <span className="font-mono-tabular font-bold text-base sm:text-lg text-[var(--ink-primary)] mr-1">
                    {formatRupiah(r.totalAmount)}
                  </span>

                  <button
                    type="button"
                    onClick={() => setActiveReceiptId(r.id)}
                    className={
                      r.status === "needs_review"
                        ? "btn-stamp !py-1.5 !px-3 text-xs"
                        : "btn-secondary !py-1.5 !px-3 text-xs"
                    }
                  >
                    {r.status === "verified" ? (
                      <>
                        <StampCheckIcon className="w-4 h-4" />
                        <span>Sah · Edit</span>
                      </>
                    ) : (
                      <span>Cek / Edit</span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleDeleteOne(r.id)}
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
          project={project}
          receipts={receipts}
          activeReceiptId={activeReceiptId}
          onClose={() => setActiveReceiptId(null)}
          onSelectReceipt={(id) => setActiveReceiptId(id)}
          onSaveReceipt={handleSaveVerified}
          onDeleteReceipt={handleDeleteOne}
        />
      )}
    </div>
  );
}
