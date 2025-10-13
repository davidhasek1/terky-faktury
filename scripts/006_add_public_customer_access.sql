-- Add public access policy for customers when accessed via invoice public_id
DROP POLICY IF EXISTS "Anyone can view customers via public invoice" ON customers;

CREATE POLICY "Anyone can view customers via public invoice" ON customers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM invoices 
      WHERE invoices.customer_id = customers.id 
      AND invoices.public_id IS NOT NULL
    )
  );
