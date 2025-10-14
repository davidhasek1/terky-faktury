-- Přidat sloupec is_business do customers tabulky
ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_business BOOLEAN DEFAULT false;

-- Aktualizovat existující zákazníky na false (nepodnikající subjekt)
UPDATE customers SET is_business = false WHERE is_business IS NULL;
