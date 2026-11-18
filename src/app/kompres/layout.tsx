import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Kompres Foto Instan",
  description:
    "Kecilkan ukuran banyak foto sekaligus langsung di peramban secara gratis tanpa batas kuota.",
};

export default function KompresLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
