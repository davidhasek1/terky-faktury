-- Add "Název banky" (bank name) to company_details. Idempotent.
ALTER TABLE company_details
  ADD COLUMN IF NOT EXISTS bank_name TEXT;
