export type ReceiptStatus = "processing" | "needs_review" | "verified" | "failed";

export type PaymentMethod = "Tunai" | "QRIS" | "Transfer" | "Kartu" | "Lainnya";

export type ExtractionMode = "summary" | "detailed";

export type PdfGridDensity = "2x2" | "2x3";

export interface Project {
  id: string;
  title: string;
  description: string;
  initialBudget: number;
  chairpersonName: string;
  treasurerName: string;
  categories: string[];
  createdAt: string;
}

export interface ReceiptItem {
  id: string;
  receiptId: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface Receipt {
  id: string;
  projectId: string;
  referenceNumber: string;
  imageUrl: string;
  imageHash: string;
  extractionMode: ExtractionMode;
  merchantName: string;
  transactionDate: string | null;
  category: string;
  subtotal: number;
  taxAndService: number;
  discount: number;
  totalAmount: number;
  paymentMethod: PaymentMethod;
  confidenceScore: number;
  warningMessage: string | null;
  isDuplicate: boolean;
  duplicateOfRef: string | null;
  status: ReceiptStatus;
  notes: string;
  items: ReceiptItem[];
  createdAt: string;
}

export interface OcrExtractedPayload {
  merchant_name: string;
  transaction_date: string | null;
  category: string;
  payment_method?: PaymentMethod;
  subtotal?: number;
  tax_and_service?: number;
  discount?: number;
  total_amount: number;
  confidence_score: number;
  warning_message?: string | null;
  items: Array<{
    item_name: string;
    quantity: number;
    unit_price: number;
    total_price: number;
  }>;
}

export interface AppSettings {
  theme: "light" | "dark";
  geminiApiKey: string;
  defaultPdfGrid: PdfGridDensity;
}

export interface CompressedPhotoItem {
  id: string;
  sourceFile?: File;
  originalName: string;
  outputName: string;
  originalBytes: number;
  compressedBytes: number;
  previewUrl: string;
  blob: Blob;
  width: number;
  height: number;
}
