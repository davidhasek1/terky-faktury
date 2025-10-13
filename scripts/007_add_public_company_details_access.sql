-- Add RLS policy to allow public access to company_details for invoices with public_id
-- This allows anonymous users to view company details when accessing invoices via public link

CREATE POLICY "Anyone can view company details for public invoices" ON company_details
  FOR SELECT USING (
    user_id IN (
      SELECT user_id FROM invoices WHERE public_id IS NOT NULL
    )
  );
