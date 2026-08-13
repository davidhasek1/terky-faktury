# Redesign: dashboard se sidebarem, tokeny a UI vrstva

Datum: 2026-08-13
Stav: schváleno k implementaci

## Zadání

Udělat z aplikace dashboard se svislým menu v postranním panelu, zavést
design tokeny a vyčlenit UI vrstvu s jasnou hranicí, a celkově zvednout
vizuální úroveň.

Rozhodnuto při návrhu:

- **UI vrstva zůstává interní.** Žádný pnpm workspace, žádné `packages/ui`.
  Repo zůstává jednou Next.js aplikací; hranice se vynutí strukturou adresářů
  a dvouúrovňovými tokeny, ne hranicí balíčku. Workspace by se vyplatil až
  u druhé aplikace, která by UI sdílela.
- **Dark mode se vyřazuje.** `components/theme-provider.tsx` není nikde
  připojený, takže třída `.dark` se nikdy neaplikuje a celý `.dark` blok
  v `app/globals.css` je mrtvý kód. Maže se. Tokeny se navrhnou tak, aby
  dark mode šel doplnit jedním blokem, ale teď se do něj neinvestuje.

## Výchozí stav — co je rozbité

Zjištěno průzkumem, ne odhadem:

1. **Tři konfliktní bloky tokenů v `app/globals.css`.** `:root` nastaví
   `--background: #e8e8f3`. Druhý `@theme inline` nastaví
   `--color-background: #f1f1f8`. Třetí `@theme inline` to hned přepíše na
   `var(--background)`. Zhruba polovina hodnot v prostředním bloku je mrtvý
   kód, který nikdy nic neobarví.
2. **Sidebar tokeny existují jen v `.dark`.** Tedy nikdy.
3. **Osm `!important` z-index záplat** na dialogy, popovery a sheety —
   symptom toho, že primitivy nemají vlastní neprůhledné pozadí a chybí
   škála vrstev.
4. **`toneClass()` je zkopírovaný** v `app/page.tsx` a `app/invoices/page.tsx`.
5. **Lokální `Th` / `Td` / `Dash` / `SectionLabelInline`** v
   `app/invoices/page.tsx`, přestože `components/ui/table.tsx` existuje.
6. **Stavové barvy natvrdo** (`text-emerald-700`, `text-amber-700`,
   `text-rose-700`) mimo token systém.
7. **Locale `es-ES`** ve všech třech formátovačích peněz — pozůstatek po v0.
   Česky se částka vypisuje jako `1.234,56 €` místo `1 234,56 €`.
8. **Číslované sekce 01/02/03** označují pořadí tam, kde žádné není
   (`Přehled`, `Rychlé akce`). Výjimka: na `/connect` jde o skutečné kroky
   nastavení a číslování tam informaci nese.

## Teze návrhu

V tomhle dómenu existuje jediná skutečná posloupnost — vzdálenost od dneška.
Všechno, co uživatelka denně řeší, je funkce času vůči splatnosti. Strukturu
proto nenese dekorativní číslování, ale časová osa. Barva není libovolná
paleta stavů, ale **teplotní škála mapovaná na čas**.

## Tokeny

Dvě úrovně. Komponenty smějí sáhnout **jen** na sémantickou vrstvu — to je
hranice, která dnes chybí, a proto se hodnoty rozutekly.

### Primitivní vrstva — `styles/tokens.css`

Surové hodnoty, prefix `--tf-`. Nikdy se nepoužívají přímo v komponentách.

| Token | Hex | Role |
|---|---|---|
| `--tf-ink` | `#1a1533` | hřbet sidebaru, hlavní text |
| `--tf-iris` | `#5638e8` | primární akce, „nadcházející" na ose |
| `--tf-canvas` | `#f3f2f8` | plocha obsahu |
| `--tf-surface` | `#ffffff` | karty, řádky |
| `--tf-mute` | `#6a667e` | sekundární text |
| `--tf-hairline` | `#e4e2ee` | linky, oddělovače |

Odchod od `#7c3aed` je záměrný — je to doslova Tailwind `violet-600`.
Fialová rodina zůstává kvůli návaznosti, konkrétní hodnota se mění.

Teplotní škála:

```
po splatnosti  →  dnes/brzy  →  nadchází  →  zaplaceno
  #d63848         #c77510      #5638e8      #1f8a63
   horké           teplé        studené      vyřešené
```

Dále primitivy pro spacing, poloměry, stíny, typografickou škálu a **škálu
vrstev** (`--tf-layer-dropdown`, `--tf-layer-overlay`, `--tf-layer-dialog`,
`--tf-layer-toast`) — ta nahradí `!important` záplaty.

### Sémantická vrstva — `styles/semantic.css`

Mapuje primitivy na role. Zachovává shadcn názvy (`--color-background`,
`--color-primary`, …), aby existující primitivy nepotřebovaly přepsat, a
přidává:

- `--color-sidebar` a spol. — nově i mimo `.dark`
- pro každý stav trojici `--color-status-{overdue,due,upcoming,settled}-{fg,bg,line}`

Tím z komponent zmizí `text-emerald-700` a spol. úplně.

### `app/globals.css`

Zůstane import obou souborů, `@theme inline` mapování na Tailwind utility a
minimální `@layer base`. Tři konfliktní bloky, radiální přechody na `body`
a `!important` záplaty mizí.

## Typografie

Tři role. Tvrdé omezení, které rozhoduje o výběru: **latin-ext** — bez něj se
rozsype `ě š č ř ž ů`. Všechny tři vybrané řezy ho mají.

- **Display — Poppins.** Zůstává z původního návrhu. Používá se střídmě:
  titulky stránek a velké částky, vždy s `tabular-nums`.
- **Body — Inter.** Zůstává. Pro české UI je to správný nástroj.
- **Identifikátory — IBM Plex Mono.** Čísla faktur, variabilní symbol, IČO,
  popisky časové osy. Nahrazuje GeistMono.

Rozdíl je významový, ne dekorativní: **hodnoty** (částky) jdou display řezem,
**identifikátory** (čísla dokladů) monem. Peníze čte člověk, doklady úřad.

### Poznámka k revizi

Původní návrh měnil displejový řez z Poppins na Bricolage Grotesque
s odůvodněním, že Poppins je geometrický default. Rozhodnutím uživatele
**Poppins zůstává** — změna řezu se ruší, mění se jen mono řez.

Z toho plyne druhá odchylka: `app/globals.css` si ponechává aliasy

```css
--font-serif: var(--font-display);
--font-mono:  var(--font-ident);
```

takže stávající třídy `font-serif` a `font-mono` dál fungují a plošné
přejmenování tříd napříč repem odpadá. Je to vědomý ústupek proti pravidlu
„jedna role, jedno jméno" — aliasy jsou tenká vrstva nad tokeny, ne druhý
zdroj hodnot, takže tokenová vrstva zůstává jediným zdrojem pravdy.

## Layout

```
┌────────────┬──────────────────────────────────────────────┐
│            │  Faktury                    [+ Nová faktura] │
│  TERKY     ├──────────────────────────────────────────────┤
│            │                                              │
│  Přehled   │  ┌────────────────────────────────────────┐  │
│  Zákazníci │  │  ◀ po splatnosti  │DNES│  nadchází ▶   │  │
│  Aktivity  │  │  ▓▓▓  ▓▓      ▓   │    │  ░  ░░   ░    │  │
│  Faktury   │  │  −14d    −3d      │    │   +5d   +21d  │  │
│  ─────     │  └────────────────────────────────────────┘  │
│  Moje údaje│                                              │
│  Připojení │   3 200 €        890 €        2         12   │
│            │   nezaplaceno    po splatn.   klientů    ks  │
│  ┌────────┐│                                              │
│  │ terka@ ││  ├ 2026-041   Novák s.r.o.   420 €   ●─── │  │
│  │ Odhlás.││  ├ 2026-040   Dvořák        1 200 €  ●─── │  │
│  └────────┘│                                              │
└────────────┴──────────────────────────────────────────────┘
```

- Sidebar: tmavý `ink` hřbet přes celou výšku, 264 px, sbalitelný na ikonovou
  lištu. Stav sbalení se drží v `localStorage`.
- Mobil: sidebar se stává `Sheet` (komponenta už v repu je).
- Obsah: úzký sticky topbar s názvem stránky a primární akcí.
- `container mx-auto … max-w-6xl` opakované v 14 souborech nahradí jeden
  `PageShell`.

## Signature element — osa splatnosti

Pás nad obsahem dashboardu. `DNES` je pevná svislá značka. Nezaplacené faktury
sedí na ose podle data splatnosti; sytost výplně roste s tím, jak dlouho jsou
po splatnosti. Kliknutí filtruje seznam pod osou.

Na mobilu degraduje na tři sbalené sloupce (Po splatnosti / Tento týden /
Později) — stejná data, žádné vodorovné scrollování.

Je to jediná ozdoba v celém návrhu. Všechno okolo zůstává tiché: dlaždice se
statistikami se zmenší a zklidní, radiální přechody z `body` jdou pryč.

## Struktura komponent

```
components/ui/         primitivy, nulová znalost domény
components/patterns/   složené, stále bez domény:
                       PageShell, PageHeader, StatTile, DataTable,
                       EmptyState, Toolbar, StepLabel
components/app-shell/  Sidebar, SidebarNav, Topbar, MobileNav, UserMenu
components/{invoices,customers,activities,company,mcp}/   doména, beze změny hranic
```

`components/layout/` zaniká; obsah se rozdělí mezi `patterns/` a `app-shell/`.

`SectionLabel` se přejmenuje na `StepLabel` a použije se **jen tam, kde
pořadí nese informaci** — tedy na `/connect`. Z dashboardu a faktur mizí.

## Peníze

Locale `es-ES` → `cs-CZ` ve všech třech formátovačích: `lib/utils.ts`,
`lib/money.ts`, `lib/pdf-generator.tsx`. Měna EUR zůstává — je vynucená
v `lib/validation/common.ts` a v MCP schématech přes `z.literal("EUR")`.

Pozor: `lib/money.ts` formátuje i výstup MCP nástrojů, který je pokrytý testy.
Stávající tvrzení v `tests/money.test.ts` jsou ale volná (`toContain("121")`,
`toContain("€")`) a v `cs-CZ` platí dál — měnit se nemusí. Doplní se přesnější
test, který české formátování skutečně ověří.

## Rozsah

### Stránky se shellem (přihlášený uživatel)

`/`, `/customers/*`, `/activities/*`, `/invoices/*` (kromě `download`),
`/company`, `/connect`, `/oauth/authorize`.

Hlubší vizuální práce: dashboard, seznam faktur, zákazníci, aktivity, detail
faktury. Formuláře dostanou konzistentní vzhled polí přes primitivy — jejich
logika se nemění.

### Stránky bez shellu

Sidebar by tu byl špatně — uživatel není přihlášený, nebo je to jednoúčelová
obrazovka bez navigace:

- `/auth/*` — přihlášení, registrace, reset hesla. Vlastní vystředěné
  rozvržení. Dostanou tokeny a primitivy, ale žádnou navigaci.
- `/invoices/download/[publicId]` — veřejná stránka pro stažení faktury.
  Vidí ji příjemce faktury, ne vlastník účtu. Žádná navigace do aplikace.

Dnes to řeší `app/layout.tsx` podmínkou `user && <Header />`. To se nahradí
skupinami rout (`app/(app)/` se shellem, veřejné stránky mimo ni), takže
rozhodnutí je dané strukturou, ne podmínkou za běhu. Přesuny adresářů nesmí
změnit žádnou veřejnou URL — seznam veřejných prefixů v
`lib/supabase/proxy.ts` zůstává platný.

## Co se nemění

Servisní vrstva (`lib/services/*`), MCP nástroje, auth a middleware, migrace
a RLS. `lib/pdf-generator.tsx` má vlastní `StyleSheet` z `@react-pdf` — do
rozvržení PDF se nesahá, mění se tam jen locale formátovače.

## Brána

`pnpm typecheck && pnpm test && pnpm build`.

Existující testy jsou servisní, MCP a OAuth — UI se jich nedotýká, takže musí
projít beze změny. Jedinou výjimkou jsou testy formátování peněz, které se
mění spolu s locale.

Nad rámec toho: vizuální kontrola hotových obrazovek v prohlížeči, včetně
mobilní šířky, viditelného fokusu z klávesnice a respektování
`prefers-reduced-motion`.

## Riziko mimo zadání

V repu je rozdělaný upgrade závislostí — `next` 16.3.0, `zod` 4.4.3,
`typescript` 7.0.2 (necommitnuté změny v `package.json` a `pnpm-lock.yaml`).
`pnpm typecheck` v tomhle stavu prochází. Redesign se do toho nemíchá, ale
pokud `pnpm build` selže z důvodu upgradu, řeší se to odděleně.
