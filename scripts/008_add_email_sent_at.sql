-- Add email_sent_at column to invoices table
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMP WITH TIME ZONE;

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_invoices_email_sent_at ON invoices(email_sent_at);
