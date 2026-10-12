# Náklady a výkaz za období — návrh

Datum: 2026-10-12
Stav: schváleno k sepsání plánu

## Zadání

1. Přehled všech vystavených faktur za zvolené období: číslo faktury, datum,
   částka a rozpad částky na základ a daně.
2. Nová sekce **Náklady**, kde si uživatelka zadává jednotlivé náklady — kdy
   a za kolik je zrealizovala.

Účel: obojí — vlastní přehled (kolik jsem vyfakturovala a utratila) i podklad
pro účetní / čtvrtletní přiznání IVA (modelo 303) a IRPF (modelo 130).

Rozhodnuto při návrhu:

- **Výkaz je samostatná stránka `/report`**, ne rozšíření `/invoices`.
  Ukazuje faktury i náklady za stejné období a jejich společný souhrn.
- **Náklad má rozpad na základ a IVA.** Zadává se základ a sazba, IVA
  a celkem se dopočítají (stejně jako u faktury). Bez toho by výkaz nemohl
  spočítat IVA k odvodu.
- **Kategorie nákladů jsou pevný seznam** (enum v DB), ne volný text —
  aby šel souhrn rozpadnout podle kategorií bez překlepů.
- **Faktury se do období řadí podle `issue_date`** a patří tam všechny
  vystavené, zaplacené i nezaplacené. Španělská IVA se odvádí podle vystavení
  (criterio de devengo), ne podle úhrady. Stav úhrady je ve výkazu vidět
  jako sloupec.
- **CSV export ano**, dva soubory (faktury, náklady). Formát pro Excel
  v české/španělské lokalizaci: oddělovač `;`, desetinná čárka, UTF-8 BOM.
- **Žádné přílohy (fotky účtenek)** — mimo rozsah, přidá se případně později.

## Datový model

### Migrace `supabase/migrations/017_create_expenses.sql`

```sql
CREATE TYPE expense_category AS ENUM (
  'material', 'transport', 'phone_internet', 'equipment',
  'fees', 'insurance', 'social_security', 'other'
);

CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expense_date DATE NOT NULL,
  description TEXT NOT NULL,
  supplier TEXT,
  category expense_category NOT NULL DEFAULT 'other',
  subtotal DECIMAL(12, 2) NOT NULL,
  tax_rate DECIMAL(5, 2) NOT NULL DEFAULT 21,
  tax_amount DECIMAL(12, 2) NOT NULL,
  total DECIMAL(12, 2) NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_user_date ON expenses (user_id, expense_date DESC);
```

RLS: čtyři politiky `auth.uid() = user_id` (SELECT/INSERT/UPDATE/DELETE),
trigger `update_updated_at_column` jako u `activities`. Žádný veřejný přístup.

Kategorie a jejich české popisky:

| Hodnota | Popisek |
| --- | --- |
| `material` | Materiál a čisticí prostředky |
| `transport` | Doprava a pohonné hmoty |
| `phone_internet` | Telefon a internet |
| `equipment` | Vybavení |
| `fees` | Služby a poplatky (gestor, banka) |
| `insurance` | Pojištění |
| `social_security` | Odvody (cuota autónomo) |
| `other` | Ostatní |

Popisky žijí v jednom souboru (`components/expenses/category-labels.ts`)
a sdílí je UI, MCP popis schématu i CSV.

`lib/types.ts` dostane `Expense` a `ExpenseCategory`.

## Servisní vrstva

- `lib/services/expense-totals.ts` — čistá funkce
  `calculateExpenseTotals({ subtotal, tax_rate }) → { taxAmount, total }`
  v setinách (`lib/money.ts`). Sdílí ji živý náhled ve formuláři, uložení
  i MCP souhrn návrhu.
- `lib/services/expenses.ts` — `listExpenses(ctx, { date_from, date_to,
  category, limit, offset })`, `getExpense`, `createExpense`,
  `updateExpense`, `deleteExpense`. Chyby přes `ServiceError`
  (`EXPENSE_NOT_FOUND`).
- `lib/services/period-report.ts` — `getPeriodReport(ctx, { from, to })`
  vrací:
  - `invoices`: číslo, datum vystavení, zákazník, základ, IVA, retención,
    celkem, zaplaceno ano/ne — seřazené podle data vystavení,
  - `expenses`: seřazené podle data,
  - `totals`: `income.subtotal / tax / retention / total`,
    `expenses.subtotal / tax / total`, `vatBalance = income.tax − expenses.tax`
    (IVA k odvodu, záporná = nárok na vrácení),
    `profit = income.subtotal − expenses.subtotal`,
    `expensesByCategory` (základ + celkem za každou použitou kategorii).
  - Součty se počítají v setinách, ne sčítáním `number`.
- `lib/services/report-period.ts` — čistá logika období: z předvolby
  (`month` / `quarter` / `year` + rok + pořadí) udělá `{ from, to }`,
  výchozí je aktuální čtvrtletí; validuje `from <= to`.
- `lib/services/report-csv.ts` — `invoicesCsv(report)` a `expensesCsv(report)`
  → řetězec (BOM, `;`, desetinná čárka, uvozovky podle RFC 4180). Poslední
  řádek je součet.

Validace v `lib/validation/expenses.ts` (zod schéma vstupu nákladu a filtrů)
a `lib/validation/report.ts` (`from`/`to` ve tvaru `RRRR-MM-DD`).

## UI

Navigace (`components/app-shell/nav-items.ts`): za „Aktivity“ přibude
**Náklady** (`/expenses`, ikona `Receipt`) a **Výkaz** (`/report`, ikona
`ChartColumn`).

### Náklady

| Route | Obsah |
| --- | --- |
| `/expenses` | Výběr období, stat tiles (základ, IVA, celkem za období), tabulka nákladů (datum, popis, dodavatel, kategorie, základ, IVA, celkem, akce). Prázdný stav s tlačítkem „Nový náklad“. |
| `/expenses/new` | Formulář nákladu |
| `/expenses/[id]/edit` | Úprava nákladu |

Formulář (`components/expenses/expense-form.tsx`) na sdíleném form fieldu
a v kartě se sekční lištou jako ostatní formuláře: datum (výchozí dnes),
popis, dodavatel, kategorie (select), základ, sazba IVA (select 21/10/4/0),
poznámka; pod tím živý náhled IVA a celkem. Ukládá přes `lib/services/expenses.ts`
z browser contextu. Akce v řádku: upravit, smazat (s potvrzením).

### Výkaz

`/report` — serverová stránka:

- Výběr období (`components/report/period-picker.tsx`, klientská komponenta):
  přepínač Měsíc / Čtvrtletí / Rok / Vlastní, šipky na předchozí/další období,
  u „Vlastní“ dvě data. Stav je v URL `?from=RRRR-MM-DD&to=RRRR-MM-DD`.
  Stejný picker používá `/expenses`.
- Stat tiles: Příjmy (základ), IVA vybraná, IVA z nákladů, IVA k odvodu,
  Retención, Náklady (základ), Zisk (základ − náklady).
- Tabulka faktur: číslo (odkaz na detail), datum vystavení, zákazník, základ,
  IVA, retención, celkem, stav (badge). Patička se součty.
- Tabulka nákladů: datum, popis, kategorie, základ, IVA, celkem. Patička se
  součty. Pod ní rozpad podle kategorií.
- Tlačítka „Export faktur (CSV)“ a „Export nákladů (CSV)“.

Barvy jen ze sémantických tokenů; žádné `dark:` třídy; texty česky.

### CSV routy

`app/api/report/invoices/route.ts` a `app/api/report/expenses/route.ts`,
`GET ?from&to`. Cookie session přes `server-context`, za přihlášením (nejsou
v `PUBLIC_PATH_PREFIXES`). Odpověď `text/csv; charset=utf-8`,
`Content-Disposition: attachment; filename="faktury-2026-07-01-2026-09-30.csv"`.
Neplatné období → 400.

## MCP

Nový soubor `lib/mcp/tools/expenses.ts`, registrace v `lib/mcp/server.ts`:

| Nástroj | Typ | Oprávnění | Účel |
| --- | --- | --- | --- |
| `list_expenses` | čtení | `invoices:read` | Náklady s filtrem období a kategorie. |
| `get_expense` | čtení | `invoices:read` | Detail nákladu. |
| `get_period_report` | čtení | `invoices:read` | Výkaz za období: faktury s rozpadem, náklady, souhrn IVA a zisku. |
| `create_expense` | zápis | `invoices:write` | Zaeviduje náklad. Dvoufázový. |
| `update_expense` | zápis | `invoices:write` | Upraví náklad. Dvoufázový. |
| `delete_expense` | **destruktivní** | `invoices:write` | Smaže náklad. Dvoufázový. |

Zápisy přes `twoPhase()`, `confirmation_token` volitelný; návrh ukazuje
dopočtenou IVA a celkem z `expense-totals.ts`.

Nevystavuje se: **CSV export** — je to stažení souboru pro člověka, model
dostane stejná data z `get_period_report`. Zapíše se do tabulky „not
exposed“ v `docs/MCP.md` a do PRD.

## Testy

- `tests/services/expense-totals.test.ts` — zaokrouhlení IVA, sazba 0.
- `tests/services/report-period.test.ts` — měsíc/čtvrtletí/rok, přelom roku,
  únor v přestupném roce, `from > to` odmítnuto.
- `tests/services/period-report.test.ts` — nad fake Supabase: faktury na
  hranicích období zahrnuté, mimo období ne; cizí uživatel nevidí nic (RLS);
  součty, `vatBalance`, `profit`, rozpad podle kategorií.
- `tests/services/expenses.test.ts` — CRUD, `EXPENSE_NOT_FOUND`.
- `tests/services/report-csv.test.ts` — BOM, `;`, desetinná čárka, escapování
  uvozovek a středníků v popisu.
- `tests/mcp/two-phase.test.ts` — obě fáze `create_expense`, `update_expense`,
  `delete_expense`.
- `tests/mcp/protocol.test.ts` — nové názvy nástrojů v seznamu.
- `tests/design/*` musí dál projít (tokeny, status barvy, nav).

Fake Supabase (`tests/helpers/fake-supabase.ts`) se případně rozšíří
o tabulku `expenses` a operátory, které služba použije.

## Dokumentace

- `docs/MCP.md` — sekce Náklady a Výkaz v tabulce nástrojů, řádek „CSV export“
  v tabulce nevystavených.
- `docs/prd/mcp-integration.md` — zmínka o nových nástrojích a nevystaveném CSV.
- `DEPLOYMENT.md` — smoke test: založit náklad, otevřít výkaz za čtvrtletí,
  stáhnout CSV.
