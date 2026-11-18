"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import imageCompression from "browser-image-compression";
import JSZip from "jszip";
import type { CompressedPhotoItem } from "@/types/beresin";
import { sanitizePlainText, verifyImageMagicBytes } from "@/lib/security";
import { useLedger } from "@/components/providers/LedgerProvider";
import {
  AlertTriangleIcon,
  BookGuideIcon,
  DownloadTrayIcon,
  RefreshBatchIcon,
  TrashBinIcon,
  UploadStackIcon,
} from "@/components/icons/LedgerIcons";

type TargetSizePreset = "200kb" | "500kb" | "1mb";
type OutputFormat = "keep" | "image/jpeg" | "image/webp";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getImageDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () =>
      resolve({
        width: img.naturalWidth || 800,
        height: img.naturalHeight || 600,
      });
    img.onerror = () => resolve({ width: 800, height: 600 });
    img.src = url;
  });
}

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

export default function PhotoCompressorPage() {
  const { announcePolite } = useLedger();

  const [preset, setPreset] = useState<TargetSizePreset>("500kb");
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("keep");
  const [maxDimension, setMaxDimension] = useState<number>(1600);

  const [items, setItems] = useState<CompressedPhotoItem[]>([]);
  const [appliedConfigKey, setAppliedConfigKey] = useState<string>("500kb|keep|1600");
  const [processing, setProcessing] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{
    current: number;
    total: number;
    fileName: string;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [dragging, setDragging] = useState(false);
  const [zipping, setZipping] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const itemsRef = useRef<CompressedPhotoItem[]>([]);
  itemsRef.current = items;

  useEffect(() => {
    return () => {
      for (const it of itemsRef.current) {
        URL.revokeObjectURL(it.previewUrl);
      }
    };
  }, []);

  const currentConfigKey = `${preset}|${outputFormat}|${maxDimension}`;
  const settingsChangedForBatch =
    items.length > 0 && appliedConfigKey !== currentConfigKey;

  const targetMaxMb = useMemo(() => {
    if (preset === "200kb") return 0.2;
    if (preset === "500kb") return 0.5;
    return 1.0;
  }, [preset]);

  const totalStats = useMemo(() => {
    const orig = items.reduce((s, i) => s + i.originalBytes, 0);
    const comp = items.reduce((s, i) => s + i.compressedBytes, 0);
    const savedPct = orig > 0 ? Math.max(0, Math.round(((orig - comp) / orig) * 100)) : 0;
    return { orig, comp, savedPct };
  }, [items]);

  const compressOneFile = useCallback(
    async (file: File, existingId?: string): Promise<CompressedPhotoItem> => {
      const desiredMime = outputFormat === "keep" ? file.type : outputFormat;
      const compressedBlob = await imageCompression(file, {
        maxSizeMB: targetMaxMb,
        maxWidthOrHeight: maxDimension > 0 ? maxDimension : undefined,
        fileType: desiredMime || undefined,
        useWebWorker: false,
      });

      // Keep original file if it is already smaller and format did not change.
      const finalBlob =
        outputFormat === "keep" && compressedBlob.size >= file.size
          ? file
          : compressedBlob;

      const previewUrl = URL.createObjectURL(finalBlob);
      const dims = await getImageDimensions(previewUrl);

      return {
        id: existingId ?? crypto.randomUUID(),
        sourceFile: file,
        originalName: file.name,
        outputName: buildSafeOutputFilename(file.name, finalBlob.type || file.type),
        originalBytes: file.size,
        compressedBytes: finalBlob.size,
        previewUrl,
        blob: finalBlob,
        width: dims.width,
        height: dims.height,
      };
    },
    [maxDimension, outputFormat, targetMaxMb]
  );

  const handleFiles = useCallback(
    async (fileList: FileList | File[] | null) => {
      if (!fileList || processing) return;
      const candidates = Array.from(fileList);
      if (candidates.length === 0) return;

      const verifiedFiles: File[] = [];
      let skippedCount = 0;
      for (const candidate of candidates) {
        const ok = await verifyImageMagicBytes(candidate);
        if (ok) {
          verifiedFiles.push(candidate);
        } else {
          skippedCount += 1;
        }
      }

      if (verifiedFiles.length === 0) {
        setErrorMsg("Format ditolak: gunakan foto JPG, PNG, atau WebP (maks. 25 MB).");
        return;
      }

      setErrorMsg(
        skippedCount > 0
          ? `${skippedCount} file dilewati (hanya menerima JPG, PNG, WebP maks. 25 MB).`
          : ""
      );
      setProcessing(true);
      const batch: CompressedPhotoItem[] = [];

      try {
        for (let i = 0; i < verifiedFiles.length; i += 1) {
          const file = verifiedFiles[i];
          setBatchProgress({
            current: i + 1,
            total: verifiedFiles.length,
            fileName: file.name,
          });
          const item = await compressOneFile(file);
          batch.push(item);
        }

        setItems((prev) => [...batch, ...prev]);
        setAppliedConfigKey(currentConfigKey);
        announcePolite(`${batch.length} foto selesai dikompres.`);
      } catch (err) {
        for (const partial of batch) {
          URL.revokeObjectURL(partial.previewUrl);
        }
        setErrorMsg(
          err instanceof Error ? err.message : "Gagal memproses foto."
        );
      } finally {
        setProcessing(false);
        setBatchProgress(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    [announcePolite, compressOneFile, currentConfigKey, processing]
  );

  async function recompressExistingBatch() {
    if (items.length === 0 || processing) return;
    const sources = items.filter((it) => it.sourceFile);
    if (sources.length === 0) return;

    setErrorMsg("");
    setProcessing(true);
    const updatedBatch: CompressedPhotoItem[] = [];

    try {
      for (let i = 0; i < sources.length; i += 1) {
        const prevItem = sources[i];
        const srcFile = prevItem.sourceFile!;
        setBatchProgress({
          current: i + 1,
          total: sources.length,
          fileName: srcFile.name,
        });
        const rebuilt = await compressOneFile(srcFile, prevItem.id);
        updatedBatch.push(rebuilt);
      }

      for (const oldItem of items) {
        URL.revokeObjectURL(oldItem.previewUrl);
      }
      setItems(updatedBatch);
      setAppliedConfigKey(currentConfigKey);
      announcePolite(`${updatedBatch.length} foto diproses ulang.`);
    } catch (err) {
      for (const partial of updatedBatch) {
        URL.revokeObjectURL(partial.previewUrl);
      }
      setErrorMsg(
        err instanceof Error ? err.message : "Gagal memproses ulang foto."
      );
    } finally {
      setProcessing(false);
      setBatchProgress(null);
    }
  }

  useEffect(() => {
    function handleWindowPaste(e: ClipboardEvent) {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      const clipboardFiles = e.clipboardData?.files;
      if (clipboardFiles && clipboardFiles.length > 0) {
        e.preventDefault();
        void handleFiles(clipboardFiles);
      }
    }

    window.addEventListener("paste", handleWindowPaste);
    return () => window.removeEventListener("paste", handleWindowPaste);
  }, [handleFiles]);

  function downloadSingle(item: CompressedPhotoItem) {
    const a = document.createElement("a");
    a.href = item.previewUrl;
    a.download = item.outputName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function downloadAllZip() {
    if (items.length === 0) return;
    if (items.length === 1) {
      downloadSingle(items[0]);
      return;
    }

    setZipping(true);
    try {
      const zip = new JSZip();
      const usedNames = new Set<string>();
      for (const item of items) {
        let name = item.outputName;
        let suffix = 2;
        while (usedNames.has(name)) {
          name = item.outputName.replace(/(\.[^.]+)$/, `-${suffix}$1`);
          suffix += 1;
        }
        usedNames.add(name);
        zip.file(name, item.blob);
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const zipUrl = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = zipUrl;
      a.download = "foto-kompres-beresin.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(zipUrl), 2000);
      announcePolite("ZIP berhasil diunduh.");
    } finally {
      setZipping(false);
    }
  }

  function removeOne(id: string) {
    setItems((prev) => {
      const target = prev.find((i) => i.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
  }

  function clearAll() {
    for (const it of items) {
      URL.revokeObjectURL(it.previewUrl);
    }
    setItems([]);
    announcePolite("Daftar foto dibersihkan.");
  }

  const progressPct = batchProgress
    ? Math.round((batchProgress.current / Math.max(1, batchProgress.total)) * 100)
    : 0;

  return (
    <div className="max-w-4xl mx-auto px-3.5 sm:px-6 py-5 sm:py-9 space-y-5 sm:space-y-6">
      <section className="flex items-start sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-serif-ledger font-bold text-[clamp(1.45rem,3.8vw,2.1rem)] leading-tight text-[var(--ink-primary)] tracking-tight">
            Kompres ukuran banyak foto.
          </h1>
          <p className="text-xs sm:text-sm text-[var(--ink-secondary)]">
            Diproses instan di perangkat Anda tanpa diunggah ke server.
          </p>
        </div>

        <Link
          href="/panduan#cara-kompres-foto"
          className="btn-secondary !px-3 text-xs no-underline shrink-0"
        >
          <BookGuideIcon className="w-4 h-4 shrink-0" />
          <span>Panduan</span>
        </Link>
      </section>

      <section className="rounded-[8px] bg-[var(--bg-surface)] border border-[var(--border-card)] p-3.5 sm:p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
          <div className="sm:col-span-2 lg:col-span-6">
            <span className="block text-xs font-bold uppercase text-[var(--ink-secondary)] mb-1.5">
              Target Ukuran
            </span>
            <div
              role="group"
              aria-label="Target ukuran kompresi"
              className="grid grid-cols-3 gap-1.5"
            >
              {(
                [
                  { id: "200kb", label: "< 200 KB" },
                  { id: "500kb", label: "< 500 KB" },
                  { id: "1mb", label: "< 1 MB" },
                ] as Array<{ id: TargetSizePreset; label: string }>
              ).map((opt) => {
                const active = preset === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setPreset(opt.id)}
                    className={`min-h-[44px] px-2 rounded-[6px] text-xs font-mono-tabular font-semibold border ${
                      active
                        ? "bg-[var(--color-ledger)] text-[var(--color-ledger-ink)] border-[var(--color-ledger)]"
                        : "bg-[var(--bg-paper)] text-[var(--ink-primary)] border-[var(--border-control)] hover:bg-[var(--bg-subtle)]"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="lg:col-span-3">
            <label
              htmlFor="select-max-dim"
              className="block text-xs font-bold uppercase text-[var(--ink-secondary)] mb-1.5"
            >
              Lebar Maksimal
            </label>
            <select
              id="select-max-dim"
              value={String(maxDimension)}
              onChange={(e) => setMaxDimension(Number(e.target.value))}
              className="input-ledger text-sm"
            >
              <option value="1200">1200 px</option>
              <option value="1600">1600 px</option>
              <option value="0">Ukuran asli</option>
            </select>
          </div>

          <div className="lg:col-span-3">
            <label
              htmlFor="select-out-format"
              className="block text-xs font-bold uppercase text-[var(--ink-secondary)] mb-1.5"
            >
              Format
            </label>
            <select
              id="select-out-format"
              value={outputFormat}
              onChange={(e) => setOutputFormat(e.target.value as OutputFormat)}
              className="input-ledger text-sm"
            >
              <option value="keep">Asli</option>
              <option value="image/jpeg">JPG</option>
              <option value="image/webp">WebP</option>
            </select>
          </div>
        </div>

        {settingsChangedForBatch && !processing && (
          <div className="pt-2.5 border-t border-[var(--border-subtle)] flex items-center justify-between gap-2">
            <span className="text-xs text-[var(--ink-secondary)]">
              Terapkan ke <strong className="font-mono-tabular">{items.length}</strong> foto?
            </span>
            <button
              type="button"
              onClick={() => void recompressExistingBatch()}
              className="btn-ledger !py-1.5 !px-3 text-xs shrink-0"
            >
              <RefreshBatchIcon className="w-4 h-4 shrink-0" />
              <span>Proses Ulang</span>
            </button>
          </div>
        )}
      </section>

      <section
        aria-label="Pilih foto untuk dikompres"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void handleFiles(e.dataTransfer.files);
        }}
        className={`rounded-[8px] border-2 border-dashed p-5 sm:p-7 text-center transition-colors ${
          dragging
            ? "bg-[var(--verified-bg)] border-[var(--border-strong)]"
            : "bg-[var(--bg-surface)] border-[var(--border-control)]"
        }`}
      >
        <input
          ref={fileInputRef}
          id="input-kompres-foto"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          disabled={processing}
          onChange={(e) => void handleFiles(e.target.files)}
          className="sr-only"
        />

        <div className="max-w-md mx-auto space-y-2">
          <label
            htmlFor="input-kompres-foto"
            className={`btn-stamp text-sm sm:text-base px-5 py-2.5 w-full sm:w-auto ${
              processing ? "opacity-60 pointer-events-none" : ""
            }`}
          >
            <UploadStackIcon className="w-5 h-5 shrink-0" />
            <span>
              {processing
                ? "Memproses..."
                : items.length > 0
                ? `Tambah Foto (${items.length})`
                : "Pilih Foto"}
            </span>
          </label>
          <p className="text-xs text-[var(--ink-secondary)]">
            Bisa banyak file sekaligus · JPG, PNG, WebP (maks. 25 MB)
          </p>
        </div>

        {processing && batchProgress && (
          <div
            role="status"
            aria-live="polite"
            className="mt-4 p-3 rounded-[6px] bg-[var(--bg-subtle)] border border-[var(--border-card)] text-left max-w-md mx-auto space-y-1.5"
          >
            <div className="flex items-center justify-between gap-2 text-xs font-mono-tabular text-[var(--ink-primary)]">
              <span className="truncate">{batchProgress.fileName}</span>
              <span className="shrink-0 font-bold">
                {batchProgress.current}/{batchProgress.total}
              </span>
            </div>
            <div
              role="progressbar"
              aria-label="Progres kompresi"
              aria-valuenow={batchProgress.current}
              aria-valuemin={0}
              aria-valuemax={batchProgress.total}
              className="h-2 w-full rounded-[3px] bg-[var(--bg-paper)] border border-[var(--border-control)] overflow-hidden"
            >
              <div
                className="h-full bg-[var(--color-ledger)]"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}
      </section>

      {errorMsg && (
        <div
          role="alert"
          className="p-3.5 rounded-[8px] border-2 flex items-start gap-2 text-xs sm:text-sm font-semibold"
          style={{
            backgroundColor: "var(--stamp-tint-bg)",
            color: "var(--stamp-tint-ink)",
            borderColor: "var(--stamp-tint-border)",
          }}
        >
          <AlertTriangleIcon className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {items.length > 0 && (
        <section aria-label="Hasil kompresi" className="space-y-3">
          <div className="rounded-[8px] bg-[var(--bg-surface)] border-2 border-[var(--border-strong)] p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="text-xs sm:text-sm">
              <p className="font-bold text-[var(--ink-primary)] font-mono-tabular">
                {items.length} foto · Hemat {totalStats.savedPct}%
              </p>
              <p className="text-xs font-mono-tabular text-[var(--ink-secondary)]">
                {formatFileSize(totalStats.orig)} &rarr; {formatFileSize(totalStats.comp)}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={clearAll}
                className="btn-secondary !py-1.5 !px-3 text-xs"
              >
                <TrashBinIcon className="w-4 h-4 shrink-0" />
                <span>Reset</span>
              </button>

              <button
                type="button"
                disabled={zipping}
                onClick={() => void downloadAllZip()}
                className="btn-ledger text-xs sm:text-sm flex-1 sm:flex-initial"
              >
                <DownloadTrayIcon className="w-4 h-4 shrink-0" />
                <span>
                  {zipping
                    ? "Membuat ZIP..."
                    : items.length > 1
                    ? `Unduh ZIP (${items.length})`
                    : "Unduh"}
                </span>
              </button>
            </div>
          </div>

          <ul className="space-y-2.5">
            {items.map((item) => {
              const savedPct =
                item.originalBytes > 0
                  ? Math.max(
                      0,
                      Math.round(
                        ((item.originalBytes - item.compressedBytes) /
                          item.originalBytes) *
                          100
                      )
                    )
                  : 0;

              return (
                <li
                  key={item.id}
                  className="rounded-[8px] bg-[var(--bg-surface)] border border-[var(--border-card)] p-3 flex items-center justify-between gap-2.5"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className="w-12 h-12 shrink-0 rounded-[4px] border border-[var(--border-control)] overflow-hidden bg-white">
                      <img
                        src={item.previewUrl}
                        alt={`Pratinjau ${item.outputName}`}
                        width={48}
                        height={48}
                        className="w-full h-full object-cover"
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-xs sm:text-sm text-[var(--ink-primary)] truncate">
                        {item.outputName}
                      </p>
                      <p className="text-xs font-mono-tabular text-[var(--ink-secondary)]">
                        {formatFileSize(item.originalBytes)} &rarr;{" "}
                        <strong className="text-[var(--ink-primary)]">
                          {formatFileSize(item.compressedBytes)}
                        </strong>{" "}
                        (-{savedPct}%)
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => downloadSingle(item)}
                      className="btn-secondary !py-1.5 !px-2.5 text-xs"
                    >
                      <DownloadTrayIcon className="w-4 h-4 shrink-0" />
                      <span className="hidden sm:inline">Unduh</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => removeOne(item.id)}
                      aria-label={`Hapus ${item.outputName}`}
                      className="btn-secondary !p-2 min-w-[44px]"
                    >
                      <TrashBinIcon className="w-4 h-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
