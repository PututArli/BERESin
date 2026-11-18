"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PaymentMethod, Project, Receipt, ReceiptItem } from "@/types/beresin";
import { formatRupiah, parseIndonesianMoneyInput } from "@/lib/format";
import {
  AlertTriangleIcon,
  CloseXIcon,
  PlusBoxIcon,
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
}

const PAYMENT_METHODS: PaymentMethod[] = [
  "Tunai",
  "QRIS",
  "Transfer",
  "Kartu",
  "Lainnya",
];

export function SplitScreenVerifierModal({
  project,
  receipts,
  activeReceiptId,
  onClose,
  onSelectReceipt,
  onSaveReceipt,
  onDeleteReceipt,
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

  const [mobilePane, setMobilePane] = useState<"both" | "image" | "form">("both");

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
  const [formError, setFormError] = useState<string | null>(null);

  const modalRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!receipt) return;
    setZoom(1);
    setRotation(0);
    setPan({ x: 0, y: 0 });
    setMerchantName(receipt.merchantName);
    setTransactionDate(receipt.transactionDate ?? "");
    setCategory(receipt.category || project.categories[0] || "Lain-lain");
    setPaymentMethod(receipt.paymentMethod || "Tunai");
    setTaxAndService(receipt.taxAndService || 0);
    setDiscount(receipt.discount || 0);
    setTotalAmount(receipt.totalAmount || 0);
    setNotes(receipt.notes || "");
    setItems(
      receipt.items.length > 0
        ? receipt.items.map((it) => ({ ...it }))
        : [
            {
              id: crypto.randomUUID(),
              receiptId: receipt.id,
              itemName: "",
              quantity: 1,
              unitPrice: receipt.totalAmount || 0,
              totalPrice: receipt.totalAmount || 0,
            },
          ]
    );
    setFormError(null);
  }, [receipt, project.categories]);

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
        setFormError("Nama toko atau warung wajib diisi sebelum menyimpan.");
        return null;
      }

      const sanitizedItems = items
        .filter((it) => it.itemName.trim() !== "" || it.totalPrice > 0)
        .map((it) => ({
          ...it,
          itemName: it.itemName.trim() || " Pembelian barang",
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

  // Trap keyboard focus inside modal, close on Escape, and bind Ctrl+Enter for fast audit workflow.
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
    setIsDragging(true);
    dragOriginRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragOriginRef.current.x,
      y: e.clientY - dragOriginRef.current.y,
    });
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!isDragging) return;
    setIsDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  }

  const prevReceipt = activeIndex > 0 ? receipts[activeIndex - 1] : null;
  const nextReceipt =
    activeIndex >= 0 && activeIndex < receipts.length - 1
      ? receipts[activeIndex + 1]
      : null;

  const lowConfidence =
    receipt.confidenceScore < 0.8 || Boolean(receipt.warningMessage);

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
        className="w-full h-dvh sm:h-[94dvh] max-w-7xl bg-[var(--bg-surface)] sm:rounded-[8px] border-2 border-[var(--border-control)] shadow-2xl flex flex-col overflow-hidden"
      >
        <div className="px-4 py-3 bg-[var(--bg-subtle)] border-b border-[var(--border-control)] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="stamp-ref">#{receipt.referenceNumber}</span>
            <div>
              <h2
                id="judul-modal-verifikasi"
                className="font-serif-ledger font-bold text-lg leading-tight text-[var(--ink-primary)]"
              >
                Periksa &amp; Sahkan Bukti Nota
              </h2>
              <p className="text-xs text-[var(--ink-secondary)]">
                Nota {activeIndex + 1} dari {receipts.length} pada proyek {project.title}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!prevReceipt}
              onClick={() => prevReceipt && onSelectReceipt(prevReceipt.id)}
              className="btn-secondary !px-3 text-xs"
            >
              Sebelumnya
            </button>
            <button
              type="button"
              disabled={!nextReceipt}
              onClick={() => nextReceipt && onSelectReceipt(nextReceipt.id)}
              className="btn-secondary !px-3 text-xs"
            >
              Berikutnya
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup layar periksa nota"
              className="btn-secondary !p-2 min-w-[44px]"
            >
              <CloseXIcon />
            </button>
          </div>
        </div>

        <div
          role="tablist"
          aria-label="Mode tampilan seluler"
          className="lg:hidden flex flex-wrap border-b border-[var(--border-control)] bg-[var(--bg-paper)] px-3 py-2 gap-2"
        >
          {[
            { id: "both", label: "Atas-Bawah" },
            { id: "image", label: "Foto Struk" },
            { id: "form", label: "Form Angka" },
          ].map((tab) => {
            const selected = mobilePane === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setMobilePane(tab.id as "both" | "image" | "form")}
                className={`flex-1 min-h-[44px] rounded-[6px] text-xs font-semibold border ${
                  selected
                    ? "bg-[var(--color-ledger)] text-[var(--color-ledger-ink)] border-[var(--color-ledger)]"
                    : "bg-[var(--bg-surface)] text-[var(--ink-primary)] border-[var(--border-control)]"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-[var(--border-control)] overflow-y-auto lg:overflow-hidden">
          <div
            className={`${
              mobilePane === "form" ? "hidden lg:flex" : "flex"
            } flex-col min-h-[340px] lg:min-h-0 bg-[var(--bg-paper)]`}
          >
            <div className="px-3 py-2 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.min(3.5, Number((z + 0.25).toFixed(2))))}
                  aria-label="Perbesar tampilan foto nota"
                  className="btn-secondary !px-2.5 text-xs"
                >
                  <ZoomInIcon className="w-4 h-4" />
                  <span>Perbesar</span>
                </button>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.25).toFixed(2))))}
                  aria-label="Perkecil tampilan foto nota"
                  className="btn-secondary !px-2.5 text-xs"
                >
                  <ZoomOutIcon className="w-4 h-4" />
                  <span>Perkecil</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRotation((r) => (r + 90) % 360)}
                  aria-label="Putar foto nota 90 derajat searah jarum jam"
                  className="btn-secondary !px-2.5 text-xs"
                >
                  <Rotate90Icon className="w-4 h-4" />
                  <span>Putar 90°</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setZoom(1);
                    setRotation(0);
                    setPan({ x: 0, y: 0 });
                  }}
                  className="btn-secondary !px-2.5 text-xs font-mono-tabular"
                >
                  Reset ({Math.round(zoom * 100)}%)
                </button>
              </div>

              {/* Single-pointer pan buttons satisfying WCAG 2.5.7 Dragging Movements */}
              <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Geser posisi foto tanpa seret">
                <button
                  type="button"
                  onClick={() => setPan((p) => ({ ...p, x: p.x + 40 }))}
                  aria-label="Geser foto ke kanan"
                  className="btn-secondary !px-2.5 min-w-[44px] text-xs"
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={() => setPan((p) => ({ ...p, y: p.y + 40 }))}
                  aria-label="Geser foto ke bawah"
                  className="btn-secondary !px-2.5 min-w-[44px] text-xs"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => setPan((p) => ({ ...p, y: p.y - 40 }))}
                  aria-label="Geser foto ke atas"
                  className="btn-secondary !px-2.5 min-w-[44px] text-xs"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => setPan((p) => ({ ...p, x: p.x - 40 }))}
                  aria-label="Geser foto ke kiri"
                  className="btn-secondary !px-2.5 min-w-[44px] text-xs"
                >
                  →
                </button>
              </div>
            </div>

            <div
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              style={{
                cursor: isDragging ? "grabbing" : "grab",
                touchAction: "none",
              }}
              className="flex-1 overflow-hidden relative flex items-center justify-center p-4 select-none min-h-[280px]"
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
                className="max-h-full max-w-full w-auto h-auto object-contain rounded-[4px] border border-[var(--border-control)] bg-white"
              />
            </div>
          </div>

          <div
            className={`${
              mobilePane === "image" ? "hidden lg:flex" : "flex"
            } flex-col lg:min-h-0 lg:overflow-y-auto`}
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
            <div className="p-4 sm:p-6 pb-10 space-y-5 flex-1">
              {lowConfidence && (
                <div
                  role="alert"
                  className="rounded-[6px] p-3.5 border-2 flex items-start gap-3"
                  style={{
                    backgroundColor: "var(--amber-bg)",
                    color: "var(--amber-ink)",
                    borderColor: "var(--amber-border)",
                  }}
                >
                  <AlertTriangleIcon className="w-5 h-5 shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-bold">
                      Perlu Pemeriksaan Bendahara (Keyakinan Bacaan:{" "}
                      {Math.round(receipt.confidenceScore * 100)}%)
                    </p>
                    <p className="mt-0.5">
                      {receipt.warningMessage ??
                        "Sebagian teks pada struk kurang jelas. Pastikan tanggal dan total akhir sesuai dengan foto."}
                    </p>
                  </div>
                </div>
              )}

              {receipt.isDuplicate && (
                <div
                  role="alert"
                  className="rounded-[6px] p-3.5 border-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  style={{
                    backgroundColor: "var(--stamp-tint-bg)",
                    color: "var(--stamp-tint-ink)",
                    borderColor: "var(--stamp-tint-border)",
                  }}
                >
                  <div className="flex items-start gap-2.5 text-sm">
                    <AlertTriangleIcon className="w-5 h-5 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">Kemungkinan Nota Ganda</p>
                      <p>
                        Data foto, tanggal, atau total sama dengan{" "}
                        <span className="font-mono-tabular font-bold">
                          #{receipt.duplicateOfRef ?? "nota sebelumnya"}
                        </span>
                        . Hapus bila terunggah dua kali.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDeleteReceipt(receipt.id)}
                    className="btn-secondary shrink-0 text-xs"
                  >
                    <TrashBinIcon className="w-4 h-4" />
                    <span>Hapus Nota Ini</span>
                  </button>
                </div>
              )}

              {formError && (
                <div
                  role="alert"
                  className="rounded-[6px] p-3 border-2 text-sm font-semibold"
                  style={{
                    backgroundColor: "var(--stamp-tint-bg)",
                    color: "var(--stamp-tint-ink)",
                    borderColor: "var(--stamp-tint-border)",
                  }}
                >
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label
                    htmlFor="edit-merchant-name"
                    className="block text-sm font-semibold text-[var(--ink-primary)] mb-1"
                  >
                    Nama Toko / Warung / Penerima Transfer
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
                    placeholder="Contoh: Toko Fotokopi Berkah"
                    className="input-ledger"
                  />
                </div>

                <div>
                  <label
                    htmlFor="edit-tx-date"
                    className="block text-sm font-semibold text-[var(--ink-primary)] mb-1"
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
                    className="block text-sm font-semibold text-[var(--ink-primary)] mb-1"
                  >
                    Metode Pembayaran
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
                    className="block text-sm font-semibold text-[var(--ink-primary)] mb-1"
                  >
                    Kategori / Pos Anggaran
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

              <div className="pt-2 border-t border-[var(--border-subtle)]">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <h3 className="font-serif-ledger font-bold text-base text-[var(--ink-primary)]">
                    Rincian Barang pada Nota
                  </h3>
                  <button
                    type="button"
                    onClick={addItemRow}
                    className="btn-secondary !py-1.5 !px-3 text-xs"
                  >
                    <PlusBoxIcon className="w-4 h-4" />
                    <span>Tambah Baris</span>
                  </button>
                </div>

                <div className="space-y-3">
                  {items.map((item, idx) => (
                    <div
                      key={item.id}
                      className="p-3 rounded-[6px] bg-[var(--bg-paper)] border border-[var(--border-control)] grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end"
                    >
                      <div className="sm:col-span-5">
                        <label
                          htmlFor={`item-name-${item.id}`}
                          className="block text-xs font-semibold text-[var(--ink-secondary)] mb-1"
                        >
                          Nama Barang #{idx + 1}
                        </label>
                        <input
                          id={`item-name-${item.id}`}
                          type="text"
                          value={item.itemName}
                          onChange={(e) =>
                            updateItemRow(item.id, "itemName", e.target.value)
                          }
                          placeholder="Uraian barang"
                          className="input-ledger !min-h-[44px] text-sm"
                        />
                      </div>

                      <div className="sm:col-span-2">
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
                          className="input-ledger !min-h-[44px] font-mono-tabular text-sm"
                        />
                      </div>

                      <div className="sm:col-span-3">
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
                          placeholder="Contoh: 25000"
                          className="input-ledger !min-h-[44px] font-mono-tabular text-sm"
                        />
                      </div>

                      <div className="sm:col-span-2 flex items-center justify-between sm:justify-end gap-2">
                        <span className="sm:hidden text-xs font-mono-tabular font-semibold text-[var(--ink-secondary)]">
                          Subtotal: {formatRupiah(item.totalPrice)}
                        </span>
                        <button
                          type="button"
                          disabled={items.length <= 1}
                          onClick={() => removeItemRow(item.id)}
                          aria-label={`Hapus baris barang ${idx + 1}`}
                          className="btn-secondary !p-2.5 min-w-[44px]"
                        >
                          <TrashBinIcon className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="hidden sm:block sm:col-span-12 text-right text-xs font-mono-tabular text-[var(--ink-secondary)]">
                        Subtotal Baris:{" "}
                        <strong className="text-[var(--ink-primary)]">
                          {formatRupiah(item.totalPrice)}
                        </strong>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-[var(--border-subtle)]">
                <div>
                  <label
                    htmlFor="edit-tax"
                    className="block text-xs font-semibold text-[var(--ink-secondary)] mb-1"
                  >
                    Pajak / Biaya Layanan (Rp)
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
                    className="input-ledger font-mono-tabular"
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
                    className="input-ledger font-mono-tabular"
                  />
                </div>

                <div>
                  <label
                    htmlFor="edit-total-amount"
                    className="block text-xs font-bold text-[var(--ink-primary)] mb-1"
                  >
                    Total Akhir Dibayar (Rp)
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
                    className="input-ledger font-mono-tabular font-bold"
                  />
                </div>
              </div>

              {/* Kalkulator Selisih Otomatis (PRD Bagian 6.2) */}
              <div
                className="rounded-[6px] p-3.5 border-2"
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
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm">
                  <div className="space-y-0.5">
                    <p className="font-bold flex items-center gap-2">
                      {discrepancy !== 0 ? (
                        <>
                          <AlertTriangleIcon className="w-4 h-4 shrink-0" />
                          <span>
                            Ada Selisih {formatRupiah(Math.abs(discrepancy))} antara Rincian &amp; Total Nota
                          </span>
                        </>
                      ) : (
                        <>
                          <StampCheckIcon className="w-4 h-4 shrink-0" />
                          <span>Hitungan Rincian Cocok dengan Total Akhir Nota</span>
                        </>
                      )}
                    </p>
                    <p className="text-xs font-mono-tabular">
                      Jumlah Rincian ({formatRupiah(calculatedGrandTotal)}) vs Total Akhir Nota (
                      {formatRupiah(totalAmount)})
                    </p>
                  </div>

                  {discrepancy !== 0 && (
                    <button
                      type="button"
                      onClick={() => setTotalAmount(calculatedGrandTotal)}
                      className="btn-secondary text-xs shrink-0"
                    >
                      Samakan Total ke {formatRupiah(calculatedGrandTotal)}
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label
                  htmlFor="edit-notes"
                  className="block text-sm font-semibold text-[var(--ink-primary)] mb-1"
                >
                  Catatan Tambahan Bendahara (Opsional)
                </label>
                <textarea
                  id="edit-notes"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Contoh: Konsumsi rapat koordinasi seksi acara"
                  className="input-ledger !min-h-[68px]"
                />
              </div>
            </div>

            <div className="sticky bottom-0 z-10 px-4 py-3 bg-[var(--bg-subtle)] border-t border-[var(--border-control)] flex flex-wrap items-center justify-between gap-2.5">
              <button
                type="button"
                onClick={() => onDeleteReceipt(receipt.id)}
                className="btn-secondary text-xs"
              >
                <TrashBinIcon className="w-4 h-4" />
                <span>Hapus</span>
              </button>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleSaveDraft}
                  className="btn-secondary text-sm"
                >
                  Simpan Draf
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleConfirmVerified(true)}
                  className="btn-stamp text-sm"
                >
                  <StampCheckIcon className="w-4 h-4" />
                  <span>Tandai Sah &amp; Lanjut (Ctrl+Enter)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
