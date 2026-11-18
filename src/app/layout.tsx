import type { Metadata, Viewport } from "next";
import "@fontsource/plus-jakarta-sans/400.css";
import "@fontsource/plus-jakarta-sans/500.css";
import "@fontsource/plus-jakarta-sans/600.css";
import "@fontsource/plus-jakarta-sans/700.css";
import "@fontsource/newsreader/600.css";
import "@fontsource/newsreader/700.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/600.css";
import "./globals.css";
import { LedgerProvider } from "@/components/providers/LedgerProvider";
import { AppShell } from "@/components/layout/AppShell";

export const metadata: Metadata = {
  title: {
    default: "BERESinHAHAY | Foto Nota ke Excel & PDF + Kompres Foto",
    template: "%s | BERESinHAHAY",
  },
  description:
    "Unggah foto struk atau nota warung sebanyak apa pun tanpa batas kuota, lalu langsung unduh rekap Excel dan lampiran PDF A4. Dilengkapi fitur kompres foto.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" data-theme="light" suppressHydrationWarning>
      <body>
        <LedgerProvider>
          <AppShell>{children}</AppShell>
        </LedgerProvider>
      </body>
    </html>
  );
}
