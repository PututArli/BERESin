"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import JSZip from "jszip";
import type { CompressedPhotoItem } from "@/types/beresin";
import {
  type OutputFormat,
  type TargetSizePreset,
  useLedger,
} from "@/components/providers/LedgerProvider";
import {
  AlertTriangleIcon,
  BookGuideIcon,
  DownloadTrayIcon,
  RefreshBatchIcon,
  TrashBinIcon,
  UploadStackIcon,
} from "@/components/icons/LedgerIcons";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function PhotoCompressorPage() {
  const {
    announcePolite,
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
  } = useLedger();

  const [dragging, setDragging] = useState(false);
  const [zipping, setZipping] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const currentConfigKey = `${compressPreset}|${compressFormat}|${compressMaxDim}`;
  const settingsChangedForBatch =
    compressedItems.length > 0 && appliedCompressKey !== currentConfigKey;

  const totalStats = useMemo(() => {
    const orig = compressedItems.reduce((s, i) => s + i.originalBytes, 0);
    const comp = compressedItems.reduce((s, i) => s + i.compressedBytes, 0);
    const savedPct =
      orig > 0 ? Math.max(0, Math.round(((orig - comp) / orig) * 100)) : 0;
    return { orig, comp, savedPct };
  }, [compressedItems]);

  useEffect(() => {
    function handleWindowPaste(e: ClipboardEvent) {
      if (compressProcessing) return;
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
        void processCompressFiles(clipboardFiles);
      }
    }

    window.addEventListener("paste", handleWindowPaste);
    return () => window.removeEventListener("paste", handleWindowPaste);
  }, [compressProcessing, processCompressFiles]);

  async function onPickFiles(files: FileList | null) {
    if (!files || compressProcessing) return;
    await processCompressFiles(files);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function downloadSingle(item: CompressedPhotoItem) {
    const a = document.createElement("a");
    a.href = item.previewUrl;
    a.download = item.outputName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function downloadAllZip() {
    if (compressedItems.length === 0 || compressProcessing) return;
    if (compressedItems.length === 1) {
      downloadSingle(compressedItems[0]);
      return;
    }

    setZipping(true);
    try {
      const zip = new JSZip();
      const usedNames = new Set<string>();
      for (const item of compressedItems) {
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

  const progressPct = compressProgress
    ? Math.round(
        (compressProgress.current / Math.max(1, compressProgress.total)) * 100
      )
    : 0;

  const controlsLocked = compressProcessing || zipping;

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
              {compressProcessing ? "Target Ukuran (Terkunci)" : "1. Target Ukuran"}
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
                const active = compressPreset === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={controlsLocked}
                    aria-pressed={active}
                    onClick={() => setCompressPresetSafe(opt.id)}
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
              disabled={controlsLocked}
              value={String(compressMaxDim)}
              onChange={(e) => setCompressMaxDimSafe(Number(e.target.value))}
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
              disabled={controlsLocked}
              value={compressFormat}
              onChange={(e) => setCompressFormatSafe(e.target.value as OutputFormat)}
              className="input-ledger text-sm"
            >
              <option value="keep">Asli</option>
              <option value="image/jpeg">JPG</option>
              <option value="image/webp">WebP</option>
            </select>
          </div>
        </div>

        {settingsChangedForBatch && !controlsLocked && (
          <div className="pt-2.5 border-t border-[var(--border-subtle)] flex items-center justify-between gap-2">
            <span className="text-xs text-[var(--ink-secondary)]">
              Terapkan ke{" "}
              <strong className="font-mono-tabular">{compressedItems.length}</strong>{" "}
              foto?
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
          if (!controlsLocked) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!controlsLocked) void onPickFiles(e.dataTransfer.files);
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
          disabled={controlsLocked}
          onChange={(e) => void onPickFiles(e.target.files)}
          className="sr-only"
        />

        <div className="max-w-md mx-auto space-y-2">
          <label
            htmlFor="input-kompres-foto"
            aria-disabled={controlsLocked}
            className={`btn-stamp text-sm sm:text-base px-5 py-2.5 w-full sm:w-auto ${
              controlsLocked ? "opacity-60 pointer-events-none" : ""
            }`}
          >
            <UploadStackIcon className="w-5 h-5 shrink-0" />
            <span>
              {compressProcessing
                ? "Sedang Memproses..."
                : compressedItems.length > 0
                ? `2. Tambah Foto (${compressedItems.length})`
                : "2. Pilih Foto"}
            </span>
          </label>
          <p className="text-xs text-[var(--ink-secondary)]">
            Bisa banyak file sekaligus · JPG, PNG, WebP (maks. 25 MB)
          </p>
        </div>

        {compressProcessing && compressProgress && (
          <div
            role="status"
            aria-live="polite"
            className="mt-4 p-3 rounded-[6px] bg-[var(--bg-subtle)] border border-[var(--border-card)] text-left max-w-md mx-auto space-y-2"
          >
            <div className="flex items-center justify-between gap-2 text-xs font-mono-tabular text-[var(--ink-primary)]">
              <span className="truncate">{compressProgress.fileName}</span>
              <span className="shrink-0 font-bold">
                {compressProgress.current}/{compressProgress.total}
              </span>
            </div>
            <div
              role="progressbar"
              aria-label="Progres kompresi"
              aria-valuenow={compressProgress.current}
              aria-valuemin={0}
              aria-valuemax={compressProgress.total}
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
                onClick={cancelCompressBatch}
                className="btn-secondary !py-1 !px-2.5 text-xs"
              >
                Batalkan
              </button>
            </div>
          </div>
        )}
      </section>

      {compressError && (
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
          <span>{compressError}</span>
        </div>
      )}

      {compressedItems.length > 0 && (
        <section aria-label="Hasil kompresi" className="space-y-3">
          <div className="rounded-[8px] bg-[var(--bg-surface)] border-2 border-[var(--border-strong)] p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="text-xs sm:text-sm">
              <p className="font-bold text-[var(--ink-primary)] font-mono-tabular">
                {compressedItems.length} foto · Hemat {totalStats.savedPct}%
              </p>
              <p className="text-xs font-mono-tabular text-[var(--ink-secondary)]">
                {formatFileSize(totalStats.orig)} &rarr; {formatFileSize(totalStats.comp)}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={controlsLocked}
                onClick={clearCompressedItems}
                className="btn-secondary !py-1.5 !px-3 text-xs"
              >
                <TrashBinIcon className="w-4 h-4 shrink-0" />
                <span>Reset</span>
              </button>

              <button
                type="button"
                disabled={controlsLocked}
                onClick={() => void downloadAllZip()}
                className="btn-ledger text-xs sm:text-sm flex-1 sm:flex-initial"
              >
                <DownloadTrayIcon className="w-4 h-4 shrink-0" />
                <span>
                  {zipping
                    ? "Membuat ZIP..."
                    : compressedItems.length > 1
                    ? `Unduh ZIP (${compressedItems.length})`
                    : "Unduh"}
                </span>
              </button>
            </div>
          </div>

          <ul className="space-y-2.5">
            {compressedItems.map((item) => {
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
                      disabled={controlsLocked}
                      onClick={() => removeCompressedItem(item.id)}
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
