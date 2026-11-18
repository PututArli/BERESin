"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  AppSettings,
  CompressedPhotoItem,
  ExtractionMode,
  OcrExtractedPayload,
  Project,
  Receipt,
} from "@/types/beresin";
import {
  clearAllWorkspaceReceipts,
  deleteReceipt,
  getAppSettings,
  loadLocalWorkspaceFast,
  nextReferenceNumber,
  saveAppSettings,
  saveReceipt,
  syncWorkspaceFromCloud,
  updateWorkspaceMeta,
} from "@/lib/storage";
import {
  findDuplicateReceipt,
  formatReferenceNumber,
  todayIsoDate,
} from "@/lib/format";
import { compressPhotoFast, prepareReceiptImageFast } from "@/lib/fast-image";
import { createManualNoteDataUrl } from "@/lib/manual-note-image";
import { sanitizePlainText, verifyImageMagicBytes } from "@/lib/security";

export type TargetSizePreset = "200kb" | "500kb" | "1mb";
export type OutputFormat = "keep" | "image/jpeg" | "image/webp";

export interface ReceiptBatchProgress {
  current: number;
  total: number;
  fileName: string;
  mode: ExtractionMode;
}

export interface CompressBatchProgress {
  current: number;
  total: number;
  fileName: string;
}

interface LedgerContextValue {
  settings: AppSettings;
  isReady: boolean;
  toggleTheme: () => void;
  updateSettings: (patch: Partial<AppSettings>) => void;
  announcePolite: (msg: string) => void;

  project: Project | null;
  receipts: Receipt[];
  viewState: "loading" | "ready" | "error";
  receiptError: string;
  setReceiptError: (msg: string) => void;
  extractionMode: ExtractionMode;
  setExtractionModeSafe: (mode: ExtractionMode) => void;
  uploadingReceipts: boolean;
  receiptProgress: ReceiptBatchProgress | null;
  reloadWorkspace: () => Promise<void>;
  updateProjectFields: (patch: Partial<Project>) => Project | null;
  processReceiptFiles: (
    fileList: FileList | File[] | null
  ) => Promise<{ firstZeroReceiptId: string | null }>;
  cancelReceiptUpload: () => void;
  reanalyzeReceipt: (targetReceipt: Receipt) => Promise<Receipt | null>;
  addManualReceipt: () => Promise<string | null>;
  saveVerifiedReceipt: (updated: Receipt) => void;
  deleteOneReceipt: (id: string) => void;
  clearAllReceipts: () => void;

  compressPreset: TargetSizePreset;
  setCompressPresetSafe: (p: TargetSizePreset) => void;
  compressFormat: OutputFormat;
  setCompressFormatSafe: (f: OutputFormat) => void;
  compressMaxDim: number;
  setCompressMaxDimSafe: (d: number) => void;
  compressedItems: CompressedPhotoItem[];
  appliedCompressKey: string;
  compressProcessing: boolean;
  compressProgress: CompressBatchProgress | null;
  compressError: string;
  processCompressFiles: (fileList: FileList | File[] | null) => Promise<void>;
  recompressExistingBatch: () => Promise<void>;
  cancelCompressBatch: () => void;
  removeCompressedItem: (id: string) => void;
  clearCompressedItems: () => void;
}

const DEFAULT_SETTINGS: AppSettings = {
  theme: "light",
  geminiApiKey: "",
  defaultPdfGrid: "2x2",
};

const OCR_CONCURRENCY = 3;
const COMPRESS_CONCURRENCY = 4;

// Strips path separators and unsafe characters before packaging filenames into downloads or ZIP archives.
function buildSafeOutputFilename(originalName: string, mime: string): string {
  const leaf = sanitizePlainText(originalName, 120)
    .replace(/^.*[\\/]/, "")
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9._ -]/g, "-")
    .trim();
  const safeBase = leaf || "foto";
  if (mime === "image/webp") return `${safeBase}-kompres.webp`;
  if (mime === "image/png") return `${safeBase}-kompres.png`;
  return `${safeBase}-kompres.jpg`;
}

const LedgerContext = createContext<LedgerContextValue | null>(null);

export function LedgerProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isReady, setIsReady] = useState(false);
  const [liveMessage, setLiveMessage] = useState("");

  const [project, setProject] = useState<Project | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [viewState, setViewState] = useState<"loading" | "ready" | "error">("loading");
  const [receiptError, setReceiptError] = useState("");
  const [extractionMode, setExtractionMode] = useState<ExtractionMode>("detailed");
  const [uploadingReceipts, setUploadingReceipts] = useState(false);
  const [receiptProgress, setReceiptProgress] =
    useState<ReceiptBatchProgress | null>(null);

  const projectRef = useRef<Project | null>(null);
  projectRef.current = project;
  const receiptsRef = useRef<Receipt[]>([]);
  receiptsRef.current = receipts;
  const userMutatedRef = useRef(false);
  const receiptAbortRef = useRef<AbortController | null>(null);

  const [compressPreset, setCompressPreset] = useState<TargetSizePreset>("500kb");
  const [compressFormat, setCompressFormat] = useState<OutputFormat>("keep");
  const [compressMaxDim, setCompressMaxDim] = useState<number>(1600);
  const [compressedItems, setCompressedItems] = useState<CompressedPhotoItem[]>([]);
  const [appliedCompressKey, setAppliedCompressKey] =
    useState<string>("500kb|keep|1600");
  const [compressProcessing, setCompressProcessing] = useState(false);
  const [compressProgress, setCompressProgress] =
    useState<CompressBatchProgress | null>(null);
  const [compressError, setCompressError] = useState("");

  const compressedItemsRef = useRef<CompressedPhotoItem[]>([]);
  compressedItemsRef.current = compressedItems;
  const compressCancelFlagRef = useRef(false);

  const applyThemeToDom = useCallback((theme: "light" | "dark") => {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", theme);
    }
    if (typeof window !== "undefined") {
      window.localStorage.setItem("beresin_theme", theme);
    }
  }, []);

  const announcePolite = useCallback((msg: string) => {
    setLiveMessage("");
    requestAnimationFrame(() => {
      setLiveMessage(msg);
    });
  }, []);

  useEffect(() => {
    let active = true;
    async function initSettings() {
      try {
        const s = await getAppSettings();
        if (!active) return;
        setSettings(s);
        applyThemeToDom(s.theme);
      } catch {
        if (!active) return;
        applyThemeToDom("light");
      } finally {
        if (active) setIsReady(true);
      }
    }
    void initSettings();
    return () => {
      active = false;
    };
  }, [applyThemeToDom]);

  const reloadWorkspace = useCallback(async () => {
    setReceiptError("");
    try {
      const localData = await loadLocalWorkspaceFast();
      setProject(localData.project);
      setReceipts(localData.receipts);
      setViewState("ready");

      void syncWorkspaceFromCloud().then((cloudData) => {
        if (!cloudData || userMutatedRef.current) return;
        setProject(cloudData.project);
        setReceipts(cloudData.receipts);
      });
    } catch (err) {
      setReceiptError(
        err instanceof Error ? err.message : "Gagal memuat ruang kerja nota."
      );
      setViewState("error");
    }
  }, []);

  useEffect(() => {
    void reloadWorkspace();
  }, [reloadWorkspace]);

  // Warn before closing browser tab if OCR or photo compression is still running.
  useEffect(() => {
    if (!uploadingReceipts && !compressProcessing) return;
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [uploadingReceipts, compressProcessing]);

  useEffect(() => {
    return () => {
      for (const it of compressedItemsRef.current) {
        URL.revokeObjectURL(it.previewUrl);
      }
    };
  }, []);

  const updateSettings = useCallback(
    (patch: Partial<AppSettings>) => {
      setSettings((prev) => {
        const merged: AppSettings = { ...prev, ...patch };
        applyThemeToDom(merged.theme);
        void saveAppSettings(merged).catch(() => {});
        return merged;
      });
    },
    [applyThemeToDom]
  );

  const toggleTheme = useCallback(() => {
    setSettings((prev) => {
      const nextTheme = prev.theme === "light" ? "dark" : "light";
      const merged: AppSettings = { ...prev, theme: nextTheme };
      applyThemeToDom(nextTheme);
      void saveAppSettings(merged).catch(() => {});
      setLiveMessage(
        nextTheme === "dark" ? "Mode gelap aktif." : "Mode terang aktif."
      );
      return merged;
    });
  }, [applyThemeToDom]);

  // Prevent changing extraction mode while an active OCR batch is already running.
  const setExtractionModeSafe = useCallback(
    (mode: ExtractionMode) => {
      if (uploadingReceipts) return;
      setExtractionMode(mode);
    },
    [uploadingReceipts]
  );

  const updateProjectFields = useCallback((patch: Partial<Project>): Project | null => {
    const cur = projectRef.current;
    if (!cur) return null;
    userMutatedRef.current = true;
    const nextProj: Project = {
      ...cur,
      ...patch,
      title: (patch.title ?? cur.title).trim() || "Laporan Pengeluaran Kegiatan",
    };
    projectRef.current = nextProj;
    setProject(nextProj);
    void updateWorkspaceMeta(nextProj);
    return nextProj;
  }, []);

  const requestOcrExtraction = useCallback(
    async (
      imageDataUrl: string,
      mimeType: string,
      fileName: string,
      categories: string[],
      mode: ExtractionMode,
      signal?: AbortSignal
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
          signal,
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
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          throw err;
        }
        return {
          extracted: null,
          aiUsed: false,
          errorDetail: "Gagal terhubung ke server pembaca struk.",
        };
      }
    },
    [settings.geminiApiKey]
  );

  const cancelReceiptUpload = useCallback(() => {
    receiptAbortRef.current?.abort();
    receiptAbortRef.current = null;
    setUploadingReceipts(false);
    setReceiptProgress(null);
    announcePolite("Pemrosesan antrean struk dihentikan.");
  }, [announcePolite]);

  const processReceiptFiles = useCallback(
    async (
      fileList: FileList | File[] | null
    ): Promise<{ firstZeroReceiptId: string | null }> => {
      const curProject = projectRef.current;
      if (!fileList || !curProject || uploadingReceipts) {
        return { firstZeroReceiptId: null };
      }

      const rawCandidates = Array.from(fileList);
      if (rawCandidates.length === 0) return { firstZeroReceiptId: null };

      const magicChecks = await Promise.all(
        rawCandidates.map(async (candidate) => ({
          candidate,
          ok: await verifyImageMagicBytes(candidate),
        }))
      );

      const verifiedFiles: File[] = [];
      let skippedCount = 0;
      for (const entry of magicChecks) {
        if (entry.ok) {
          verifiedFiles.push(entry.candidate);
        } else {
          skippedCount += 1;
        }
      }

      if (verifiedFiles.length === 0) {
        setReceiptError(
          "Format ditolak: gunakan foto JPG, PNG, atau WebP (maks. 25 MB)."
        );
        return { firstZeroReceiptId: null };
      }

      userMutatedRef.current = true;
      const lockedMode = extractionMode;
      const abortCtrl = new AbortController();
      receiptAbortRef.current = abortCtrl;

      const noticeMessage =
        skippedCount > 0
          ? `${skippedCount} file dilewati (hanya menerima JPG, PNG, WebP maks. 25 MB).`
          : "";
      setReceiptError(noticeMessage);
      setUploadingReceipts(true);
      setReceiptProgress({
        current: 1,
        total: verifiedFiles.length,
        fileName: verifiedFiles[0].name,
        mode: lockedMode,
      });

      let firstZeroId: string | null = null;
      let addedCount = 0;

      try {
        // Reserve reference numbers upfront so concurrent OCR workers keep deterministic NOTA-00X ordering.
        const firstRef = await nextReferenceNumber(curProject.id);
        let baseSeq = parseInt(firstRef.replace(/\D/g, ""), 10) || 1;
        for (const existing of receiptsRef.current) {
          const match = existing.referenceNumber.match(/(\d+)$/);
          if (match) {
            const seq = parseInt(match[1], 10);
            if (seq >= baseSeq) baseSeq = seq + 1;
          }
        }

        let nextIdx = 0;
        let finishedCount = 0;
        let saveChain = Promise.resolve();

        const runOcrWorker = async () => {
          while (!abortCtrl.signal.aborted) {
            const idx = nextIdx;
            nextIdx += 1;
            if (idx >= verifiedFiles.length) break;

            const file = verifiedFiles[idx];
            const refNum = formatReferenceNumber(baseSeq + idx);

            let dataUrl: string;
            let mimeType: string;
            let imageHash: string;
            try {
              const prepared = await prepareReceiptImageFast(file);
              dataUrl = prepared.dataUrl;
              mimeType = prepared.mimeType;
              imageHash = prepared.imageHash;
            } catch {
              continue;
            }

            if (abortCtrl.signal.aborted) break;

            const receiptId = crypto.randomUUID();
            const { extracted, aiUsed, errorDetail } = await requestOcrExtraction(
              dataUrl,
              mimeType,
              file.name,
              curProject.categories,
              lockedMode,
              abortCtrl.signal
            );

            if (abortCtrl.signal.aborted) break;

            if (errorDetail) {
              setReceiptError(errorDetail);
            }

            const confidence = extracted?.confidence_score ?? 0.5;
            const autoVerified =
              aiUsed && confidence >= 0.85 && (extracted?.total_amount ?? 0) > 0;

            const nextItem: Receipt = {
              id: receiptId,
              projectId: curProject.id,
              referenceNumber: refNum,
              imageUrl: dataUrl,
              imageHash,
              extractionMode: lockedMode,
              merchantName: extracted?.merchant_name || "Struk Belum Terbaca",
              transactionDate: extracted?.transaction_date ?? todayIsoDate(),
              category:
                extracted?.category && curProject.categories.includes(extracted.category)
                  ? extracted.category
                  : curProject.categories[0] ?? "Lain-lain",
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

            // Serialize IndexedDB writes so duplicate checks across concurrent batch siblings stay deterministic.
            const saved = await new Promise<Receipt>((resolve, reject) => {
              saveChain = saveChain.then(() =>
                saveReceipt(nextItem).then(resolve, reject)
              );
            });

            if (abortCtrl.signal.aborted) break;

            addedCount += 1;
            finishedCount += 1;
            if (verifiedFiles.length === 1 && saved.totalAmount === 0) {
              firstZeroId = saved.id;
            }

            setReceipts((prev) =>
              [...prev, saved].sort((a, b) =>
                a.referenceNumber.localeCompare(b.referenceNumber)
              )
            );

            const activeIdx = Math.min(verifiedFiles.length - 1, nextIdx - 1);
            setReceiptProgress({
              current: Math.min(verifiedFiles.length, finishedCount + 1),
              total: verifiedFiles.length,
              fileName:
                finishedCount < verifiedFiles.length
                  ? verifiedFiles[activeIdx]?.name ?? file.name
                  : file.name,
              mode: lockedMode,
            });
          }
        };

        const workerCount = Math.min(OCR_CONCURRENCY, verifiedFiles.length);
        await Promise.all(
          Array.from({ length: workerCount }, () => runOcrWorker())
        );

        if (addedCount > 0) {
          announcePolite(`${addedCount} foto struk selesai diproses.`);
        }
        return { firstZeroReceiptId: firstZeroId };
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          setReceiptError(
            err instanceof Error ? err.message : "Terjadi kendala saat memproses struk."
          );
        }
        return { firstZeroReceiptId: null };
      } finally {
        receiptAbortRef.current = null;
        setUploadingReceipts(false);
        setReceiptProgress(null);
      }
    },
    [announcePolite, extractionMode, requestOcrExtraction, uploadingReceipts]
  );

  const reanalyzeReceipt = useCallback(
    async (targetReceipt: Receipt): Promise<Receipt | null> => {
      const curProject = projectRef.current;
      if (!curProject) return null;
      const mimeMatch = targetReceipt.imageUrl.match(
        /^data:(image\/[a-z+]+);base64,/i
      );
      let payloadMime = mimeMatch ? mimeMatch[1] : "image/jpeg";
      let payloadUrl = targetReceipt.imageUrl;

      if (payloadUrl.length > 950_000) {
        try {
          const rawBlob = await (await fetch(payloadUrl)).blob();
          const shrinkFile = new File([rawBlob], "reanalyze.jpg", {
            type: payloadMime,
          });
          const shrunk = await prepareReceiptImageFast(shrinkFile);
          payloadUrl = shrunk.dataUrl;
          payloadMime = shrunk.mimeType;
        } catch {
          payloadUrl = targetReceipt.imageUrl;
        }
      }

      const { extracted, aiUsed, errorDetail } = await requestOcrExtraction(
        payloadUrl,
        payloadMime,
        targetReceipt.referenceNumber,
        curProject.categories,
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
          extracted.category && curProject.categories.includes(extracted.category)
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
    [announcePolite, extractionMode, requestOcrExtraction]
  );

  const addManualReceipt = useCallback(async (): Promise<string | null> => {
    const curProject = projectRef.current;
    if (!curProject || uploadingReceipts) return null;
    userMutatedRef.current = true;
    const refNum = await nextReferenceNumber(curProject.id);
    const receiptId = crypto.randomUUID();
    const dateToday = todayIsoDate();
    const blankImg = createManualNoteDataUrl(refNum, dateToday);

    const draft: Receipt = {
      id: receiptId,
      projectId: curProject.id,
      referenceNumber: refNum,
      imageUrl: blankImg,
      imageHash: `manual-${receiptId}`,
      extractionMode: "detailed",
      merchantName: "Pengeluaran Manual",
      transactionDate: dateToday,
      category: curProject.categories[0] ?? "Lain-lain",
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
    void saveReceipt(draft);
    return receiptId;
  }, [uploadingReceipts]);

  const saveVerifiedReceipt = useCallback(
    (updated: Receipt) => {
      userMutatedRef.current = true;
      const dupRef = findDuplicateReceipt(
        {
          id: updated.id,
          imageHash: updated.imageHash,
          transactionDate: updated.transactionDate,
          totalAmount: updated.totalAmount,
          merchantName: updated.merchantName,
        },
        receiptsRef.current
      );
      const finalized: Receipt = {
        ...updated,
        isDuplicate: Boolean(dupRef),
        duplicateOfRef: dupRef,
      };

      setReceipts((prev) =>
        prev.map((r) => (r.id === finalized.id ? finalized : r))
      );
      announcePolite(`Nota ${finalized.referenceNumber} disimpan.`);
      void saveReceipt(finalized);
    },
    [announcePolite]
  );

  const deleteOneReceipt = useCallback(
    (id: string) => {
      const curProject = projectRef.current;
      if (!curProject) return;
      userMutatedRef.current = true;
      setReceipts((prev) => prev.filter((r) => r.id !== id));
      announcePolite("Nota dihapus.");
      void deleteReceipt(id, curProject.id);
    },
    [announcePolite]
  );

  const clearAllReceipts = useCallback(() => {
    const curProject = projectRef.current;
    if (!curProject || uploadingReceipts) return;
    userMutatedRef.current = true;
    setReceipts([]);
    announcePolite("Daftar nota dibersihkan.");
    void clearAllWorkspaceReceipts(curProject.id);
  }, [announcePolite, uploadingReceipts]);

  const setCompressPresetSafe = useCallback(
    (p: TargetSizePreset) => {
      if (compressProcessing) return;
      setCompressPreset(p);
    },
    [compressProcessing]
  );

  const setCompressFormatSafe = useCallback(
    (f: OutputFormat) => {
      if (compressProcessing) return;
      setCompressFormat(f);
    },
    [compressProcessing]
  );

  const setCompressMaxDimSafe = useCallback(
    (d: number) => {
      if (compressProcessing) return;
      setCompressMaxDim(d);
    },
    [compressProcessing]
  );

  const targetMaxMb = useMemo(() => {
    if (compressPreset === "200kb") return 0.2;
    if (compressPreset === "500kb") return 0.5;
    return 1.0;
  }, [compressPreset]);

  const compressSingleFile = useCallback(
    async (
      file: File,
      lockedMaxMb: number,
      lockedDim: number,
      lockedFormat: OutputFormat,
      existingId?: string
    ): Promise<CompressedPhotoItem> => {
      const targetMaxBytes = Math.round(lockedMaxMb * 1024 * 1024);
      const { blob: finalBlob, width, height } = await compressPhotoFast(
        file,
        targetMaxBytes,
        lockedDim,
        lockedFormat
      );

      const previewUrl = URL.createObjectURL(finalBlob);

      return {
        id: existingId ?? crypto.randomUUID(),
        sourceFile: file,
        originalName: file.name,
        outputName: buildSafeOutputFilename(file.name, finalBlob.type || file.type),
        originalBytes: file.size,
        compressedBytes: finalBlob.size,
        previewUrl,
        blob: finalBlob,
        width,
        height,
      };
    },
    []
  );

  const cancelCompressBatch = useCallback(() => {
    compressCancelFlagRef.current = true;
    announcePolite("Kompresi foto dihentikan.");
  }, [announcePolite]);

  const processCompressFiles = useCallback(
    async (fileList: FileList | File[] | null) => {
      if (!fileList || compressProcessing) return;
      const candidates = Array.from(fileList);
      if (candidates.length === 0) return;

      const magicChecks = await Promise.all(
        candidates.map(async (candidate) => ({
          candidate,
          ok: await verifyImageMagicBytes(candidate),
        }))
      );

      const verifiedFiles: File[] = [];
      let skippedCount = 0;
      for (const entry of magicChecks) {
        if (entry.ok) {
          verifiedFiles.push(entry.candidate);
        } else {
          skippedCount += 1;
        }
      }

      if (verifiedFiles.length === 0) {
        setCompressError(
          "Format ditolak: gunakan foto JPG, PNG, atau WebP (maks. 25 MB)."
        );
        return;
      }

      setCompressError(
        skippedCount > 0
          ? `${skippedCount} file dilewati (hanya menerima JPG, PNG, WebP maks. 25 MB).`
          : ""
      );

      const lockedKey = `${compressPreset}|${compressFormat}|${compressMaxDim}`;
      const lockedMaxMb = targetMaxMb;
      const lockedDim = compressMaxDim;
      const lockedFormat = compressFormat;

      compressCancelFlagRef.current = false;
      setCompressProcessing(true);
      setCompressProgress({
        current: 1,
        total: verifiedFiles.length,
        fileName: verifiedFiles[0].name,
      });

      let nextIdx = 0;
      let completedCount = 0;

      try {
        const runCompressWorker = async () => {
          while (!compressCancelFlagRef.current) {
            const idx = nextIdx;
            nextIdx += 1;
            if (idx >= verifiedFiles.length) break;

            const file = verifiedFiles[idx];
            const item = await compressSingleFile(
              file,
              lockedMaxMb,
              lockedDim,
              lockedFormat
            );

            if (compressCancelFlagRef.current) {
              URL.revokeObjectURL(item.previewUrl);
              break;
            }

            completedCount += 1;
            setCompressedItems((prev) => [item, ...prev]);

            const activeIdx = Math.min(verifiedFiles.length - 1, nextIdx - 1);
            setCompressProgress({
              current: Math.min(verifiedFiles.length, completedCount + 1),
              total: verifiedFiles.length,
              fileName:
                completedCount < verifiedFiles.length
                  ? verifiedFiles[activeIdx]?.name ?? file.name
                  : file.name,
            });
          }
        };

        const workerCount = Math.min(COMPRESS_CONCURRENCY, verifiedFiles.length);
        await Promise.all(
          Array.from({ length: workerCount }, () => runCompressWorker())
        );

        if (completedCount > 0) {
          setAppliedCompressKey(lockedKey);
          announcePolite(`${completedCount} foto selesai dikompres.`);
        }
      } catch (err) {
        setCompressError(
          err instanceof Error ? err.message : "Gagal memproses foto."
        );
      } finally {
        compressCancelFlagRef.current = false;
        setCompressProcessing(false);
        setCompressProgress(null);
      }
    },
    [
      announcePolite,
      compressFormat,
      compressMaxDim,
      compressPreset,
      compressProcessing,
      compressSingleFile,
      targetMaxMb,
    ]
  );

  const recompressExistingBatch = useCallback(async () => {
    const curItems = compressedItemsRef.current;
    if (curItems.length === 0 || compressProcessing) return;
    const sources = curItems.filter((it) => it.sourceFile);
    if (sources.length === 0) return;

    const lockedKey = `${compressPreset}|${compressFormat}|${compressMaxDim}`;
    const lockedMaxMb = targetMaxMb;
    const lockedDim = compressMaxDim;
    const lockedFormat = compressFormat;

    setCompressError("");
    compressCancelFlagRef.current = false;
    setCompressProcessing(true);
    setCompressProgress({
      current: 1,
      total: sources.length,
      fileName: sources[0].sourceFile!.name,
    });

    const updatedSlots: Array<CompressedPhotoItem | null> = new Array(
      sources.length
    ).fill(null);
    let nextIdx = 0;
    let completedCount = 0;

    try {
      const runRecompressWorker = async () => {
        while (!compressCancelFlagRef.current) {
          const idx = nextIdx;
          nextIdx += 1;
          if (idx >= sources.length) break;

          const prevItem = sources[idx];
          const srcFile = prevItem.sourceFile!;
          const rebuilt = await compressSingleFile(
            srcFile,
            lockedMaxMb,
            lockedDim,
            lockedFormat,
            prevItem.id
          );

          if (compressCancelFlagRef.current) {
            URL.revokeObjectURL(rebuilt.previewUrl);
            break;
          }

          updatedSlots[idx] = rebuilt;
          completedCount += 1;
          const activeIdx = Math.min(sources.length - 1, nextIdx - 1);
          setCompressProgress({
            current: Math.min(sources.length, completedCount + 1),
            total: sources.length,
            fileName:
              completedCount < sources.length
                ? sources[activeIdx]?.sourceFile?.name ?? srcFile.name
                : srcFile.name,
          });
        }
      };

      const workerCount = Math.min(COMPRESS_CONCURRENCY, sources.length);
      await Promise.all(
        Array.from({ length: workerCount }, () => runRecompressWorker())
      );

      if (compressCancelFlagRef.current) {
        for (const partial of updatedSlots) {
          if (partial) URL.revokeObjectURL(partial.previewUrl);
        }
        return;
      }

      const updatedBatch = updatedSlots.filter(
        (it): it is CompressedPhotoItem => it !== null
      );

      for (const oldItem of curItems) {
        URL.revokeObjectURL(oldItem.previewUrl);
      }
      setCompressedItems(updatedBatch);
      setAppliedCompressKey(lockedKey);
      announcePolite(`${updatedBatch.length} foto diproses ulang.`);
    } catch (err) {
      for (const partial of updatedSlots) {
        if (partial) URL.revokeObjectURL(partial.previewUrl);
      }
      setCompressError(
        err instanceof Error ? err.message : "Gagal memproses ulang foto."
      );
    } finally {
      compressCancelFlagRef.current = false;
      setCompressProcessing(false);
      setCompressProgress(null);
    }
  }, [
    announcePolite,
    compressFormat,
    compressMaxDim,
    compressPreset,
    compressProcessing,
    compressSingleFile,
    targetMaxMb,
  ]);

  const removeCompressedItem = useCallback((id: string) => {
    if (compressProcessing) return;
    setCompressedItems((prev) => {
      const target = prev.find((i) => i.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
  }, [compressProcessing]);

  const clearCompressedItems = useCallback(() => {
    if (compressProcessing) return;
    for (const it of compressedItemsRef.current) {
      URL.revokeObjectURL(it.previewUrl);
    }
    setCompressedItems([]);
    announcePolite("Daftar foto dibersihkan.");
  }, [announcePolite, compressProcessing]);

  const ctxValue: LedgerContextValue = {
    settings,
    isReady,
    toggleTheme,
    updateSettings,
    announcePolite,
    project,
    receipts,
    viewState,
    receiptError,
    setReceiptError,
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
    compressPreset,
    setCompressPresetSafe,
    compressFormat,
    setCompressFormatSafe,
    compressMaxDim,
    setCompressMaxDimSafe,
    compressedItems,
    appliedCompressKey,
    compressProcessing,
    compressProgress,
    compressError,
    processCompressFiles,
    recompressExistingBatch,
    cancelCompressBatch,
    removeCompressedItem,
    clearCompressedItems,
  };

  return (
    <LedgerContext.Provider value={ctxValue}>
      {children}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {liveMessage}
      </div>
    </LedgerContext.Provider>
  );
}

export function useLedger(): LedgerContextValue {
  const ctx = useContext(LedgerContext);
  if (!ctx) {
    throw new Error("useLedger harus dipakai di dalam LedgerProvider.");
  }
  return ctx;
}
