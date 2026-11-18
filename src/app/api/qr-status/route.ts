import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

export async function GET() {
  const pubDir = path.join(process.cwd(), "public");
  const candidates = ["qr-donasi.png", "qr-donasi.jpg", "qr-donasi.jpeg", "qr-donasi.webp"];
  for (const file of candidates) {
    if (fs.existsSync(path.join(pubDir, file))) {
      return NextResponse.json({ exists: true, src: `/${file}` });
    }
  }
  return NextResponse.json({ exists: false, src: null });
}
