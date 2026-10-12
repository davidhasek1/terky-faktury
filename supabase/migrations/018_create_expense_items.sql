-- Položky nákladu: jeden doklad (např. účtenka z Mercadony) může mít víc
-- sazeb IVA, takže se rozpadá na položky se základem a sazbou.
-- Doklad v `expenses` drží jen součty položek (subtotal, tax_amount, total),
-- které počítá aplikace (lib/services/expense-totals.ts).

CREATE TABLE IF NOT EXISTS expense_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  position SMALLINT NOT NULL DEFAULT 0,
  subtotal DECIMAL(12, 2) NOT NULL CHECK (subtotal >= 0),
  tax_rate DECIMAL(5, 2) NOT NULL CHECK (tax_rate >= 0 AND tax_rate <= 100),
  tax_amount DECIMAL(12, 2) NOT NULL CHECK (tax_amount >= 0),
  total DECIMAL(12, 2) NOT NULL CHECK (total >= 0)
);

CREATE INDEX IF NOT EXISTS idx_expense_items_expense_id
  ON expense_items (expense_id, position);

ALTER TABLE expense_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own expense items" ON expense_items;
DROP POLICY IF EXISTS "Users can insert their own expense items" ON expense_items;
DROP POLICY IF EXISTS "Users can update their own expense items" ON expense_items;
DROP POLICY IF EXISTS "Users can delete their own expense items" ON expense_items;

-- Vlastnictví se odvozuje od dokladu, stejně jako u activity_services.
CREATE POLICY "Users can view their own expense items" ON expense_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM expenses WHERE expenses.id = expense_items.expense_id AND expenses.user_id = auth.uid())
  );

CREATE POLICY "Users can insert their own expense items" ON expense_items
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM expenses WHERE expenses.id = expense_items.expense_id AND expenses.user_id = auth.uid())
  );

CREATE POLICY "Users can update their own expense items" ON expense_items
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM expenses WHERE expenses.id = expense_items.expense_id AND expenses.user_id = auth.uid())
  );

CREATE POLICY "Users can delete their own expense items" ON expense_items
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM expenses WHERE expenses.id = expense_items.expense_id AND expenses.user_id = auth.uid())
  );

-- Každý dosavadní náklad dostane jednu položku ze svého základu a sazby.
INSERT INTO expense_items (expense_id, position, subtotal, tax_rate, tax_amount, total)
SELECT e.id, 0, e.subtotal, COALESCE(e.tax_rate, 0), e.tax_amount, e.total
FROM expenses e
WHERE NOT EXISTS (SELECT 1 FROM expense_items i WHERE i.expense_id = e.id);

-- Sazba patří položce, ne dokladu. Sloupec se zatím jen uvolní, aby kód
-- nasazený před touto migrací dál fungoval; odstraní se v další migraci.
ALTER TABLE expenses ALTER COLUMN tax_rate DROP NOT NULL;
ALTER TABLE expenses ALTER COLUMN tax_rate DROP DEFAULT;
