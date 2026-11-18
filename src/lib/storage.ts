import type { AppSettings, Project, Receipt } from "@/types/beresin";
import { findDuplicateReceipt, formatReferenceNumber } from "@/lib/format";
import { isValidWorkspaceId } from "@/lib/security";

const DB_NAME = "beresinhahay_v2";
const DB_VERSION = 1;
const WORKSPACE_STORAGE_KEY = "beresinhahay_workspace_id";

const DEFAULT_CATEGORIES = [
  "Konsumsi",
  "Perlengkapan",
  "Transportasi",
  "Acara",
  "Lain-lain",
];

export function getOrCreateWorkspaceId(): string {
  if (typeof window === "undefined") {
    return "ws-00000000-0000-4000-8000-000000000000";
  }
  const existing = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
  if (isValidWorkspaceId(existing)) {
    return existing;
  }
  const generated = `ws-${crypto.randomUUID()}`;
  window.localStorage.setItem(WORKSPACE_STORAGE_KEY, generated);
  return generated;
}

function openLocalDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB hanya tersedia di peramban."));
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
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Gagal membuka penyimpanan lokal."));
  });
}

function txReq<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Operasi penyimpanan gagal."));
  });
}

export async function getAppSettings(): Promise<AppSettings> {
  const db = await openLocalDb();
  const tx = db.transaction("settings", "readonly");
  const record = await txReq<{ key: string; value: AppSettings } | undefined>(
    tx.objectStore("settings").get("app_settings")
  );
  return (
    record?.value ?? {
      theme: "light",
      geminiApiKey: "",
      defaultPdfGrid: "2x2",
    }
  );
}

export async function saveAppSettings(next: AppSettings): Promise<AppSettings> {
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

// Syncs with Supabase PostgreSQL first when online, falling back seamlessly to IndexedDB.
export async function loadActiveWorkspace(): Promise<{
  project: Project;
  receipts: Receipt[];
  cloudConnected: boolean;
}> {
  const workspaceId = getOrCreateWorkspaceId();

  try {
    const resp = await fetch(
      `/api/workspace?workspaceId=${encodeURIComponent(workspaceId)}`,
      { cache: "no-store" }
    );
    if (resp.ok) {
      const json = await resp.json();
      if (json.cloudEnabled && json.project) {
        const db = await openLocalDb();
        const tx = db.transaction(["projects", "receipts"], "readwrite");
        await txReq(tx.objectStore("projects").put(json.project));
        const receiptStore = tx.objectStore("receipts");
        for (const r of json.receipts as Receipt[]) {
          await txReq(receiptStore.put(r));
        }
        return {
          project: json.project as Project,
          receipts: json.receipts as Receipt[],
          cloudConnected: true,
        };
      }
    }
  } catch {
    // Fall back to local IndexedDB when offline
  }

  const [project, receipts] = await Promise.all([
    getLocalWorkspaceProject(workspaceId),
    listLocalReceipts(workspaceId),
  ]);
  return { project, receipts, cloudConnected: false };
}

export async function updateWorkspaceMeta(project: Project): Promise<Project> {
  const db = await openLocalDb();
  const tx = db.transaction("projects", "readwrite");
  await txReq(tx.objectStore("projects").put(project));

  try {
    await fetch("/api/workspace", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...project, workspaceId: project.id }),
    });
  } catch {
    // Keep local state when network is unavailable
  }

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

  try {
    await fetch("/api/receipts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId: finalized.projectId,
        receipt: finalized,
      }),
    });
  } catch {
    // Keep local receipt if cloud sync temporarily fails
  }

  return finalized;
}

export async function deleteReceipt(
  receiptId: string,
  workspaceId: string
): Promise<void> {
  const db = await openLocalDb();
  const tx = db.transaction("receipts", "readwrite");
  await txReq(tx.objectStore("receipts").delete(receiptId));

  try {
    await fetch(
      `/api/receipts?id=${encodeURIComponent(receiptId)}&workspaceId=${encodeURIComponent(
        workspaceId
      )}`,
      { method: "DELETE" }
    );
  } catch {
    // Ignore network error after local delete
  }
}

export async function clearAllWorkspaceReceipts(workspaceId: string): Promise<void> {
  const existing = await listLocalReceipts(workspaceId);
  const db = await openLocalDb();
  const tx = db.transaction("receipts", "readwrite");
  const store = tx.objectStore("receipts");
  for (const r of existing) {
    await txReq(store.delete(r.id));
  }

  try {
    await fetch(
      `/api/receipts?workspaceId=${encodeURIComponent(workspaceId)}`,
      { method: "DELETE" }
    );
  } catch {
    // Ignore network error after local clear
  }
}
