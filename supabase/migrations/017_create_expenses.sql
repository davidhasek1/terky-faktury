-- Náklady (výdaje podnikání) pro výkaz za období a podklady k přiznání IVA.
-- Základ a sazbu zadává uživatel, IVA a celkem dopočítá aplikace
-- (lib/services/expense-totals.ts) a ukládají se, aby výkaz nemusel počítat znovu.

CREATE TYPE expense_category AS ENUM (
  'material',
  'transport',
  'phone_internet',
  'equipment',
  'fees',
  'insurance',
  'social_security',
  'other'
);

CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expense_date DATE NOT NULL,
  description TEXT NOT NULL,
  supplier TEXT,
  category expense_category NOT NULL DEFAULT 'other',
  subtotal DECIMAL(12, 2) NOT NULL CHECK (subtotal >= 0),
  tax_rate DECIMAL(5, 2) NOT NULL DEFAULT 21 CHECK (tax_rate >= 0 AND tax_rate <= 100),
  tax_amount DECIMAL(12, 2) NOT NULL CHECK (tax_amount >= 0),
  total DECIMAL(12, 2) NOT NULL CHECK (total >= 0),
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_user_date
  ON expenses (user_id, expense_date DESC);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own expenses" ON expenses;
DROP POLICY IF EXISTS "Users can insert their own expenses" ON expenses;
DROP POLICY IF EXISTS "Users can update their own expenses" ON expenses;
DROP POLICY IF EXISTS "Users can delete their own expenses" ON expenses;

CREATE POLICY "Users can view their own expenses" ON expenses
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own expenses" ON expenses
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own expenses" ON expenses
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own expenses" ON expenses
  FOR DELETE USING (auth.uid() = user_id);

-- Funkce update_updated_at_column je z 001_create_tables.sql.
DROP TRIGGER IF EXISTS update_expenses_updated_at ON expenses;
CREATE TRIGGER update_expenses_updated_at
  BEFORE UPDATE ON expenses
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
