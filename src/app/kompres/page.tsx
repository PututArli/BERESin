"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import imageCompression from "browser-image-compression";
import JSZip from "jszip";
import type { CompressedPhotoItem } from "@/types/beresin";
import { useLedger } from "@/components/providers/LedgerProvider";
import {
  AlertTriangleIcon,
  DownloadTrayIcon,
  PhotoCompressIcon,
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

function buildOutputFilename(originalName: string, mime: string): string {
  const base = originalName.replace(/\.[^.]+$/, "");
  if (mime === "image/webp") return `${base}-kompres.webp`;
  if (mime === "image/png") return `${base}-kompres.png`;
  return `${base}-kompres.jpg`;
}

export default function PhotoCompressorPage() {
  const { announcePolite } = useLedger();

  const [preset, setPreset] = useState<TargetSizePreset>("500kb");
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("keep");
  const [maxDimension, setMaxDimension] = useState<number>(1600);

  const [items, setItems] = useState<CompressedPhotoItem[]>([]);
  const [processing, setProcessing] = useState(false);
  const [progressMsg, setProgressMsg] = useState("");
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

  async function handleFiles(fileList: FileList | File[] | null) {
    if (!fileList) return;
    const files = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
    if (files.length === 0) {
      setErrorMsg("Pilih berkas gambar berformat JPG, PNG, atau WebP.");
      return;
    }

    setErrorMsg("");
    setProcessing(true);
    const batch: CompressedPhotoItem[] = [];

    try {
      for (let i = 0; i < files.length; i += 1) {
        const file = files[i];
        setProgressMsg(`Mengompres foto ${i + 1} dari ${files.length} (${file.name})...`);

        const desiredMime = outputFormat === "keep" ? file.type : outputFormat;
        const compressedBlob = await imageCompression(file, {
          maxSizeMB: targetMaxMb,
          maxWidthOrHeight: maxDimension > 0 ? maxDimension : undefined,
          fileType: desiredMime || undefined,
          useWebWorker: true,
        });

        // Keep original file if it is already smaller and format did not change.
        const finalBlob =
          outputFormat === "keep" && compressedBlob.size >= file.size
            ? file
            : compressedBlob;

        const previewUrl = URL.createObjectURL(finalBlob);
        const dims = await getImageDimensions(previewUrl);

        batch.push({
          id: crypto.randomUUID(),
          originalName: file.name,
          outputName: buildOutputFilename(file.name, finalBlob.type || file.type),
          originalBytes: file.size,
          compressedBytes: finalBlob.size,
          previewUrl,
          blob: finalBlob,
          width: dims.width,
          height: dims.height,
        });
      }

      setItems((prev) => [...batch, ...prev]);
      announcePolite(`${batch.length} foto selesai dikompres.`);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Terjadi kendala saat mengompres foto."
      );
    } finally {
      setProcessing(false);
      setProgressMsg("");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
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
      a.download = `foto-kompres-beresinhahay.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(zipUrl), 2000);
      announcePolite("Bundel ZIP hasil kompresi berhasil diunduh.");
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
    announcePolite("Daftar foto hasil kompresi dibersihkan.");
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8">
      <section className="space-y-2">
        <h1 className="font-serif-ledger font-bold text-3xl sm:text-4xl text-[var(--ink-primary)] tracking-tight">
          Kompres foto langsung di peramban.
        </h1>
        <p className="text-base text-[var(--ink-secondary)] max-w-2xl">
          Kecilkan ukuran banyak foto sekaligus tanpa batas kuota. Semua foto diproses di perangkat Anda sendiri sehingga cepat dan aman.
        </p>
      </section>

      <section className="rounded-[8px] bg-[var(--bg-surface)] border border-[var(--border-control)] p-4 sm:p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
          <div className="md:col-span-6">
            <span className="block text-xs font-bold uppercase text-[var(--ink-secondary)] mb-1.5">
              Target Ukuran Maksimal
            </span>
            <div
              role="group"
              aria-label="Pilih target ukuran kompresi"
              className="flex flex-wrap gap-1.5"
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
                    className={`flex-1 min-w-[88px] min-h-[44px] px-2 rounded-[6px] text-xs sm:text-sm font-mono-tabular font-semibold border ${
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

          <div className="md:col-span-3">
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
              <option value="1200">1200 px (Dokumen)</option>
              <option value="1600">1600 px (Tajam)</option>
              <option value="0">Resolusi Asli</option>
            </select>
          </div>

          <div className="md:col-span-3">
            <label
              htmlFor="select-out-format"
              className="block text-xs font-bold uppercase text-[var(--ink-secondary)] mb-1.5"
            >
              Format Hasil
            </label>
            <select
              id="select-out-format"
              value={outputFormat}
              onChange={(e) => setOutputFormat(e.target.value as OutputFormat)}
              className="input-ledger text-sm"
            >
              <option value="keep">Sesuai Asli</option>
              <option value="image/jpeg">JPG</option>
              <option value="image/webp">WebP (Lebih Kecil)</option>
            </select>
          </div>
        </div>
      </section>

      <section
        aria-label="Area unggah foto untuk dikompres"
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
        className={`rounded-[8px] border-2 border-dashed p-4 sm:p-10 text-center transition-colors ${
          dragging
            ? "bg-[var(--verified-bg)] border-[var(--color-ledger)]"
            : "bg-[var(--bg-surface)] border-[var(--border-control)]"
        }`}
      >
        <input
          ref={fileInputRef}
          id="input-kompres-foto"
          type="file"
          accept="image/*"
          multiple
          disabled={processing}
          onChange={(e) => void handleFiles(e.target.files)}
          className="sr-only"
        />

        <div className="max-w-md mx-auto space-y-3">
          <label
            htmlFor="input-kompres-foto"
            className={`btn-stamp text-base px-4 sm:px-6 py-3 w-full sm:w-auto ${
              processing ? "opacity-60 pointer-events-none" : ""
            }`}
          >
            <UploadStackIcon className="w-5 h-5" />
            <span>
              {processing ? "Sedang Mengompres..." : "Pilih Foto untuk Dikompres"}
            </span>
          </label>
          <p className="text-xs sm:text-sm text-[var(--ink-secondary)]">
            Bisa pilih puluhan foto sekaligus atau tarik langsung ke kotak ini.
          </p>
        </div>

        {processing && progressMsg && (
          <div
            role="status"
            aria-live="polite"
            className="mt-5 p-3 rounded-[6px] bg-[var(--bg-subtle)] border border-[var(--border-control)] text-xs font-mono-tabular text-[var(--ink-primary)] max-w-lg mx-auto"
          >
            {progressMsg}
          </div>
        )}
      </section>

      {errorMsg && (
        <div
          role="alert"
          className="p-4 rounded-[8px] border-2 flex items-center gap-2.5 text-sm font-semibold"
          style={{
            backgroundColor: "var(--stamp-tint-bg)",
            color: "var(--stamp-tint-ink)",
            borderColor: "var(--stamp-tint-border)",
          }}
        >
          <AlertTriangleIcon className="w-5 h-5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {items.length > 0 && (
        <section aria-label="Daftar foto hasil kompresi" className="space-y-4">
          <div className="rounded-[8px] bg-[var(--bg-surface)] border-2 border-[var(--color-ledger)] p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              <p className="font-bold text-[var(--ink-primary)]">
                {items.length} foto siap diunduh · Hemat {totalStats.savedPct}%
              </p>
              <p className="text-xs font-mono-tabular text-[var(--ink-secondary)]">
                Total awal {formatFileSize(totalStats.orig)} menjadi{" "}
                {formatFileSize(totalStats.comp)}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={clearAll}
                className="btn-secondary text-xs"
              >
                <TrashBinIcon className="w-4 h-4" />
                <span>Bersihkan</span>
              </button>

              <button
                type="button"
                disabled={zipping}
                onClick={() => void downloadAllZip()}
                className="btn-ledger text-sm"
              >
                <DownloadTrayIcon className="w-4 h-4" />
                <span>
                  {zipping
                    ? "Membuat ZIP..."
                    : items.length > 1
                    ? "Unduh Semua (.zip)"
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
                  className="rounded-[8px] bg-[var(--bg-surface)] border border-[var(--border-control)] p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3"
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
                        {formatFileSize(item.originalBytes)} →{" "}
                        <strong className="text-[var(--ink-primary)]">
                          {formatFileSize(item.compressedBytes)}
                        </strong>{" "}
                        ({item.width}x{item.height} px)
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 ml-auto">
                    <span
                      className="px-2.5 py-1 rounded-[4px] border text-xs font-mono-tabular font-bold"
                      style={{
                        backgroundColor: "var(--verified-bg)",
                        color: "var(--verified-ink)",
                        borderColor: "var(--verified-border)",
                      }}
                    >
                      -{savedPct}%
                    </span>

                    <button
                      type="button"
                      onClick={() => downloadSingle(item)}
                      className="btn-secondary !py-1.5 !px-3 text-xs"
                    >
                      <DownloadTrayIcon className="w-4 h-4" />
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
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {items.length === 0 && !processing && (
        <div className="flex items-center justify-center gap-2 text-xs sm:text-sm text-[var(--ink-muted)] pt-2">
          <PhotoCompressIcon className="w-4 h-4 shrink-0" />
          <span>Belum ada foto yang dipilih. Unggah foto di atas untuk mulai mengompres.</span>
        </div>
      )}
    </div>
  );
}
