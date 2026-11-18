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
  PhotoCompressIcon,
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
        setErrorMsg(
          "File tidak dapat dibuka: pilih foto asli berformat JPG, PNG, atau WebP (maksimal 25 MB per foto)."
        );
        return;
      }

      setErrorMsg(
        skippedCount > 0
          ? `${skippedCount} file dilewati karena bukan foto JPG, PNG, atau WebP (maksimal 25 MB).`
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
        announcePolite(`${batch.length} foto selesai dikecilkan ukurannya.`);
      } catch (err) {
        for (const partial of batch) {
          URL.revokeObjectURL(partial.previewUrl);
        }
        setErrorMsg(
          err instanceof Error ? err.message : "Terjadi kendala saat memproses foto."
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
      announcePolite(`${updatedBatch.length} foto selesai diproses ulang.`);
    } catch (err) {
      for (const partial of updatedBatch) {
        URL.revokeObjectURL(partial.previewUrl);
      }
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Terjadi kendala saat memproses ulang foto."
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
      announcePolite("File ZIP hasil kompres foto berhasil diunduh.");
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
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-10 md:py-12 space-y-6 sm:space-y-8">
      <section className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="font-serif-ledger font-bold text-[clamp(1.65rem,4vw,2.35rem)] leading-tight text-[var(--ink-primary)] tracking-tight">
            Kecilkan ukuran banyak foto sekaligus.
          </h1>
          <p className="text-sm sm:text-base text-[var(--ink-secondary)] max-w-2xl">
            Pilih puluhan foto sekaligus dari HP atau laptop, gratis tanpa daftar akun. Foto diproses langsung di perangkat Anda sendiri sehingga cepat dan pribadi.
          </p>
        </div>

        <Link
          href="/panduan#cara-kompres-foto"
          className="btn-secondary text-xs sm:text-sm no-underline shrink-0 self-start sm:self-auto"
        >
          <BookGuideIcon className="w-4 h-4 shrink-0" />
          <span>Cara Pakai &amp; Tips</span>
        </Link>
      </section>

      <section className="rounded-[8px] bg-[var(--bg-surface)] border border-[var(--border-card)] p-4 sm:p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-4 items-end">
          <div className="sm:col-span-2 lg:col-span-6">
            <span className="block text-xs font-bold uppercase text-[var(--ink-secondary)] mb-1.5">
              Batas Ukuran Hasil
            </span>
            <div
              role="group"
              aria-label="Pilih batas ukuran hasil kompres"
              className="grid grid-cols-3 gap-2"
            >
              {(
                [
                  { id: "200kb", label: "Di bawah 200 KB" },
                  { id: "500kb", label: "Di bawah 500 KB" },
                  { id: "1mb", label: "Di bawah 1 MB" },
                ] as Array<{ id: TargetSizePreset; label: string }>
              ).map((opt) => {
                const active = preset === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setPreset(opt.id)}
                    className={`min-h-[44px] px-2 rounded-[6px] text-xs font-semibold border text-center ${
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
              Kualitas Lebar Gambar
            </label>
            <select
              id="select-max-dim"
              value={String(maxDimension)}
              onChange={(e) => setMaxDimension(Number(e.target.value))}
              className="input-ledger text-sm"
            >
              <option value="1200">1200 px (Hemat ukuran)</option>
              <option value="1600">1600 px (Tetap tajam)</option>
              <option value="0">Ukuran asli foto</option>
            </select>
          </div>

          <div className="lg:col-span-3">
            <label
              htmlFor="select-out-format"
              className="block text-xs font-bold uppercase text-[var(--ink-secondary)] mb-1.5"
            >
              Jenis File Hasil
            </label>
            <select
              id="select-out-format"
              value={outputFormat}
              onChange={(e) => setOutputFormat(e.target.value as OutputFormat)}
              className="input-ledger text-sm"
            >
              <option value="keep">Ikuti file asli</option>
              <option value="image/jpeg">JPG (Umum dipakai)</option>
              <option value="image/webp">WebP (Paling kecil)</option>
            </select>
          </div>
        </div>

        {settingsChangedForBatch && !processing && (
          <div className="pt-3 border-t border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <p className="text-xs sm:text-sm text-[var(--ink-secondary)]">
              Pilihan ukuran baru belum diterapkan ke{" "}
              <strong className="font-mono-tabular text-[var(--ink-primary)]">
                {items.length} foto
              </strong>{" "}
              di bawah.
            </p>
            <button
              type="button"
              onClick={() => void recompressExistingBatch()}
              className="btn-ledger text-xs sm:text-sm shrink-0"
            >
              <RefreshBatchIcon className="w-4 h-4 shrink-0" />
              <span>Proses Ulang Semua ({items.length})</span>
            </button>
          </div>
        )}
      </section>

      <section
        aria-label="Area pilih foto untuk dikompres"
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
        className={`rounded-[8px] border-2 border-dashed p-5 sm:p-8 md:p-10 text-center transition-colors ${
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

        <div className="max-w-md mx-auto space-y-3">
          <label
            htmlFor="input-kompres-foto"
            className={`btn-stamp text-sm sm:text-base px-4 sm:px-6 py-3 w-full sm:w-auto ${
              processing ? "opacity-60 pointer-events-none" : ""
            }`}
          >
            <UploadStackIcon className="w-5 h-5 shrink-0" />
            <span>
              {processing
                ? "Sedang Memproses Foto..."
                : items.length > 0
                ? `Tambah Foto Lagi (${items.length} Masuk)`
                : "Pilih Foto (Bisa Banyak Sekaligus)"}
            </span>
          </label>
          <p className="text-xs sm:text-sm text-[var(--ink-secondary)]">
            Pilih puluhan foto dari galeri/folder, tarik ke kotak ini, atau tempel gambar dengan{" "}
            <kbd className="font-mono-tabular font-semibold px-1.5 py-0.5 rounded-[3px] border border-[var(--border-control)] bg-[var(--bg-paper)]">
              Ctrl+V
            </kbd>{" "}
            (JPG, PNG, WebP · maks. 25 MB/foto).
          </p>
        </div>

        {processing && batchProgress && (
          <div
            role="status"
            aria-live="polite"
            className="mt-5 p-3.5 rounded-[6px] bg-[var(--bg-subtle)] border border-[var(--border-card)] text-left max-w-lg mx-auto space-y-2"
          >
            <div className="flex items-center justify-between gap-2 text-xs font-mono-tabular text-[var(--ink-primary)]">
              <span className="truncate">
                Memproses: <strong>{batchProgress.fileName}</strong>
              </span>
              <span className="shrink-0 font-bold">
                {batchProgress.current} / {batchProgress.total}
              </span>
            </div>
            <div
              role="progressbar"
              aria-label="Progres kompresi foto"
              aria-valuenow={batchProgress.current}
              aria-valuemin={0}
              aria-valuemax={batchProgress.total}
              className="h-2.5 w-full rounded-[3px] bg-[var(--bg-paper)] border border-[var(--border-control)] overflow-hidden"
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
          className="p-4 rounded-[8px] border-2 flex items-start gap-2.5 text-sm font-semibold"
          style={{
            backgroundColor: "var(--stamp-tint-bg)",
            color: "var(--stamp-tint-ink)",
            borderColor: "var(--stamp-tint-border)",
          }}
        >
          <AlertTriangleIcon className="w-5 h-5 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {items.length > 0 && (
        <section aria-label="Daftar foto hasil kompres" className="space-y-4">
          <div className="rounded-[8px] bg-[var(--bg-surface)] border-2 border-[var(--border-strong)] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-sm">
              <p className="font-bold text-[var(--ink-primary)] font-mono-tabular">
                {items.length} foto selesai · Ukuran berkurang {totalStats.savedPct}%
              </p>
              <p className="text-xs font-mono-tabular text-[var(--ink-secondary)]">
                Dari total {formatFileSize(totalStats.orig)} menjadi{" "}
                {formatFileSize(totalStats.comp)}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={clearAll}
                className="btn-secondary text-xs flex-1 sm:flex-initial"
              >
                <TrashBinIcon className="w-4 h-4 shrink-0" />
                <span>Hapus Semua</span>
              </button>

              <button
                type="button"
                disabled={zipping}
                onClick={() => void downloadAllZip()}
                className="btn-ledger text-sm flex-1 sm:flex-initial"
              >
                <DownloadTrayIcon className="w-4 h-4 shrink-0" />
                <span>
                  {zipping
                    ? "Menyiapkan ZIP..."
                    : items.length > 1
                    ? `Unduh Semua ${items.length} Foto (.zip)`
                    : "Unduh Foto"}
                </span>
              </button>
            </div>
          </div>

          <ul className="space-y-3">
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
                  className="rounded-[8px] bg-[var(--bg-surface)] border border-[var(--border-card)] p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-14 h-14 shrink-0 rounded-[4px] border border-[var(--border-control)] overflow-hidden bg-white flex items-center justify-center">
                      <img
                        src={item.previewUrl}
                        alt={`Pratinjau ${item.outputName}`}
                        width={56}
                        height={56}
                        className="w-full h-full object-cover"
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-sm sm:text-base text-[var(--ink-primary)] truncate">
                        {item.outputName}
                      </p>
                      <p className="text-xs font-mono-tabular text-[var(--ink-secondary)] mt-0.5">
                        {formatFileSize(item.originalBytes)} jadi{" "}
                        <strong className="text-[var(--ink-primary)]">
                          {formatFileSize(item.compressedBytes)}
                        </strong>{" "}
                        ({item.width}x{item.height} px)
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-2 pt-2.5 sm:pt-0 border-t sm:border-t-0 border-[var(--border-subtle)]">
                    <span
                      className="px-2.5 py-1 rounded-[4px] border text-xs font-mono-tabular font-bold"
                      style={{
                        backgroundColor: "var(--verified-bg)",
                        color: "var(--verified-ink)",
                        borderColor: "var(--verified-border)",
                      }}
                    >
                      Hemat {savedPct}%
                    </span>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => downloadSingle(item)}
                        className="btn-secondary !py-1.5 !px-3.5 text-xs"
                      >
                        <DownloadTrayIcon className="w-4 h-4 shrink-0" />
                        <span>Unduh</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => removeOne(item.id)}
                        aria-label={`Hapus ${item.outputName}`}
                        className="btn-secondary !p-2.5 min-w-[44px]"
                      >
                        <TrashBinIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {items.length === 0 && !processing && (
        <div className="flex items-center justify-center gap-2 text-xs sm:text-sm text-[var(--ink-muted)] pt-1 text-center">
          <PhotoCompressIcon className="w-4 h-4 shrink-0" />
          <span>
            Belum ada foto yang dipilih. Anda bisa memilih puluhan foto sekaligus.
          </span>
        </div>
      )}
    </div>
  );
}
