import type { AppSettings, Project, Receipt } from "@/types/beresin";
import { findDuplicateReceipt, formatReferenceNumber } from "@/lib/format";
import { isValidWorkspaceId } from "@/lib/security";

const DB_NAME = "beresinhahay_v2";
const DB_VERSION = 1;
const WORKSPACE_STORAGE_KEY = "beresin_workspace_id";
const LEGACY_WORKSPACE_KEY = "beresinhahay_workspace_id";

const DEFAULT_CATEGORIES = [
  "Konsumsi",
  "Perlengkapan",
  "Transportasi",
  "Acara",
  "Lain-lain",
];

let cachedDbPromise: Promise<IDBDatabase> | null = null;

export function getOrCreateWorkspaceId(): string {
  if (typeof window === "undefined") {
    return "ws-00000000-0000-4000-8000-000000000000";
  }
  const existing =
    window.localStorage.getItem(WORKSPACE_STORAGE_KEY) ??
    window.localStorage.getItem(LEGACY_WORKSPACE_KEY);
  if (isValidWorkspaceId(existing)) {
    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, existing);
    return existing;
  }
  const generated = `ws-${crypto.randomUUID()}`;
  window.localStorage.setItem(WORKSPACE_STORAGE_KEY, generated);
  return generated;
}

function openLocalDb(): Promise<IDBDatabase> {
  if (cachedDbPromise) return cachedDbPromise;

  cachedDbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      cachedDbPromise = null;
      reject(new Error("Penyimpanan lokal hanya tersedia di peramban."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("projects")) {
        db.createObjectStore("projects", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("receipts")) {
        const store = db.createObjectStore("receipts", { keyPath: "id" });
        store.createIndex("by_project", "projectId", { unique: false });
      }
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "key" });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        cachedDbPromise = null;
      };
      resolve(db);
    };
    request.onerror = () => {
      cachedDbPromise = null;
      reject(request.error ?? new Error("Gagal membuka penyimpanan lokal."));
    };
  });

  return cachedDbPromise;
}

function txReq<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Operasi penyimpanan gagal."));
  });
}

export async function getAppSettings(): Promise<AppSettings> {
  const savedTheme =
    typeof window !== "undefined"
      ? window.localStorage.getItem("beresin_theme")
      : null;

  const db = await openLocalDb();
  const tx = db.transaction("settings", "readonly");
  const record = await txReq<{ key: string; value: AppSettings } | undefined>(
    tx.objectStore("settings").get("app_settings")
  );
  const base = record?.value ?? {
    theme: "light",
    geminiApiKey: "",
    defaultPdfGrid: "2x2",
  };

  if (savedTheme === "dark" || savedTheme === "light") {
    return { ...base, theme: savedTheme };
  }
  return base;
}

export async function saveAppSettings(next: AppSettings): Promise<AppSettings> {
  if (typeof window !== "undefined") {
    window.localStorage.setItem("beresin_theme", next.theme);
  }
  const db = await openLocalDb();
  const tx = db.transaction("settings", "readwrite");
  await txReq(tx.objectStore("settings").put({ key: "app_settings", value: next }));
  return next;
}

async function getLocalWorkspaceProject(workspaceId: string): Promise<Project> {
  const db = await openLocalDb();
  const tx = db.transaction("projects", "readwrite");
  const store = tx.objectStore("projects");
  const existing = await txReq<Project | undefined>(store.get(workspaceId));
  if (existing) return existing;

  const created: Project = {
    id: workspaceId,
    title: "Laporan Pengeluaran Kegiatan",
    description: "",
    initialBudget: 0,
    chairpersonName: "",
    treasurerName: "",
    categories: DEFAULT_CATEGORIES,
    createdAt: new Date().toISOString(),
  };
  await txReq(store.put(created));
  return created;
}

async function listLocalReceipts(workspaceId: string): Promise<Receipt[]> {
  const db = await openLocalDb();
  const tx = db.transaction("receipts", "readonly");
  const rows = await txReq<Receipt[]>(
    tx.objectStore("receipts").index("by_project").getAll(workspaceId)
  );
  return rows.sort((a, b) => a.referenceNumber.localeCompare(b.referenceNumber));
}

// Reads IndexedDB immediately (< 5 ms) so buttons and page load never wait on cloud network latency.
export async function loadLocalWorkspaceFast(): Promise<{
  project: Project;
  receipts: Receipt[];
}> {
  const workspaceId = getOrCreateWorkspaceId();
  const [project, receipts] = await Promise.all([
    getLocalWorkspaceProject(workspaceId),
    listLocalReceipts(workspaceId),
  ]);
  return { project, receipts };
}

// Reconciles with Supabase in the background without blocking user interactions.
export async function syncWorkspaceFromCloud(): Promise<{
  project: Project;
  receipts: Receipt[];
  cloudConnected: boolean;
} | null> {
  const workspaceId = getOrCreateWorkspaceId();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6500);

  try {
    const resp = await fetch(
      `/api/workspace?workspaceId=${encodeURIComponent(workspaceId)}`,
      { cache: "no-store", signal: controller.signal }
    );
    if (!resp.ok) return null;

    const json = await resp.json();
    if (!json.cloudEnabled || !json.project) return null;

    const cloudProject = json.project as Project;
    const cloudReceipts = (json.receipts as Receipt[]) ?? [];

    const db = await openLocalDb();
    const localReceipts = await listLocalReceipts(workspaceId);
    const mergedMap = new Map<string, Receipt>();
    for (const cr of cloudReceipts) {
      mergedMap.set(cr.id, cr);
    }
    for (const lr of localReceipts) {
      if (!mergedMap.has(lr.id)) {
        mergedMap.set(lr.id, lr);
      }
    }
    const mergedReceipts = Array.from(mergedMap.values()).sort((a, b) =>
      a.referenceNumber.localeCompare(b.referenceNumber)
    );

    const tx = db.transaction(["projects", "receipts"], "readwrite");
    await txReq(tx.objectStore("projects").put(cloudProject));
    const receiptStore = tx.objectStore("receipts");
    for (const r of mergedReceipts) {
      await txReq(receiptStore.put(r));
    }

    return {
      project: cloudProject,
      receipts: mergedReceipts,
      cloudConnected: true,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function updateWorkspaceMeta(project: Project): Promise<Project> {
  const db = await openLocalDb();
  const tx = db.transaction("projects", "readwrite");
  await txReq(tx.objectStore("projects").put(project));

  // Sync metadata to Supabase in background so typing and downloads stay instant.
  void fetch("/api/workspace", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...project, workspaceId: project.id }),
    keepalive: true,
  }).catch(() => {});

  return project;
}

export async function nextReferenceNumber(workspaceId: string): Promise<string> {
  const existing = await listLocalReceipts(workspaceId);
  let maxNum = 0;
  for (const r of existing) {
    const match = r.referenceNumber.match(/(\d+)$/);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > maxNum) maxNum = n;
    }
  }
  return formatReferenceNumber(maxNum + 1);
}

export async function saveReceipt(receipt: Receipt): Promise<Receipt> {
  const siblings = await listLocalReceipts(receipt.projectId);
  const dupRef = findDuplicateReceipt(
    {
      id: receipt.id,
      imageHash: receipt.imageHash,
      transactionDate: receipt.transactionDate,
      totalAmount: receipt.totalAmount,
      merchantName: receipt.merchantName,
    },
    siblings
  );
  const finalized: Receipt = {
    ...receipt,
    isDuplicate: Boolean(dupRef),
    duplicateOfRef: dupRef,
  };

  const db = await openLocalDb();
  const tx = db.transaction("receipts", "readwrite");
  await txReq(tx.objectStore("receipts").put(finalized));

  // Push receipt to Supabase asynchronously so saving/closing modal never lags.
  void fetch("/api/receipts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workspaceId: finalized.projectId,
      receipt: finalized,
    }),
  }).catch(() => {});

  return finalized;
}

export async function deleteReceipt(
  receiptId: string,
  workspaceId: string
): Promise<void> {
  const db = await openLocalDb();
  const tx = db.transaction("receipts", "readwrite");
  await txReq(tx.objectStore("receipts").delete(receiptId));

  void fetch(
    `/api/receipts?id=${encodeURIComponent(receiptId)}&workspaceId=${encodeURIComponent(
      workspaceId
    )}`,
    { method: "DELETE", keepalive: true }
  ).catch(() => {});
}

export async function clearAllWorkspaceReceipts(workspaceId: string): Promise<void> {
  const existing = await listLocalReceipts(workspaceId);
  const db = await openLocalDb();
  const tx = db.transaction("receipts", "readwrite");
  const store = tx.objectStore("receipts");
  for (const r of existing) {
    await txReq(store.delete(r.id));
  }

  void fetch(
    `/api/receipts?workspaceId=${encodeURIComponent(workspaceId)}`,
    { method: "DELETE", keepalive: true }
  ).catch(() => {});
}
