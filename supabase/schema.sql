-- Skema Database PostgreSQL / Supabase untuk BERESin
-- Jalankan pada SQL Editor Supabase saat mengaktifkan mode penyimpanan cloud penuh.

CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  full_name TEXT,
  quota_balance INT DEFAULT 5 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  initial_budget NUMERIC(15, 2) DEFAULT 0,
  chairperson_name TEXT,
  treasurer_name TEXT,
  categories JSONB DEFAULT '["Konsumsi", "Perlengkapan", "Transportasi", "Acara", "Lain-lain"]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS receipts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  reference_number TEXT NOT NULL,
  image_url TEXT NOT NULL,
  image_hash TEXT,
  extraction_mode TEXT DEFAULT 'detailed' CHECK (extraction_mode IN ('summary', 'detailed')),
  merchant_name TEXT,
  transaction_date DATE,
  category TEXT DEFAULT 'Lain-lain',
  subtotal NUMERIC(15, 2) DEFAULT 0,
  tax_and_service NUMERIC(15, 2) DEFAULT 0,
  discount NUMERIC(15, 2) DEFAULT 0,
  total_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
  payment_method TEXT DEFAULT 'Tunai',
  confidence_score FLOAT DEFAULT 1.0,
  warning_message TEXT,
  is_duplicate BOOLEAN DEFAULT FALSE,
  status TEXT DEFAULT 'processing' CHECK (status IN ('processing', 'needs_review', 'verified', 'failed')),
  notes TEXT,
  raw_ai_response JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS receipt_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  receipt_id UUID REFERENCES receipts(id) ON DELETE CASCADE NOT NULL,
  item_name TEXT NOT NULL,
  quantity FLOAT DEFAULT 1,
  unit_price NUMERIC(15, 2) DEFAULT 0,
  total_price NUMERIC(15, 2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS quota_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  package_name TEXT NOT NULL,
  quota_added INT NOT NULL,
  amount_paid NUMERIC(15, 2) NOT NULL,
  payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'expired')),
  external_payment_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security (RLS)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE quota_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Pengguna mengelola profil sendiri" ON profiles
  FOR ALL USING (auth.uid() = id);

CREATE POLICY "Pengguna mengelola proyek sendiri" ON projects
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Pengguna mengelola nota sendiri" ON receipts
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Pengguna mengelola item nota sendiri" ON receipt_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM receipts
      WHERE receipts.id = receipt_items.receipt_id
      AND receipts.user_id = auth.uid()
    )
  );

CREATE POLICY "Pengguna melihat transaksi kuota sendiri" ON quota_transactions
  FOR ALL USING (auth.uid() = user_id);
