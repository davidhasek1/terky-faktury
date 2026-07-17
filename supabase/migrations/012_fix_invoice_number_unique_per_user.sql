-- Oprava: čísla faktur jsou per-uživatel, ale UNIQUE bylo globální.
--
-- Sloupec invoice_number byl v 001_create_tables.sql založen jako
-- `TEXT NOT NULL UNIQUE`, což vytvořilo unikátní index přes VŠECHNY uživatele.
-- Každý uživatel si ale vede vlastní řadu YYYY-NNN. Číslo vystavené jedním
-- uživatelem (např. 2026-101) tak natrvalo zablokovalo stejné číslo všem
-- ostatním -> insert padal na "duplicate key value violates unique constraint".
--
-- Řešení: zrušit globální unikátnost a nahradit ji unikátností v rámci
-- uživatele (user_id, invoice_number). Klientské generování čísla
-- (components/invoices/invoice-form.tsx) je pak už správné, protože pracuje
-- jen s fakturami přihlášeného uživatele.

-- 1) Zrušit původní globální UNIQUE. Výchozí název je invoices_invoice_number_key,
--    ale pro jistotu najdeme a zrušíme jakýkoli jednosloupcový UNIQUE nad
--    invoice_number (kdyby byl někdy přejmenován), ať nezůstane viset.
DO $$
DECLARE
  con_name text;
BEGIN
  FOR con_name IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_attribute att
      ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
    WHERE rel.relname = 'invoices'
      AND con.contype = 'u'
      AND array_length(con.conkey, 1) = 1
      AND att.attname = 'invoice_number'
  LOOP
    EXECUTE format('ALTER TABLE invoices DROP CONSTRAINT %I', con_name);
  END LOOP;
END $$;

-- 2) Unikátnost čísla faktury v rámci jednoho uživatele.
--    NULL user_id (legacy řádky z doby před 004) se v UNIQUE považují za
--    různé, takže staré řádky bez uživatele nikoho neblokují.
ALTER TABLE invoices
  ADD CONSTRAINT invoices_user_id_invoice_number_key
  UNIQUE (user_id, invoice_number);
