"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLedger } from "@/components/providers/LedgerProvider";
import {
  BookGuideIcon,
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

  const isDark = settings.theme === "dark";

  return (
    <div className="min-h-dvh flex flex-col bg-[var(--bg-paper)] text-[var(--ink-primary)]">
      <a href="#konten-utama" className="skip-link">
        Lewati ke isi utama
      </a>

      <header className="bg-[var(--bg-surface)] border-b border-[var(--border-card)]">
        <div className="max-w-5xl mx-auto px-3.5 sm:px-6 py-2 space-y-2 md:space-y-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 lg:gap-5 min-w-0">
              <Link
                href="/"
                className="inline-flex items-center gap-2 min-h-[44px] text-[var(--ink-primary)] no-underline shrink-0"
              >
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-[5px] bg-[var(--color-ledger)] text-[var(--color-ledger-ink)]">
                  <ReceiptSheetIcon className="w-4 h-4" />
                </span>
                <span className="font-serif-ledger font-bold text-lg tracking-tight">
                  BERESin
                </span>
              </Link>

              <nav
                aria-label="Menu utama"
                className="hidden md:flex items-center gap-1.5"
              >
                <Link
                  href="/"
                  aria-current={pathname === "/" ? "page" : undefined}
                  className={`inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-[6px] text-sm font-semibold border ${
                    pathname === "/"
                      ? "bg-[var(--color-ledger)] text-[var(--color-ledger-ink)] border-[var(--color-ledger)]"
                      : "bg-[var(--bg-surface)] text-[var(--ink-primary)] border-transparent hover:bg-[var(--bg-subtle)]"
                  }`}
                >
                  <span>Rekap Nota</span>
                </Link>

                <Link
                  href="/kompres"
                  aria-current={pathname.startsWith("/kompres") ? "page" : undefined}
                  className={`inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-[6px] text-sm font-semibold border ${
                    pathname.startsWith("/kompres")
                      ? "bg-[var(--color-ledger)] text-[var(--color-ledger-ink)] border-[var(--color-ledger)]"
                      : "bg-[var(--bg-surface)] text-[var(--ink-primary)] border-transparent hover:bg-[var(--bg-subtle)]"
                  }`}
                >
                  <span>Kompres Foto</span>
                </Link>

                <Link
                  href="/panduan"
                  aria-current={pathname.startsWith("/panduan") ? "page" : undefined}
                  className={`inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-[6px] text-sm font-semibold border ${
                    pathname.startsWith("/panduan")
                      ? "bg-[var(--color-ledger)] text-[var(--color-ledger-ink)] border-[var(--color-ledger)]"
                      : "bg-[var(--bg-surface)] text-[var(--ink-primary)] border-transparent hover:bg-[var(--bg-subtle)]"
                  }`}
                >
                  <span>Panduan</span>
                </Link>
              </nav>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setDonateOpen(true)}
                className="btn-secondary !px-2.5 sm:!px-3 text-xs"
              >
                <QrCodeIcon className="w-4 h-4 shrink-0" />
                <span>Donasi</span>
              </button>

              <button
                type="button"
                onClick={toggleTheme}
                aria-label={isDark ? "Ganti ke mode terang" : "Ganti ke mode gelap"}
                className="btn-secondary !px-2.5 min-w-[44px] text-xs"
              >
                <ThemeLampIcon isDark={isDark} className="w-4 h-4 shrink-0" />
              </button>
            </div>
          </div>

          <nav
            aria-label="Menu seluler"
            className="md:hidden grid grid-cols-3 gap-1.5 pt-1.5 border-t border-[var(--border-subtle)]"
          >
            <Link
              href="/"
              aria-current={pathname === "/" ? "page" : undefined}
              className={`inline-flex items-center justify-center min-h-[44px] px-2 rounded-[6px] text-xs font-semibold border whitespace-nowrap ${
                pathname === "/"
                  ? "bg-[var(--color-ledger)] text-[var(--color-ledger-ink)] border-[var(--color-ledger)]"
                  : "bg-[var(--bg-paper)] text-[var(--ink-primary)] border-[var(--border-control)]"
              }`}
            >
              Rekap Nota
            </Link>

            <Link
              href="/kompres"
              aria-current={pathname.startsWith("/kompres") ? "page" : undefined}
              className={`inline-flex items-center justify-center min-h-[44px] px-2 rounded-[6px] text-xs font-semibold border whitespace-nowrap ${
                pathname.startsWith("/kompres")
                  ? "bg-[var(--color-ledger)] text-[var(--color-ledger-ink)] border-[var(--color-ledger)]"
                  : "bg-[var(--bg-paper)] text-[var(--ink-primary)] border-[var(--border-control)]"
              }`}
            >
              Kompres Foto
            </Link>

            <Link
              href="/panduan"
              aria-current={pathname.startsWith("/panduan") ? "page" : undefined}
              className={`inline-flex items-center justify-center min-h-[44px] px-2 rounded-[6px] text-xs font-semibold border whitespace-nowrap ${
                pathname.startsWith("/panduan")
                  ? "bg-[var(--color-ledger)] text-[var(--color-ledger-ink)] border-[var(--color-ledger)]"
                  : "bg-[var(--bg-paper)] text-[var(--ink-primary)] border-[var(--border-control)]"
              }`}
            >
              Panduan
            </Link>
          </nav>
        </div>
      </header>

      <main id="konten-utama" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>

      <footer className="border-t border-[var(--border-card)] bg-[var(--bg-surface)] mt-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--ink-secondary)]">
          <span className="font-serif-ledger font-bold text-sm text-[var(--ink-primary)]">
            BERESin
          </span>
          <div className="flex items-center gap-2">
            <Link
              href="/panduan"
              className="inline-flex items-center gap-1 min-h-[44px] px-2 font-semibold text-[var(--ink-primary)] underline underline-offset-4"
            >
              <BookGuideIcon className="w-3.5 h-3.5" />
              <span>Panduan</span>
            </Link>
            <button
              type="button"
              onClick={() => setDonateOpen(true)}
              className="inline-flex items-center gap-1 min-h-[44px] px-2 font-semibold text-[var(--ink-primary)] underline underline-offset-4"
            >
              <QrCodeIcon className="w-3.5 h-3.5" />
              <span>QRIS Donasi</span>
            </button>
          </div>
        </div>
      </footer>

      {donateOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4"
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
            className="w-full max-w-sm max-h-[92dvh] overflow-y-auto rounded-[8px] bg-[var(--bg-surface)] border-2 border-[var(--border-control)] shadow-2xl p-4 sm:p-5 space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <h2
                id="judul-dialog-donasi"
                className="font-serif-ledger font-bold text-lg text-[var(--ink-primary)]"
              >
                Dukung BERESin
              </h2>
              <button
                type="button"
                onClick={() => setDonateOpen(false)}
                aria-label="Tutup jendela donasi"
                className="btn-secondary !p-2 min-w-[44px] shrink-0"
              >
                <CloseXIcon />
              </button>
            </div>

            <div className="p-3 rounded-[8px] bg-[var(--bg-paper)] border border-[var(--border-card)] text-center space-y-2">
              <img
                src="/qris-beresin.jpeg"
                alt="Kode QRIS Donasi BERESin, Service (NMID ID1026641946102)"
                width={1136}
                height={1600}
                loading="eager"
                decoding="async"
                className="mx-auto w-full max-w-[236px] sm:max-w-[268px] h-auto rounded-[6px] bg-white p-1.5 border border-[var(--border-card)]"
              />
              <p className="text-xs text-[var(--ink-secondary)] font-mono-tabular">
                BERESin, Service · NMID: ID1026641946102
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <a
                href="/qris-beresin.jpeg"
                download="QRIS-BERESin.jpeg"
                className="btn-secondary w-full no-underline text-xs sm:text-sm"
              >
                <DownloadTrayIcon className="w-4 h-4 shrink-0" />
                <span>Simpan QRIS</span>
              </a>
              <button
                type="button"
                onClick={() => setDonateOpen(false)}
                className="btn-ledger w-full text-xs sm:text-sm"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
