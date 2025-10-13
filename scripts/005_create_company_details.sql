-- Create company_details table for storing issuer information
CREATE TABLE IF NOT EXISTS company_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  nie TEXT,
  nif TEXT,
  street TEXT,
  city TEXT,
  postal_code TEXT,
  country TEXT DEFAULT 'España',
  email TEXT,
  phone TEXT,
  bank_account TEXT,
  iban TEXT,
  swift_bic TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE company_details ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own company details" ON company_details
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own company details" ON company_details
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own company details" ON company_details
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own company details" ON company_details
  FOR DELETE USING (auth.uid() = user_id);
