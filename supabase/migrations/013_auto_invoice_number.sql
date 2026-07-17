-- Přidělování čísla faktury v databázi (per-uživatel), ne na klientovi.
--
-- Dřív se číslo počítalo v prohlížeči ze seznamu faktur (invoice-form.tsx).
-- To bylo náchylné na souběh (dvě záložky), na strop řádků API i na to, že
-- klient viděl jen část dat. Číslo teď přiděluje BEFORE INSERT trigger:
--   * atomicky v rámci transakce,
--   * serializovaně per (uživatel, rok) přes advisory lock,
--   * vždy nad kompletními daty uživatele (RLS = jen vlastní faktury).
--
-- Formát zůstává YYYY-NNN (od 3 číslic, dál přirozeně 4+). Trigger přidělí
-- číslo jen když není zadané, takže případné ruční zadání má přednost.
-- Předpokládá 012_fix_invoice_number_unique_per_user.sql (UNIQUE user_id+číslo).

CREATE OR REPLACE FUNCTION set_invoice_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_year text;
  v_next int;
BEGIN
  -- Ruční zadání respektujeme.
  IF NEW.invoice_number IS NOT NULL AND NEW.invoice_number <> '' THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id IS NULL THEN
    RAISE EXCEPTION 'Nelze přidělit číslo faktury bez user_id';
  END IF;

  v_year := to_char(now(), 'YYYY');

  -- Serializace souběžných insertů téhož uživatele a roku, aby nedostaly
  -- stejné číslo. Zámek se drží do konce transakce.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW.user_id::text || ':' || v_year, 0)
  );

  SELECT coalesce(
           max((regexp_match(invoice_number, '^' || v_year || '-(\d+)$'))[1]::int),
           0
         ) + 1
    INTO v_next
    FROM invoices
   WHERE user_id = NEW.user_id
     AND invoice_number ~ ('^' || v_year || '-\d+$');

  -- Doplní na minimálně 3 číslice, ale u 1000+ NIKDY neořízne (šířka se bere
  -- jako max(3, délka čísla)). Odpovídá chování padStart(3) na klientu.
  NEW.invoice_number :=
    v_year || '-' || lpad(v_next::text, greatest(3, length(v_next::text)), '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_invoice_number_trigger ON invoices;
CREATE TRIGGER set_invoice_number_trigger
  BEFORE INSERT ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION set_invoice_number();
