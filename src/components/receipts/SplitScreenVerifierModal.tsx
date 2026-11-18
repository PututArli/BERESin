"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PaymentMethod, Project, Receipt, ReceiptItem } from "@/types/beresin";
import { formatRupiah, parseIndonesianMoneyInput } from "@/lib/format";
import {
  AlertTriangleIcon,
  CloseXIcon,
  PlusBoxIcon,
  RefreshBatchIcon,
  Rotate90Icon,
  StampCheckIcon,
  TrashBinIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "@/components/icons/LedgerIcons";

interface SplitScreenVerifierModalProps {
  project: Project;
  receipts: Receipt[];
  activeReceiptId: string;
  onClose: () => void;
  onSelectReceipt: (id: string) => void;
  onSaveReceipt: (updated: Receipt, moveNext: boolean) => Promise<void>;
  onDeleteReceipt: (id: string) => Promise<void>;
  onReanalyzeReceipt?: (receipt: Receipt) => Promise<Receipt | null>;
}

const PAYMENT_METHODS: PaymentMethod[] = [
  "Tunai",
  "QRIS",
  "Transfer",
  "Kartu",
  "Lainnya",
];

function clampValue(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

export function SplitScreenVerifierModal({
  project,
  receipts,
  activeReceiptId,
  onClose,
  onSelectReceipt,
  onSaveReceipt,
  onDeleteReceipt,
  onReanalyzeReceipt,
}: SplitScreenVerifierModalProps) {
  const activeIndex = useMemo(
    () => receipts.findIndex((r) => r.id === activeReceiptId),
    [receipts, activeReceiptId]
  );
  const receipt = receipts[activeIndex] ?? null;

  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragOriginRef = useRef({ x: 0, y: 0 });
  const viewerBoxRef = useRef<HTMLDivElement | null>(null);

  const [mobileTab, setMobileTab] = useState<"form" | "image">("form");

  const [merchantName, setMerchantName] = useState("");
  const [transactionDate, setTransactionDate] = useState("");
  const [category, setCategory] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("Tunai");
  const [taxAndService, setTaxAndService] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [totalAmount, setTotalAmount] = useState(0);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<ReceiptItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const modalRef = useRef<HTMLDivElement | null>(null);

  const syncFormFromReceipt = useCallback(
    (r: Receipt) => {
      setMerchantName(r.merchantName);
      setTransactionDate(r.transactionDate ?? "");
      setCategory(r.category || project.categories[0] || "Lain-lain");
      setPaymentMethod(r.paymentMethod || "Tunai");
      setTaxAndService(r.taxAndService || 0);
      setDiscount(r.discount || 0);
      setTotalAmount(r.totalAmount || 0);
      setNotes(r.notes || "");
      setItems(
        r.items.length > 0
          ? r.items.map((it) => ({ ...it }))
          : [
              {
                id: crypto.randomUUID(),
                receiptId: r.id,
                itemName: "",
                quantity: 1,
                unitPrice: r.totalAmount || 0,
                totalPrice: r.totalAmount || 0,
              },
            ]
      );
      setFormError(null);
    },
    [project.categories]
  );

  useEffect(() => {
    if (!receipt) return;
    setZoom(1);
    setRotation(0);
    setPan({ x: 0, y: 0 });
    setMobileTab("form");
    syncFormFromReceipt(receipt);
  }, [receipt, syncFormFromReceipt]);

  // Clamp pan offset strictly to zoomed overflow so the receipt can never be dragged off-screen.
  const clampPanOffset = useCallback(
    (rawX: number, rawY: number, targetZoom: number) => {
      if (targetZoom <= 1) return { x: 0, y: 0 };
      const box = viewerBoxRef.current;
      const boxW = box?.clientWidth || 340;
      const boxH = box?.clientHeight || 420;
      const maxX = Math.round(((targetZoom - 1) * boxW) * 0.5);
      const maxY = Math.round(((targetZoom - 1) * boxH) * 0.5);
      return {
        x: clampValue(rawX, -maxX, maxX),
        y: clampValue(rawY, -maxY, maxY),
      };
    },
    []
  );

  const updateZoomLevel = useCallback(
    (nextZoom: number) => {
      const clampedZoom = clampValue(Number(nextZoom.toFixed(2)), 1, 3);
      setZoom(clampedZoom);
      setPan((prev) => clampPanOffset(prev.x, prev.y, clampedZoom));
    },
    [clampPanOffset]
  );

  const itemsSubtotal = useMemo(
    () => items.reduce((sum, item) => sum + (Number(item.totalPrice) || 0), 0),
    [items]
  );

  const calculatedGrandTotal = useMemo(
    () => itemsSubtotal + (Number(taxAndService) || 0) - (Number(discount) || 0),
    [itemsSubtotal, taxAndService, discount]
  );

  const discrepancy = useMemo(
    () => totalAmount - calculatedGrandTotal,
    [totalAmount, calculatedGrandTotal]
  );

  const buildUpdatedReceipt = useCallback(
    (nextStatus: "verified" | "needs_review"): Receipt | null => {
      if (!receipt) return null;
      const cleanedMerchant = merchantName.trim();
      if (!cleanedMerchant) {
        setFormError("Nama toko atau tempat beli wajib diisi sebelum menyimpan.");
        return null;
      }

      const sanitizedItems = items
        .filter((it) => it.itemName.trim() !== "" || it.totalPrice > 0)
        .map((it) => ({
          ...it,
          itemName: it.itemName.trim() || "Pembelian barang",
        }));

      return {
        ...receipt,
        merchantName: cleanedMerchant,
        transactionDate: transactionDate || null,
        category,
        paymentMethod,
        subtotal: itemsSubtotal,
        taxAndService,
        discount,
        totalAmount,
        notes: notes.trim(),
        status: nextStatus,
        confidenceScore: nextStatus === "verified" ? 1 : receipt.confidenceScore,
        warningMessage: nextStatus === "verified" ? null : receipt.warningMessage,
        items: sanitizedItems,
      };
    },
    [
      receipt,
      merchantName,
      transactionDate,
      category,
      paymentMethod,
      itemsSubtotal,
      taxAndService,
      discount,
      totalAmount,
      notes,
      items,
    ]
  );

  const handleConfirmVerified = useCallback(
    async (moveNext: boolean) => {
      const next = buildUpdatedReceipt("verified");
      if (!next) return;
      setSaving(true);
      try {
        await onSaveReceipt(next, moveNext);
      } finally {
        setSaving(false);
      }
    },
    [buildUpdatedReceipt, onSaveReceipt]
  );

  const handleSaveDraft = useCallback(async () => {
    const next = buildUpdatedReceipt("needs_review");
    if (!next) return;
    setSaving(true);
    try {
      await onSaveReceipt(next, false);
    } finally {
      setSaving(false);
    }
  }, [buildUpdatedReceipt, onSaveReceipt]);

  const handleReanalyze = useCallback(async () => {
    if (!receipt || !onReanalyzeReceipt || reanalyzing) return;
    setFormError(null);
    setReanalyzing(true);
    try {
      const updated = await onReanalyzeReceipt(receipt);
      if (updated) {
        syncFormFromReceipt(updated);
      }
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : "Gagal menganalisis ulang foto struk."
      );
    } finally {
      setReanalyzing(false);
    }
  }, [onReanalyzeReceipt, reanalyzing, receipt, syncFormFromReceipt]);

  // Trap keyboard focus inside modal, close on Escape, and bind Ctrl+Enter for fast verification.
  useEffect(() => {
    const dialogEl = modalRef.current;
    if (!dialogEl) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        void handleConfirmVerified(true);
        return;
      }
      if (e.key === "Tab" && dialogEl) {
        const focusable = dialogEl.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, handleConfirmVerified]);

  if (!receipt) return null;

  function updateItemRow(
    rowId: string,
    field: "itemName" | "quantity" | "unitPrice",
    rawValue: string
  ) {
    setItems((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) return row;
        if (field === "itemName") {
          return { ...row, itemName: rawValue };
        }
        if (field === "quantity") {
          const qty = Math.max(0, parseFloat(rawValue) || 0);
          return {
            ...row,
            quantity: qty,
            totalPrice: Math.round(qty * row.unitPrice),
          };
        }
        const price = parseIndonesianMoneyInput(rawValue);
        return {
          ...row,
          unitPrice: price,
          totalPrice: Math.round(row.quantity * price),
        };
      })
    );
  }

  function addItemRow() {
    if (!receipt) return;
    setItems((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        receiptId: receipt.id,
        itemName: "",
        quantity: 1,
        unitPrice: 0,
        totalPrice: 0,
      },
    ]);
  }

  function removeItemRow(rowId: string) {
    setItems((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.id !== rowId)));
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (zoom <= 1) return;
    setIsDragging(true);
    dragOriginRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!isDragging || zoom <= 1) return;
    const rawX = e.clientX - dragOriginRef.current.x;
    const rawY = e.clientY - dragOriginRef.current.y;
    setPan(clampPanOffset(rawX, rawY, zoom));
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!isDragging) return;
    setIsDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture already ended
    }
  }

  const prevReceipt = activeIndex > 0 ? receipts[activeIndex - 1] : null;
  const nextReceipt =
    activeIndex >= 0 && activeIndex < receipts.length - 1
      ? receipts[activeIndex + 1]
      : null;

  const lowConfidence =
    receipt.confidenceScore < 0.8 || Boolean(receipt.warningMessage);
  const isManualBlank = receipt.imageHash.startsWith("manual-");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-3 lg:p-5"
      style={{ backgroundColor: "var(--modal-scrim)" }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="judul-modal-verifikasi"
        className="w-full h-dvh sm:h-[94dvh] max-w-6xl bg-[var(--bg-surface)] sm:rounded-[8px] sm:border-2 border-[var(--border-control)] shadow-2xl flex flex-col overflow-hidden"
      >
        <div className="px-3 sm:px-5 py-2.5 bg-[var(--bg-subtle)] border-b border-[var(--border-card)] flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="stamp-ref shrink-0">#{receipt.referenceNumber}</span>
            <h2
              id="judul-modal-verifikasi"
              className="font-serif-ledger font-bold text-base sm:text-lg text-[var(--ink-primary)] truncate"
            >
              Cek Data Struk
            </h2>
            {receipts.length > 1 && (
              <span className="text-xs font-mono-tabular text-[var(--ink-secondary)] shrink-0">
                ({activeIndex + 1}/{receipts.length})
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {receipts.length > 1 && (
              <>
                <button
                  type="button"
                  disabled={!prevReceipt}
                  onClick={() => prevReceipt && onSelectReceipt(prevReceipt.id)}
                  aria-label="Nota sebelumnya"
                  className="btn-secondary !px-2.5 min-w-[44px] text-xs"
                >
                  <span aria-hidden="true">&lsaquo;</span>
                  <span className="hidden md:inline">Sebelumnya</span>
                </button>
                <button
                  type="button"
                  disabled={!nextReceipt}
                  onClick={() => nextReceipt && onSelectReceipt(nextReceipt.id)}
                  aria-label="Nota berikutnya"
                  className="btn-secondary !px-2.5 min-w-[44px] text-xs"
                >
                  <span className="hidden md:inline">Berikutnya</span>
                  <span aria-hidden="true">&rsaquo;</span>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup jendela cek struk"
              className="btn-secondary !p-2 min-w-[44px]"
            >
              <CloseXIcon />
            </button>
          </div>
        </div>

        <div
          role="tablist"
          aria-label="Pilih tampilan di layar ponsel"
          className="lg:hidden grid grid-cols-2 gap-2 border-b border-[var(--border-card)] bg-[var(--bg-paper)] px-3 py-2 shrink-0"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mobileTab === "form"}
            onClick={() => setMobileTab("form")}
            className={`min-h-[44px] rounded-[6px] text-xs font-semibold border ${
              mobileTab === "form"
                ? "bg-[var(--color-ledger)] text-[var(--color-ledger-ink)] border-[var(--color-ledger)]"
                : "bg-[var(--bg-surface)] text-[var(--ink-primary)] border-[var(--border-control)]"
            }`}
          >
            Isi &amp; Cek Angka
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mobileTab === "image"}
            onClick={() => setMobileTab("image")}
            className={`min-h-[44px] rounded-[6px] text-xs font-semibold border ${
              mobileTab === "image"
                ? "bg-[var(--color-ledger)] text-[var(--color-ledger-ink)] border-[var(--color-ledger)]"
                : "bg-[var(--bg-surface)] text-[var(--ink-primary)] border-[var(--border-control)]"
            }`}
          >
            Perbesar Foto Struk
          </button>
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 lg:divide-x divide-[var(--border-card)] overflow-hidden">
          <div
            className={`${
              mobileTab === "image" ? "flex" : "hidden lg:flex"
            } lg:col-span-5 flex-col min-h-0 bg-[var(--bg-paper)] h-full`}
          >
            <div className="px-3 py-2 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] flex items-center justify-between gap-1.5 shrink-0">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={zoom <= 1}
                  onClick={() => updateZoomLevel(zoom - 0.5)}
                  aria-label="Perkecil foto struk"
                  className="btn-secondary !px-2.5 min-w-[44px] text-xs"
                >
                  <ZoomOutIcon className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setZoom(1);
                    setRotation(0);
                    setPan({ x: 0, y: 0 });
                  }}
                  aria-label="Kembalikan ukuran foto ke 100 persen"
                  className="btn-secondary !px-2.5 text-xs font-mono-tabular min-w-[58px]"
                >
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  type="button"
                  disabled={zoom >= 3}
                  onClick={() => updateZoomLevel(zoom + 0.5)}
                  aria-label="Perbesar foto struk"
                  className="btn-secondary !px-2.5 min-w-[44px] text-xs"
                >
                  <ZoomInIcon className="w-4 h-4" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => setRotation((r) => (r + 90) % 360)}
                aria-label="Putar foto 90 derajat"
                className="btn-secondary !px-3 text-xs"
              >
                <Rotate90Icon className="w-4 h-4" />
                <span>Putar 90°</span>
              </button>
            </div>

            <div
              ref={viewerBoxRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onDoubleClick={() => updateZoomLevel(zoom > 1 ? 1 : 2)}
              style={{
                cursor:
                  zoom <= 1 ? "zoom-in" : isDragging ? "grabbing" : "grab",
                touchAction: zoom > 1 ? "none" : "manipulation",
              }}
              className="flex-1 min-h-0 overflow-hidden relative flex items-center justify-center p-3 sm:p-4 select-none"
            >
              <img
                src={receipt.imageUrl}
                alt={`Foto bukti struk ${receipt.referenceNumber} dari ${receipt.merchantName}`}
                width={640}
                height={880}
                draggable={false}
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${rotation}deg)`,
                  transformOrigin: "center center",
                }}
                className="max-h-full max-w-full w-auto h-auto object-contain rounded-[4px] border border-[var(--border-card)] bg-white"
              />

              {/* Single-pointer pan nudge buttons appear only while zoomed in (WCAG 2.5.7) */}
              {zoom > 1 && (
                <div
                  role="group"
                  aria-label="Geser bagian foto yang diperbesar"
                  className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 p-1 rounded-[6px] bg-[var(--bg-surface)] border border-[var(--border-control)] shadow-md"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setPan((p) => clampPanOffset(p.x + 50, p.y, zoom))
                    }
                    aria-label="Lihat sisi kiri foto"
                    className="btn-secondary !p-1.5 min-w-[44px] text-xs"
                  >
                    &larr;
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setPan((p) => clampPanOffset(p.x, p.y + 50, zoom))
                    }
                    aria-label="Lihat bagian atas foto"
                    className="btn-secondary !p-1.5 min-w-[44px] text-xs"
                  >
                    &uarr;
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setPan((p) => clampPanOffset(p.x, p.y - 50, zoom))
                    }
                    aria-label="Lihat bagian bawah foto"
                    className="btn-secondary !p-1.5 min-w-[44px] text-xs"
                  >
                    &darr;
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setPan((p) => clampPanOffset(p.x - 50, p.y, zoom))
                    }
                    aria-label="Lihat sisi kanan foto"
                    className="btn-secondary !p-1.5 min-w-[44px] text-xs"
                  >
                    &rarr;
                  </button>
                </div>
              )}
            </div>
          </div>

          <div
            className={`${
              mobileTab === "form" ? "flex" : "hidden lg:flex"
            } lg:col-span-7 flex-col min-h-0 h-full`}
            onFocusCapture={(e) => {
              const target = e.target as HTMLElement | null;
              if (
                target &&
                (target.tagName === "INPUT" ||
                  target.tagName === "TEXTAREA" ||
                  target.tagName === "SELECT")
              ) {
                target.scrollIntoView({ block: "nearest" });
              }
            }}
          >
            <div className="flex-1 min-h-0 overflow-y-auto p-3.5 sm:p-5 lg:p-6 space-y-4">
              {/* Compact mobile preview strip so users see the photo & re-scan button without stealing screen height */}
              <div className="flex flex-wrap items-center justify-between gap-2.5 p-2.5 sm:p-3 rounded-[6px] bg-[var(--bg-paper)] border border-[var(--border-card)]">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={() => setMobileTab("image")}
                    aria-label="Buka tampilan foto struk penuh"
                    className="lg:hidden w-12 h-14 shrink-0 rounded-[4px] border border-[var(--border-control)] overflow-hidden bg-white"
                  >
                    <img
                      src={receipt.imageUrl}
                      alt={`Pratinjau ${receipt.referenceNumber}`}
                      width={48}
                      height={56}
                      className="w-full h-full object-cover"
                    />
                  </button>
                  <div className="min-w-0 text-xs">
                    <p className="font-bold text-[var(--ink-primary)]">
                      {isManualBlank
                        ? "Catatan tanpa foto struk"
                        : "Hasil analisis otomatis dari foto"}
                    </p>
                    <p className="text-[var(--ink-secondary)]">
                      {isManualBlank
                        ? "Isi kolom di bawah sesuai pengeluaran Anda."
                        : "Belum sesuai foto? Klik Baca Ulang agar dianalisis lagi."}
                    </p>
                  </div>
                </div>

                {!isManualBlank && onReanalyzeReceipt && (
                  <button
                    type="button"
                    disabled={reanalyzing}
                    onClick={() => void handleReanalyze()}
                    className="btn-secondary !py-1.5 !px-3 text-xs w-full sm:w-auto"
                  >
                    <RefreshBatchIcon className="w-4 h-4 shrink-0" />
                    <span>
                      {reanalyzing ? "Menganalisis Foto..." : "Baca Ulang dari Foto"}
                    </span>
                  </button>
                )}
              </div>

              {lowConfidence && (
                <div
                  role="alert"
                  className="rounded-[6px] p-3 border-2 flex items-start gap-2.5"
                  style={{
                    backgroundColor: "var(--amber-bg)",
                    color: "var(--amber-ink)",
                    borderColor: "var(--amber-border)",
                  }}
                >
                  <AlertTriangleIcon className="w-5 h-5 shrink-0 mt-0.5" />
                  <div className="text-xs sm:text-sm">
                    <p className="font-bold">Mohon cek kembali angkanya</p>
                    <p className="mt-0.5">
                      {receipt.warningMessage ??
                        "Sebagian tulisan di struk agak samar. Pastikan tanggal dan total belanja sudah sama dengan foto."}
                    </p>
                  </div>
                </div>
              )}

              {receipt.isDuplicate && (
                <div
                  role="alert"
                  className="rounded-[6px] p-3 border-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                  style={{
                    backgroundColor: "var(--stamp-tint-bg)",
                    color: "var(--stamp-tint-ink)",
                    borderColor: "var(--stamp-tint-border)",
                  }}
                >
                  <div className="flex items-start gap-2 text-xs sm:text-sm">
                    <AlertTriangleIcon className="w-5 h-5 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">Kemungkinan Struk Ganda</p>
                      <p>
                        Mirip dengan{" "}
                        <span className="font-mono-tabular font-bold">
                          #{receipt.duplicateOfRef ?? "nota sebelumnya"}
                        </span>
                        . Hapus bila tidak sengaja masuk dua kali.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDeleteReceipt(receipt.id)}
                    className="btn-secondary shrink-0 text-xs"
                  >
                    <TrashBinIcon className="w-4 h-4" />
                    <span>Hapus Ini</span>
                  </button>
                </div>
              )}

              {formError && (
                <div
                  role="alert"
                  className="rounded-[6px] p-3 border-2 text-xs sm:text-sm font-semibold"
                  style={{
                    backgroundColor: "var(--stamp-tint-bg)",
                    color: "var(--stamp-tint-ink)",
                    borderColor: "var(--stamp-tint-border)",
                  }}
                >
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="sm:col-span-2">
                  <label
                    htmlFor="edit-merchant-name"
                    className="block text-xs sm:text-sm font-semibold text-[var(--ink-primary)] mb-1"
                  >
                    Nama Toko / Warung / Penerima
                  </label>
                  <input
                    id="edit-merchant-name"
                    type="text"
                    required
                    value={merchantName}
                    onChange={(e) => {
                      setMerchantName(e.target.value);
                      if (formError) setFormError(null);
                    }}
                    placeholder="Contoh: Indomaret / RM Sederhana"
                    className="input-ledger"
                  />
                </div>

                <div>
                  <label
                    htmlFor="edit-tx-date"
                    className="block text-xs sm:text-sm font-semibold text-[var(--ink-primary)] mb-1"
                  >
                    Tanggal Nota
                  </label>
                  <input
                    id="edit-tx-date"
                    type="date"
                    value={transactionDate}
                    onChange={(e) => setTransactionDate(e.target.value)}
                    className="input-ledger font-mono-tabular"
                  />
                </div>

                <div>
                  <label
                    htmlFor="edit-payment-method"
                    className="block text-xs sm:text-sm font-semibold text-[var(--ink-primary)] mb-1"
                  >
                    Cara Pembayaran
                  </label>
                  <select
                    id="edit-payment-method"
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                    className="input-ledger"
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label
                    htmlFor="edit-category"
                    className="block text-xs sm:text-sm font-semibold text-[var(--ink-primary)] mb-1"
                  >
                    Kategori Pengeluaran
                  </label>
                  <select
                    id="edit-category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="input-ledger"
                  >
                    {project.categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="pt-3 border-t border-[var(--border-subtle)] space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-serif-ledger font-bold text-base text-[var(--ink-primary)]">
                    Daftar Barang yang Dibeli
                  </h3>
                  <button
                    type="button"
                    onClick={addItemRow}
                    className="btn-secondary !py-1.5 !px-3 text-xs"
                  >
                    <PlusBoxIcon className="w-4 h-4 shrink-0" />
                    <span>Tambah Barang</span>
                  </button>
                </div>

                <div className="space-y-2.5">
                  {items.map((item, idx) => (
                    <div
                      key={item.id}
                      className="p-3 rounded-[6px] bg-[var(--bg-paper)] border border-[var(--border-card)] space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <label
                          htmlFor={`item-name-${item.id}`}
                          className="text-xs font-bold text-[var(--ink-secondary)]"
                        >
                          Barang #{idx + 1}
                        </label>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono-tabular font-semibold text-[var(--ink-primary)]">
                            {formatRupiah(item.totalPrice)}
                          </span>
                          {items.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeItemRow(item.id)}
                              aria-label={`Hapus barang ${idx + 1}`}
                              className="btn-secondary !p-2 min-w-[44px]"
                            >
                              <TrashBinIcon className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      <input
                        id={`item-name-${item.id}`}
                        type="text"
                        value={item.itemName}
                        onChange={(e) =>
                          updateItemRow(item.id, "itemName", e.target.value)
                        }
                        placeholder="Nama barang sesuai struk"
                        className="input-ledger text-sm"
                      />

                      <div className="grid grid-cols-12 gap-2.5">
                        <div className="col-span-4">
                          <label
                            htmlFor={`item-qty-${item.id}`}
                            className="block text-xs font-semibold text-[var(--ink-secondary)] mb-1"
                          >
                            Jumlah
                          </label>
                          <input
                            id={`item-qty-${item.id}`}
                            type="number"
                            step="any"
                            min="0"
                            value={item.quantity}
                            onChange={(e) =>
                              updateItemRow(item.id, "quantity", e.target.value)
                            }
                            className="input-ledger font-mono-tabular text-sm"
                          />
                        </div>

                        <div className="col-span-8">
                          <label
                            htmlFor={`item-price-${item.id}`}
                            className="block text-xs font-semibold text-[var(--ink-secondary)] mb-1"
                          >
                            Harga Satuan (Rp)
                          </label>
                          <input
                            id={`item-price-${item.id}`}
                            type="text"
                            inputMode="numeric"
                            value={item.unitPrice === 0 ? "" : String(item.unitPrice)}
                            onChange={(e) =>
                              updateItemRow(item.id, "unitPrice", e.target.value)
                            }
                            placeholder="Contoh: 15000"
                            className="input-ledger font-mono-tabular text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-[var(--border-subtle)]">
                <div>
                  <label
                    htmlFor="edit-tax"
                    className="block text-xs font-semibold text-[var(--ink-secondary)] mb-1"
                  >
                    Pajak / Biaya Lain (Rp)
                  </label>
                  <input
                    id="edit-tax"
                    type="text"
                    inputMode="numeric"
                    value={taxAndService === 0 ? "" : String(taxAndService)}
                    onChange={(e) =>
                      setTaxAndService(parseIndonesianMoneyInput(e.target.value))
                    }
                    placeholder="0"
                    className="input-ledger font-mono-tabular text-sm"
                  />
                </div>

                <div>
                  <label
                    htmlFor="edit-discount"
                    className="block text-xs font-semibold text-[var(--ink-secondary)] mb-1"
                  >
                    Diskon / Potongan (Rp)
                  </label>
                  <input
                    id="edit-discount"
                    type="text"
                    inputMode="numeric"
                    value={discount === 0 ? "" : String(discount)}
                    onChange={(e) =>
                      setDiscount(parseIndonesianMoneyInput(e.target.value))
                    }
                    placeholder="0"
                    className="input-ledger font-mono-tabular text-sm"
                  />
                </div>

                <div>
                  <label
                    htmlFor="edit-total-amount"
                    className="block text-xs font-bold text-[var(--ink-primary)] mb-1"
                  >
                    Total Bayar Akhir (Rp)
                  </label>
                  <input
                    id="edit-total-amount"
                    type="text"
                    inputMode="numeric"
                    value={totalAmount === 0 ? "" : String(totalAmount)}
                    onChange={(e) =>
                      setTotalAmount(parseIndonesianMoneyInput(e.target.value))
                    }
                    placeholder="Contoh: 148500"
                    className="input-ledger font-mono-tabular font-bold text-sm"
                  />
                </div>
              </div>

              <div
                className="rounded-[6px] p-3 border-2"
                style={
                  discrepancy !== 0
                    ? {
                        backgroundColor: "var(--stamp-tint-bg)",
                        color: "var(--stamp-tint-ink)",
                        borderColor: "var(--stamp-tint-border)",
                      }
                    : {
                        backgroundColor: "var(--verified-bg)",
                        color: "var(--verified-ink)",
                        borderColor: "var(--verified-border)",
                      }
                }
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs sm:text-sm">
                  <div className="space-y-0.5">
                    <p className="font-bold flex items-center gap-1.5">
                      {discrepancy !== 0 ? (
                        <>
                          <AlertTriangleIcon className="w-4 h-4 shrink-0" />
                          <span>
                            Selisih {formatRupiah(Math.abs(discrepancy))} antara barang &amp; total
                          </span>
                        </>
                      ) : (
                        <>
                          <StampCheckIcon className="w-4 h-4 shrink-0" />
                          <span>Jumlah barang sudah cocok dengan total bayar</span>
                        </>
                      )}
                    </p>
                    <p className="text-xs font-mono-tabular">
                      Rincian {formatRupiah(calculatedGrandTotal)} · Total{" "}
                      {formatRupiah(totalAmount)}
                    </p>
                  </div>

                  {discrepancy !== 0 && (
                    <button
                      type="button"
                      onClick={() => setTotalAmount(calculatedGrandTotal)}
                      className="btn-secondary text-xs shrink-0"
                    >
                      Samakan ke {formatRupiah(calculatedGrandTotal)}
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label
                  htmlFor="edit-notes"
                  className="block text-xs sm:text-sm font-semibold text-[var(--ink-primary)] mb-1"
                >
                  Catatan Tambahan (Opsional)
                </label>
                <textarea
                  id="edit-notes"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Contoh: Konsumsi rapat panitia"
                  className="input-ledger !min-h-[64px] text-sm"
                />
              </div>
            </div>

            <div className="px-3 sm:px-5 py-2.5 bg-[var(--bg-subtle)] border-t border-[var(--border-card)] flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onDeleteReceipt(receipt.id)}
                aria-label="Hapus nota ini"
                className="btn-secondary !px-3 min-w-[44px] text-xs"
              >
                <TrashBinIcon className="w-4 h-4 shrink-0" />
                <span className="hidden sm:inline">Hapus</span>
              </button>

              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSaveDraft()}
                className="btn-secondary !px-3 text-xs sm:text-sm shrink-0"
              >
                Simpan Dulu
              </button>

              <button
                type="button"
                disabled={saving}
                onClick={() => void handleConfirmVerified(true)}
                className="btn-stamp flex-1 text-xs sm:text-sm"
              >
                <StampCheckIcon className="w-4 h-4 shrink-0" />
                <span>
                  Sudah Pas
                  <span className="hidden sm:inline"> &amp; Lanjut (Ctrl+Enter)</span>
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
