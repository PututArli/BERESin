"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLedger } from "@/components/providers/LedgerProvider";
import {
  CloseXIcon,
  DownloadTrayIcon,
  PhotoCompressIcon,
  QrCodeIcon,
  ReceiptSheetIcon,
  ThemeLampIcon,
} from "@/components/icons/LedgerIcons";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { settings, toggleTheme } = useLedger();

  const [donateOpen, setDonateOpen] = useState(false);
  const donateModalRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!donateOpen) return;
    const activeEl = donateModalRef.current;
    if (!activeEl) return;

    const focusables = activeEl.querySelectorAll<HTMLElement>(
      'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])'
    );
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    first?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setDonateOpen(false);
        return;
      }
      if (e.key === "Tab" && focusables.length > 0) {
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [donateOpen]);

  return (
    <div className="min-h-dvh flex flex-col bg-[var(--bg-paper)] text-[var(--ink-primary)]">
      <a href="#konten-utama" className="skip-link">
        Lewati ke konten utama
      </a>

      <header className="bg-[var(--bg-surface)] border-b-2 border-[var(--color-ledger)]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-2.5 space-y-2.5 sm:space-y-0">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-4 min-w-0">
              <Link
                href="/"
                className="inline-flex items-center gap-2 min-h-[44px] text-[var(--ink-primary)] no-underline shrink-0"
              >
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-[4px] bg-[var(--color-ledger)] text-[var(--color-ledger-ink)]">
                  <ReceiptSheetIcon className="w-4 h-4" />
                </span>
                <span className="font-serif-ledger font-bold text-lg sm:text-xl tracking-tight">
                  BERESinHAHAY
                </span>
              </Link>

              <nav
                aria-label="Menu alat utama"
                className="hidden sm:flex items-center gap-2"
              >
                <Link
                  href="/"
                  aria-current={pathname === "/" ? "page" : undefined}
                  className={`inline-flex items-center gap-1.5 min-h-[44px] px-3.5 rounded-[6px] text-sm font-semibold border ${
                    pathname === "/"
                      ? "bg-[var(--color-ledger)] text-[var(--color-ledger-ink)] border-[var(--color-ledger)]"
                      : "bg-[var(--bg-surface)] text-[var(--ink-primary)] border-[var(--border-control)] hover:bg-[var(--bg-subtle)]"
                  }`}
                >
                  <ReceiptSheetIcon className="w-4 h-4" />
                  <span>Rekap Nota</span>
                </Link>

                <Link
                  href="/kompres"
                  aria-current={pathname.startsWith("/kompres") ? "page" : undefined}
                  className={`inline-flex items-center gap-1.5 min-h-[44px] px-3.5 rounded-[6px] text-sm font-semibold border ${
                    pathname.startsWith("/kompres")
                      ? "bg-[var(--color-ledger)] text-[var(--color-ledger-ink)] border-[var(--color-ledger)]"
                      : "bg-[var(--bg-surface)] text-[var(--ink-primary)] border-[var(--border-control)] hover:bg-[var(--bg-subtle)]"
                  }`}
                >
                  <PhotoCompressIcon className="w-4 h-4" />
                  <span>Kompres Foto</span>
                </Link>
              </nav>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setDonateOpen(true)}
                className="btn-secondary !px-3 text-xs sm:text-sm"
              >
                <QrCodeIcon className="w-4 h-4 text-[var(--stamp-accent)]" />
                <span>Donasi</span>
              </button>

              <button
                type="button"
                onClick={toggleTheme}
                aria-label={
                  settings.theme === "dark"
                    ? "Ganti ke tema terang"
                    : "Ganti ke tema gelap"
                }
                className="btn-secondary !px-3 min-w-[44px]"
              >
                <ThemeLampIcon isDark={settings.theme === "dark"} />
              </button>
            </div>
          </div>

          {/* Dedicated mobile 2-tab row so primary destinations stay one thumb tap away without crowding */}
          <nav
            aria-label="Menu alat seluler"
            className="sm:hidden grid grid-cols-2 gap-2 pt-1 border-t border-[var(--border-subtle)]"
          >
            <Link
              href="/"
              aria-current={pathname === "/" ? "page" : undefined}
              className={`inline-flex items-center justify-center gap-1.5 min-h-[44px] px-2 rounded-[6px] text-xs font-semibold border ${
                pathname === "/"
                  ? "bg-[var(--color-ledger)] text-[var(--color-ledger-ink)] border-[var(--color-ledger)]"
                  : "bg-[var(--bg-paper)] text-[var(--ink-primary)] border-[var(--border-control)]"
              }`}
            >
              <ReceiptSheetIcon className="w-4 h-4 shrink-0" />
              <span>Rekap Nota</span>
            </Link>

            <Link
              href="/kompres"
              aria-current={pathname.startsWith("/kompres") ? "page" : undefined}
              className={`inline-flex items-center justify-center gap-1.5 min-h-[44px] px-2 rounded-[6px] text-xs font-semibold border ${
                pathname.startsWith("/kompres")
                  ? "bg-[var(--color-ledger)] text-[var(--color-ledger-ink)] border-[var(--color-ledger)]"
                  : "bg-[var(--bg-paper)] text-[var(--ink-primary)] border-[var(--border-control)]"
              }`}
            >
              <PhotoCompressIcon className="w-4 h-4 shrink-0" />
              <span>Kompres Foto</span>
            </Link>
          </nav>
        </div>
      </header>

      <main id="konten-utama" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>

      <footer className="border-t border-[var(--border-control)] bg-[var(--bg-surface)] mt-12">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm text-[var(--ink-secondary)]">
          <p>
            <strong className="text-[var(--ink-primary)] font-serif-ledger">
              BERESinHAHAY
            </strong>{" "}
            · Gratis tanpa batas kuota untuk rekap nota LPJ &amp; kompresi foto.
          </p>
          <button
            type="button"
            onClick={() => setDonateOpen(true)}
            className="inline-flex items-center gap-1.5 min-h-[44px] px-2 underline underline-offset-4 font-semibold text-[var(--ink-primary)]"
          >
            <QrCodeIcon className="w-4 h-4" />
            <span>Dukung via QRIS</span>
          </button>
        </div>
      </footer>

      {donateOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "var(--modal-scrim)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setDonateOpen(false);
          }}
        >
          <div
            ref={donateModalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="judul-dialog-donasi"
            className="w-full max-w-sm max-h-[90dvh] overflow-y-auto rounded-[8px] bg-[var(--bg-surface)] border-2 border-[var(--border-control)] shadow-2xl p-5 sm:p-6 space-y-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2
                  id="judul-dialog-donasi"
                  className="font-serif-ledger font-bold text-xl text-[var(--ink-primary)]"
                >
                  Dukung BERESinHAHAY
                </h2>
                <p className="text-xs sm:text-sm text-[var(--ink-secondary)] mt-0.5">
                  Seluruh fitur di web ini gratis tanpa kuota. Jika terbantu, Anda dapat berdonasi sukarela lewat QRIS (mendukung semua e-wallet &amp; mobile banking).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDonateOpen(false)}
                aria-label="Tutup dialog donasi"
                className="btn-secondary !p-2 min-w-[44px]"
              >
                <CloseXIcon />
              </button>
            </div>

            <div className="p-3 sm:p-4 rounded-[8px] bg-[var(--bg-paper)] border border-[var(--border-control)] text-center space-y-2.5">
              <img
                src="/qr-donasi.jpeg"
                alt="Kode QRIS Donasi BERESinHAHAY (NMID ID1026641946102)"
                width={1136}
                height={1600}
                loading="eager"
                decoding="async"
                className="mx-auto w-full max-w-[256px] sm:max-w-[280px] h-auto rounded-[6px] bg-white p-1.5 border border-[var(--border-control)]"
              />
              <p className="text-xs text-[var(--ink-secondary)] font-mono-tabular">
                BERESinHAHAY · NMID: ID1026641946102
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <a
                href="/qr-donasi.jpeg"
                download="QRIS-Donasi-BERESinHAHAY.jpeg"
                className="btn-secondary w-full no-underline"
              >
                <DownloadTrayIcon className="w-4 h-4 shrink-0" />
                <span>Unduh QRIS</span>
              </a>
              <button
                type="button"
                onClick={() => setDonateOpen(false)}
                className="btn-ledger w-full"
              >
                Selesai
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
