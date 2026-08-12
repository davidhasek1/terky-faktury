-- Oprava veřejných RLS politik, které pouštěly kohokoli ke všem datům.
--
-- Migrace 004, 006 a 007 zavedly politiky ve tvaru
--
--   USING (public_id IS NOT NULL)
--   USING (EXISTS (SELECT 1 FROM invoices WHERE ... AND public_id IS NOT NULL))
--
-- Sloupec public_id je ale NOT NULL u každé faktury, takže podmínka platila
-- vždy. Kdokoli s anon klíčem (ten je veřejný, je v prohlížeči) si tím mohl
-- přečíst VŠECHNY faktury, položky, zákazníky a firemní profily všech
-- uživatelů — ne jen tu jednu fakturu, na kterou dostal odkaz.
--
-- Politiky proto rušíme. Veřejné stažení faktury dál funguje, ale obsluhují ho
-- serverové routy /api/invoices/public/[publicId] a /api/invoices/download/[publicId],
-- které používají service-role klienta a filtrují na konkrétní public_id.
-- Neuhodnutelný token zůstává jedinou branou k dokladu.

DROP POLICY IF EXISTS "Anyone can view invoices by public_id" ON invoices;
DROP POLICY IF EXISTS "Anyone can view invoice items by public invoice" ON invoice_items;
DROP POLICY IF EXISTS "Anyone can view customers via public invoice" ON customers;
DROP POLICY IF EXISTS "Anyone can view company details for public invoices" ON company_details;
