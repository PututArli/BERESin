-- Skema Database PostgreSQL Supabase untuk BERESinHAHAY (Unlimited, Tanpa Sistem Kuota)

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  report_title TEXT NOT NULL DEFAULT 'Laporan Pengeluaran Kegiatan',
  chairperson_name TEXT NOT NULL DEFAULT '',
  treasurer_name TEXT NOT NULL DEFAULT '',
  initial_budget NUMERIC(15, 2) NOT NULL DEFAULT 0,
  categories JSONB NOT NULL DEFAULT '["Konsumsi", "Perlengkapan", "Transportasi", "Acara", "Lain-lain"]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS receipts (
  id UUID PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  reference_number TEXT NOT NULL,
  image_url TEXT NOT NULL,
  image_hash TEXT,
  extraction_mode TEXT NOT NULL DEFAULT 'detailed' CHECK (extraction_mode IN ('summary', 'detailed')),
  merchant_name TEXT NOT NULL DEFAULT '',
  transaction_date DATE,
  category TEXT NOT NULL DEFAULT 'Lain-lain',
  subtotal NUMERIC(15, 2) NOT NULL DEFAULT 0,
  tax_and_service NUMERIC(15, 2) NOT NULL DEFAULT 0,
  discount NUMERIC(15, 2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'Tunai',
  confidence_score FLOAT NOT NULL DEFAULT 1.0,
  warning_message TEXT,
  is_duplicate BOOLEAN NOT NULL DEFAULT FALSE,
  duplicate_of_ref TEXT,
  is_simulation BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'needs_review' CHECK (status IN ('processing', 'needs_review', 'verified', 'failed')),
  notes TEXT NOT NULL DEFAULT '',
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_receipts_workspace ON receipts(workspace_id, reference_number);
