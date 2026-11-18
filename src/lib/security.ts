const WORKSPACE_ID_REGEX =
  /^ws-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SAFE_DATA_IMAGE_REGEX =
  /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

const CONTROL_CHARS_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function isValidWorkspaceId(value: unknown): value is string {
  return typeof value === "string" && WORKSPACE_ID_REGEX.test(value.trim());
}

export function isValidUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_V4_REGEX.test(value.trim());
}

export function sanitizePlainText(value: unknown, maxLength = 160): string {
  if (typeof value !== "string") return "";
  return value.replace(CONTROL_CHARS_REGEX, "").trim().slice(0, maxLength);
}

export function sanitizeSafeDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const [yStr, mStr, dStr] = trimmed.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const check = new Date(Date.UTC(y, m - 1, d));
  if (
    check.getUTCFullYear() !== y ||
    check.getUTCMonth() + 1 !== m ||
    check.getUTCDate() !== d
  ) {
    return null;
  }
  return trimmed;
}

export function sanitizeMoneyAmount(value: unknown): number {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return 0;
  const rounded = Math.round(num);
  if (rounded < 0) return 0;
  if (rounded > 100_000_000_000) return 100_000_000_000;
  return rounded;
}

export function sanitizeQuantity(value: unknown): number {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num) || num < 0) return 0;
  if (num > 1_000_000) return 1_000_000;
  return Number(num.toFixed(4));
}

// Rejects SVG, HTML, external URLs, and oversized payloads to prevent stored XSS and SSRF.
export function isValidSafeImageDataUrl(
  value: unknown,
  maxCharLength = 3_200_000
): value is string {
  if (typeof value !== "string") return false;
  if (value.length < 32 || value.length > maxCharLength) return false;
  return SAFE_DATA_IMAGE_REGEX.test(value);
}

// Prefix leading formula triggers so exported spreadsheets cannot execute DDE/CSV injection in Excel.
export function sanitizeSpreadsheetCell(value: string): string {
  const cleaned = sanitizePlainText(value, 500);
  if (/^[=+\-@|\t\r]/.test(cleaned)) {
    return `'${cleaned}`;
  }
  return cleaned;
}

// Inspects the first 12 bytes of an uploaded file to ensure genuine JPEG, PNG, or WebP content.
export async function verifyImageMagicBytes(file: Blob): Promise<boolean> {
  if (file.size < 12 || file.size > 25 * 1024 * 1024) return false;
  const slice = await file.slice(0, 12).arrayBuffer();
  const b = new Uint8Array(slice);

  const isJpeg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  const isPng =
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47 &&
    b[4] === 0x0d &&
    b[5] === 0x0a &&
    b[6] === 0x1a &&
    b[7] === 0x0a;
  const isWebp =
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50;

  return isJpeg || isPng || isWebp;
}

export function verifySameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return true;
  try {
    const parsed = new URL(origin);
    return parsed.host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}

interface RateBucket {
  timestamps: number[];
}

const rateBuckets = new Map<string, RateBucket>();

export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): boolean {
  const now = Date.now();
  if (rateBuckets.size > 2000) {
    for (const [k, v] of rateBuckets.entries()) {
      if (v.timestamps.every((t) => now - t > windowMs)) {
        rateBuckets.delete(k);
      }
    }
  }

  const bucket = rateBuckets.get(key) ?? { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((t) => now - t < windowMs);
  if (bucket.timestamps.length >= maxRequests) {
    rateBuckets.set(key, bucket);
    return false;
  }
  bucket.timestamps.push(now);
  rateBuckets.set(key, bucket);
  return true;
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim().slice(0, 64);
  }
  return request.headers.get("x-real-ip")?.trim().slice(0, 64) || "local";
}

export async function readBoundedJson<T>(
  request: Request,
  maxBytes = 3_500_000
): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return {
      ok: false,
      status: 415,
      error: "Format permintaan harus berupa JSON.",
    };
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > maxBytes) {
    return {
      ok: false,
      status: 413,
      error: "Ukuran data melebihi batas aman.",
    };
  }

  const rawText = await request.text();
  if (rawText.length > maxBytes) {
    return {
      ok: false,
      status: 413,
      error: "Ukuran data melebihi batas aman.",
    };
  }

  try {
    return { ok: true, data: JSON.parse(rawText) as T };
  } catch {
    return {
      ok: false,
      status: 400,
      error: "Struktur JSON tidak valid.",
    };
  }
}
