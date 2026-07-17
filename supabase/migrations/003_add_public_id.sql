-- Přidání public_id sloupce pro veřejné stahování faktur
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS public_id UUID DEFAULT gen_random_uuid() UNIQUE;

-- Vygenerovat public_id pro existující faktury
UPDATE invoices SET public_id = gen_random_uuid() WHERE public_id IS NULL;

-- Nastavit NOT NULL constraint
ALTER TABLE invoices ALTER COLUMN public_id SET NOT NULL;
