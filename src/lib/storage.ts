import type { AppSettings, Project, Receipt } from "@/types/beresin";
import { findDuplicateReceipt, formatReferenceNumber, todayIsoDate } from "@/lib/format";
import { renderSimulatedReceiptDataUrl } from "@/lib/receipt-canvas";

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
  if (typeof window === "undefined") return "default-workspace";
  let existing = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
  if (!existing) {
    existing = `ws-${crypto.randomUUID()}`;
    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, existing);
  }
  return existing;
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

export async function deleteReceipt(receiptId: string): Promise<void> {
  const db = await openLocalDb();
  const tx = db.transaction("receipts", "readwrite");
  await txReq(tx.objectStore("receipts").delete(receiptId));

  try {
    await fetch(`/api/receipts?id=${encodeURIComponent(receiptId)}`, {
      method: "DELETE",
    });
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

export async function seedSampleReceipts(workspaceId: string): Promise<Receipt[]> {
  const dateBase = todayIsoDate();
  const r1Id = crypto.randomUUID();
  const r2Id = crypto.randomUUID();
  const r3Id = crypto.randomUUID();

  const img1 = renderSimulatedReceiptDataUrl({
    kind: "thermal",
    refLabel: "SIM-001",
    title: "INDOMARET POINT KAMPUS",
    subtitle: "Jl. Pendidikan No. 14",
    dateText: dateBase,
    lines: [
      { label: "ROTI SOBEK COKELAT", qty: "5 x 18.000", price: "90.000" },
      { label: "TEH PUCUK 350ML", qty: "12 x 4.500", price: "54.000" },
    ],
    footerRows: [
      { label: "TOTAL BAYAR (QRIS)", value: "Rp 144.000", bold: true },
    ],
  });

  const img2 = renderSimulatedReceiptDataUrl({
    kind: "warung",
    refLabel: "SIM-002",
    title: "Warung Makan Bu Siti",
    subtitle: "Nota Kontan Konsumsi",
    dateText: dateBase,
    lines: [
      { label: "Nasi Kotak Ayam Bakar", qty: "13 ktk x 25k", price: "325.000" },
      { label: "Air Mineral Gelas Dus", qty: "2 dus x 25k", price: "50.000" },
    ],
    footerRows: [
      { label: "Jumlah Nota Kontan", value: "Rp 375.000", bold: true },
    ],
  });

  const img3 = renderSimulatedReceiptDataUrl({
    kind: "qris",
    refLabel: "SIM-003",
    title: "BUKTI PEMBAYARAN QRIS",
    subtitle: "Penerima: Percetakan & ATK Jaya",
    dateText: dateBase,
    lines: [
      { label: "Cetak Spanduk 3x1m Outdoor", qty: "2 lbr x 75.000", price: "150.000" },
      { label: "Tali Lanyard Panitia", qty: "22 pcs x 5.000", price: "110.000" },
    ],
    footerRows: [
      { label: "TOTAL TRANSFER", value: "Rp 260.000", bold: true },
    ],
  });

  const baseRef1 = await nextReferenceNumber(workspaceId);
  const startNum = parseInt(baseRef1.replace(/\D/g, ""), 10) || 1;

  const samples: Receipt[] = [
    {
      id: r1Id,
      projectId: workspaceId,
      referenceNumber: formatReferenceNumber(startNum),
      imageUrl: img1,
      imageHash: `sim-hash-1-${r1Id}`,
      extractionMode: "detailed",
      merchantName: "[DATA SIMULASI] Indomaret Point Kampus",
      transactionDate: dateBase,
      category: "Konsumsi",
      subtotal: 144_000,
      taxAndService: 0,
      discount: 0,
      totalAmount: 144_000,
      paymentMethod: "QRIS",
      confidenceScore: 0.97,
      warningMessage: null,
      isDuplicate: false,
      duplicateOfRef: null,
      isSimulation: true,
      status: "verified",
      notes: "Konsumsi rapat panitia.",
      items: [
        {
          id: crypto.randomUUID(),
          receiptId: r1Id,
          itemName: "Roti Sobek Cokelat",
          quantity: 5,
          unitPrice: 18_000,
          totalPrice: 90_000,
        },
        {
          id: crypto.randomUUID(),
          receiptId: r1Id,
          itemName: "Teh Pucuk 350ml",
          quantity: 12,
          unitPrice: 4_500,
          totalPrice: 54_000,
        },
      ],
      createdAt: new Date().toISOString(),
    },
    {
      id: r2Id,
      projectId: workspaceId,
      referenceNumber: formatReferenceNumber(startNum + 1),
      imageUrl: img2,
      imageHash: `sim-hash-2-${r2Id}`,
      extractionMode: "detailed",
      merchantName: "[DATA SIMULASI] Warung Makan Bu Siti",
      transactionDate: dateBase,
      category: "Konsumsi",
      subtotal: 365_000,
      taxAndService: 0,
      discount: 0,
      totalAmount: 375_000,
      paymentMethod: "Tunai",
      confidenceScore: 0.7,
      warningMessage:
        "Contoh simulasi: baris ke-2 terbaca Rp 20.000 sehingga selisih Rp 10.000. Klik Cek / Edit untuk mencoba koreksi.",
      isDuplicate: false,
      duplicateOfRef: null,
      isSimulation: true,
      status: "needs_review",
      notes: "",
      items: [
        {
          id: crypto.randomUUID(),
          receiptId: r2Id,
          itemName: "Nasi Kotak Ayam Bakar",
          quantity: 13,
          unitPrice: 25_000,
          totalPrice: 325_000,
        },
        {
          id: crypto.randomUUID(),
          receiptId: r2Id,
          itemName: "Air Mineral Gelas Dus",
          quantity: 2,
          unitPrice: 20_000,
          totalPrice: 40_000,
        },
      ],
      createdAt: new Date().toISOString(),
    },
    {
      id: r3Id,
      projectId: workspaceId,
      referenceNumber: formatReferenceNumber(startNum + 2),
      imageUrl: img3,
      imageHash: `sim-hash-3-${r3Id}`,
      extractionMode: "detailed",
      merchantName: "[DATA SIMULASI] Percetakan & ATK Jaya",
      transactionDate: dateBase,
      category: "Perlengkapan",
      subtotal: 260_000,
      taxAndService: 0,
      discount: 0,
      totalAmount: 260_000,
      paymentMethod: "QRIS",
      confidenceScore: 0.95,
      warningMessage: null,
      isDuplicate: false,
      duplicateOfRef: null,
      isSimulation: true,
      status: "verified",
      notes: "Spanduk dan tanda pengenal.",
      items: [
        {
          id: crypto.randomUUID(),
          receiptId: r3Id,
          itemName: "Cetak Spanduk 3x1m Outdoor",
          quantity: 2,
          unitPrice: 75_000,
          totalPrice: 150_000,
        },
        {
          id: crypto.randomUUID(),
          receiptId: r3Id,
          itemName: "Tali Lanyard Panitia",
          quantity: 22,
          unitPrice: 5_000,
          totalPrice: 110_000,
        },
      ],
      createdAt: new Date().toISOString(),
    },
  ];

  const saved: Receipt[] = [];
  for (const s of samples) {
    saved.push(await saveReceipt(s));
  }
  return saved;
}
