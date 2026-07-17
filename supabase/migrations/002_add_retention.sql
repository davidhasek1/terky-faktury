-- Přidání sloupce pro retention do tabulky invoices
ALTER TABLE invoices
ADD COLUMN retention_rate DECIMAL(5, 2) DEFAULT 0,
ADD COLUMN retention_amount DECIMAL(10, 2) DEFAULT 0;

-- Aktualizace existujících faktur
UPDATE invoices
SET retention_rate = 0, retention_amount = 0
WHERE retention_rate IS NULL;
