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

function resolveSafeSiteUrl(): URL {
  const raw = (process.env.NEXT_PUBLIC_SITE_URL ?? "")
    .replace(/^['"]+|['"]+$/g, "")
    .trim();
  if (!raw) return new URL("https://beresinhahay.my.id");
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    return new URL(withProtocol);
  } catch {
    return new URL("https://beresinhahay.my.id");
  }
}

export const metadata: Metadata = {
  metadataBase: resolveSafeSiteUrl(),
  title: {
    default: "BERESin | Ubah Foto Struk Jadi Laporan LPJ & Kompres Foto",
    template: "%s | BERESin",
  },
  description:
    "Ubah foto struk belanja atau nota warung menjadi laporan LPJ otomatis dalam format PDF, Word, Excel, CSV, dan HTML, dilengkapi fitur pengecil ukuran banyak foto.",
  alternates: {
    canonical: "/",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

const themeInitScript = `try{var t=localStorage.getItem("beresin_theme");if(t==="dark"||t==="light"){document.documentElement.setAttribute("data-theme",t);}}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <LedgerProvider>
          <AppShell>{children}</AppShell>
        </LedgerProvider>
      </body>
    </html>
  );
}
