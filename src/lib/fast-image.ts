import { computeBlobHash } from "@/lib/format";

interface DecodedSource {
  width: number;
  height: number;
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  cleanup: () => void;
}

async function decodeImageFast(file: Blob): Promise<DecodedSource> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file);
      return {
        width: bmp.width || 800,
        height: bmp.height || 600,
        draw: (ctx, w, h) => ctx.drawImage(bmp, 0, 0, w, h),
        cleanup: () => bmp.close(),
      };
    } catch {
      // Fall back to HTMLImageElement if createImageBitmap fails on a specific format
    }
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({
        width: img.naturalWidth || 800,
        height: img.naturalHeight || 600,
        draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
        cleanup: () => URL.revokeObjectURL(url),
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Gagal membaca berkas gambar."));
    };
    img.src = url;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality?: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error("Gagal mengonversi gambar."));
      },
      mimeType,
      quality
    );
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Gagal membaca data gambar."));
    reader.readAsDataURL(blob);
  });
}

// Single-pass hardware-accelerated resize for OCR: ~40-70ms instead of multi-second iterative compression.
export async function prepareReceiptImageFast(file: File): Promise<{
  dataUrl: string;
  mimeType: string;
  imageHash: string;
}> {
  const decoded = await decodeImageFast(file);
  try {
    const origW = decoded.width;
    const origH = decoded.height;
    const longEdge = Math.max(origW, origH);
    const shortEdge = Math.max(1, Math.min(origW, origH));
    const aspect = longEdge / shortEdge;

    // Keep higher long-edge limit on tall receipts so small thermal font stays crisp while normal photos stay ~200 KB.
    const maxLongEdge = aspect > 2.1 ? 1750 : 1280;
    const scale = longEdge > maxLongEdge ? maxLongEdge / longEdge : 1;
    const targetW = Math.max(1, Math.round(origW * scale));
    const targetH = Math.max(1, Math.round(origH * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) {
      throw new Error("Kanvas peramban tidak tersedia.");
    }

    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, targetW, targetH);
    decoded.draw(ctx, targetW, targetH);

    let blob = await canvasToBlob(canvas, "image/jpeg", 0.78);
    if (blob.size > 1_400_000) {
      blob = await canvasToBlob(canvas, "image/jpeg", 0.62);
    }

    const [dataUrl, imageHash] = await Promise.all([
      blobToDataUrl(blob),
      computeBlobHash(blob),
    ]);

    return {
      dataUrl,
      mimeType: "image/jpeg",
      imageHash,
    };
  } finally {
    decoded.cleanup();
  }
}

// Fast 1-to-2 pass proportional photo compressor replacing 10-iteration binary search loops.
export async function compressPhotoFast(
  file: File,
  targetMaxBytes: number,
  maxDimension: number,
  outputFormat: "keep" | "image/jpeg" | "image/webp"
): Promise<{
  blob: Blob;
  width: number;
  height: number;
}> {
  if (
    outputFormat === "keep" &&
    maxDimension === 0 &&
    file.size <= targetMaxBytes
  ) {
    const decoded = await decodeImageFast(file);
    const dims = { width: decoded.width, height: decoded.height };
    decoded.cleanup();
    return { blob: file, width: dims.width, height: dims.height };
  }

  const decoded = await decodeImageFast(file);
  try {
    const origW = decoded.width;
    const origH = decoded.height;
    const longEdge = Math.max(origW, origH);
    const scale =
      maxDimension > 0 && longEdge > maxDimension ? maxDimension / longEdge : 1;

    let width = Math.max(1, Math.round(origW * scale));
    let height = Math.max(1, Math.round(origH * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Kanvas peramban tidak tersedia.");
    }

    let targetMime = outputFormat === "keep" ? file.type : outputFormat;
    if (targetMime !== "image/webp" && targetMime !== "image/png") {
      targetMime = "image/jpeg";
    }

    const drawWithBg = (w: number, h: number, fillWhite: boolean) => {
      canvas.width = w;
      canvas.height = h;
      if (fillWhite) {
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, w, h);
      } else {
        ctx.clearRect(0, 0, w, h);
      }
      decoded.draw(ctx, w, h);
    };

    if (targetMime === "image/png") {
      drawWithBg(width, height, false);
      const pngBlob = await canvasToBlob(canvas, "image/png");
      if (pngBlob.size <= targetMaxBytes * 1.15) {
        return {
          blob: pngBlob.size >= file.size && scale === 1 ? file : pngBlob,
          width,
          height,
        };
      }
      // Fall back to JPEG when lossless PNG cannot fit the requested KB cap.
      targetMime = "image/jpeg";
    }

    drawWithBg(width, height, targetMime === "image/jpeg");

    const q1 = targetMaxBytes <= 220_000 ? 0.72 : 0.82;
    let blob = await canvasToBlob(canvas, targetMime, q1);

    if (blob.size > targetMaxBytes) {
      const ratio = targetMaxBytes / blob.size;
      const q2 = Math.max(0.28, Math.min(q1 - 0.12, q1 * Math.sqrt(ratio) * 0.92));
      blob = await canvasToBlob(canvas, targetMime, q2);
    }

    if (blob.size > targetMaxBytes * 1.15 && Math.max(width, height) > 900) {
      width = Math.max(1, Math.round(width * 0.76));
      height = Math.max(1, Math.round(height * 0.76));
      drawWithBg(width, height, targetMime === "image/jpeg");
      blob = await canvasToBlob(canvas, targetMime, 0.62);
    }

    if (outputFormat === "keep" && blob.size >= file.size) {
      return { blob: file, width: origW, height: origH };
    }

    return { blob, width, height };
  } finally {
    decoded.cleanup();
  }
}
