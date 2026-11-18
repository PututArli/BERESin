import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Kompres Banyak Foto Sekaligus",
  description:
    "Kecilkan ukuran puluhan foto sekaligus langsung di HP atau laptop secara gratis tanpa daftar akun.",
};

export default function KompresLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
