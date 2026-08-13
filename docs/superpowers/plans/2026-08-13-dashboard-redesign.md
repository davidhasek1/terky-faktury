# Redesign na dashboard se sidebarem — implementační plán

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Přestavět Terky Faktury na dashboard s trvalým postranním menu, jedním zdrojem pravdy pro design tokeny a UI vrstvou s vynucenou hranicí.

**Architecture:** Dvouúrovňové CSS tokeny (primitivní `--tf-*` → sémantické `--color-*`), na které smí sahat jen komponenty. Komponenty ve třech vrstvách: `ui/` (primitivy bez domény), `patterns/` (složené, bez domény), `app-shell/` (navigace). Route groups oddělí stránky se shellem od veřejných. Signature prvek je časová osa splatnosti — jediná skutečná posloupnost v tomhle dómenu.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4 (`@theme inline`, žádný `tailwind.config`), TypeScript, Vitest, shadcn/ui + Radix.

**Spec:** `docs/superpowers/specs/2026-08-13-dashboard-redesign-design.md`

## Global Constraints

- **Jazyk UI je čeština.** Žádné španělské řetězce — repo se jich jednou už čistilo.
- **Měna je EUR**, vynucená přes `z.literal("EUR")` v `lib/validation/common.ts` a MCP schématech. Nemění se.
- **Locale je `cs-CZ`.** Pozor: `cs-CZ` používá U+00A0 (nedělitelná mezera) jako oddělovač tisíců i před `€`. Přesná podoba: `1 234,56 €`.
- **Tailwind v4** — konfigurace je v CSS přes `@theme`, soubor `tailwind.config.*` neexistuje a nezakládá se.
- **Žádný dark mode.** `.dark` blok a `components/theme-provider.tsx` se mažou.
- **Komponenty smějí číst jen sémantické tokeny** (`--color-*`), nikdy primitivní `--tf-*`.
- **Veřejné URL se nesmí změnit.** Seznam prefixů v `lib/supabase/proxy.ts` musí po přesunech adresářů dál platit.
- **Nesahat na:** `lib/services/*`, `lib/mcp/*`, `lib/oauth/*`, `proxy.ts`, `supabase/migrations/*`, rozvržení v `lib/pdf-generator.tsx`.
- **Brána každého úkolu:** `pnpm typecheck && pnpm test`. U úkolů, které mění stránky, navíc `pnpm build`.
- **Přístupnost:** viditelný fokus z klávesnice, respektovaný `prefers-reduced-motion`, funkční na šířce 375 px.

---

### Task 1: Vrstva tokenů

Nahradí tři konfliktní bloky v `app/globals.css` jedním zdrojem pravdy a vymění písma.

**Files:**
- Create: `styles/tokens.css`
- Create: `styles/semantic.css`
- Modify: `app/globals.css` (celý přepis)
- Modify: `app/layout.tsx:3-20` (písma)
- Delete: `components/theme-provider.tsx`
- Test: `tests/design/tokens.test.ts`

**Interfaces:**
- Produces: sémantické tokeny, na které sahá všechno ostatní — `--color-background`, `--color-foreground`, `--color-card`, `--color-primary`, `--color-muted-foreground`, `--color-border`, `--color-sidebar`, `--color-sidebar-foreground`, `--color-sidebar-accent`, a pro každý stav `--color-status-{overdue,due,upcoming,settled}-{fg,bg,line}`.
- Produces: proměnné písem `--font-display` (Bricolage Grotesque), `--font-body` (Inter), `--font-ident` (IBM Plex Mono), namapované na Tailwind utility `font-display`, `font-sans`, `font-ident`.
- Produces: škála vrstev `--tf-layer-dropdown: 40`, `--tf-layer-overlay: 50`, `--tf-layer-dialog: 60`, `--tf-layer-toast: 70`.

- [ ] **Step 1: Napiš padající test**

Test hlídá invariant, kvůli kterému se tokeny minule rozutekly: žádný sémantický token nesmí být definovaný dvakrát, a v komponentách se nesmí objevit primitivní `--tf-*`.

```ts
// tests/design/tokens.test.ts
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const tokens = readFileSync("styles/tokens.css", "utf8")
const semantic = readFileSync("styles/semantic.css", "utf8")
const globals = readFileSync("app/globals.css", "utf8")

function declaredNames(css: string): string[] {
  return [...css.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((m) => m[1])
}

describe("vrstva tokenů", () => {
  it("definuje každý sémantický token právě jednou", () => {
    const names = declaredNames(semantic)
    const duplicates = names.filter((n, i) => names.indexOf(n) !== i)
    expect(duplicates).toEqual([])
  })

  it("drží primitivy a sémantiku oddělené", () => {
    // Primitivy jsou jen v tokens.css, sémantika na ně jen odkazuje.
    expect(declaredNames(tokens).every((n) => n.startsWith("--tf-"))).toBe(true)
    expect(declaredNames(semantic).some((n) => n.startsWith("--tf-"))).toBe(false)
  })

  it("nemá v globals.css žádnou !important záplatu", () => {
    expect(globals).not.toContain("!important")
  })

  it("neobsahuje mrtvý dark mode", () => {
    expect(globals).not.toContain(".dark")
  })

  it("pokrývá celou teplotní škálu stavů", () => {
    for (const status of ["overdue", "due", "upcoming", "settled"]) {
      for (const role of ["fg", "bg", "line"]) {
        expect(semantic).toContain(`--color-status-${status}-${role}`)
      }
    }
  })
})

describe("hranice tokenů", () => {
  it("nedovolí komponentám sáhnout na primitivní token", () => {
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry)
        if (statSync(path).isDirectory()) walk(path)
        else if (/\.tsx?$/.test(path) && readFileSync(path, "utf8").includes("--tf-")) {
          offenders.push(path)
        }
      }
    }
    walk("components")
    expect(offenders).toEqual([])
  })
})
```

- [ ] **Step 2: Spusť test, ověř že padá**

Run: `pnpm vitest run tests/design/tokens.test.ts`
Expected: FAIL — `ENOENT: no such file or directory, open 'styles/tokens.css'`

- [ ] **Step 3: Vytvoř `styles/tokens.css`**

```css
/* Primitivní vrstva. Surové hodnoty. Komponenty sem NIKDY nesahají —
   čtou výhradně sémantické tokeny ze semantic.css. */
:root {
  /* Plochy a text */
  --tf-ink: #1a1533;
  --tf-ink-soft: #2a2350;
  --tf-iris: #5638e8;
  --tf-iris-strong: #4527d4;
  --tf-iris-wash: #efecfe;
  --tf-canvas: #f3f2f8;
  --tf-surface: #ffffff;
  --tf-mute: #6a667e;
  --tf-hairline: #e4e2ee;

  /* Teplotní škála: čas vůči splatnosti.
     horké (po splatnosti) → teplé (brzy) → studené (nadchází) → vyřešené */
  --tf-hot: #d63848;
  --tf-hot-wash: #fdeaec;
  --tf-warm: #c77510;
  --tf-warm-wash: #fdf1e0;
  --tf-cool: #5638e8;
  --tf-cool-wash: #efecfe;
  --tf-done: #1f8a63;
  --tf-done-wash: #e6f5ee;

  /* Odstupy */
  --tf-space-1: 0.25rem;
  --tf-space-2: 0.5rem;
  --tf-space-3: 0.75rem;
  --tf-space-4: 1rem;
  --tf-space-6: 1.5rem;
  --tf-space-8: 2rem;
  --tf-space-12: 3rem;

  /* Poloměry */
  --tf-radius-sm: 0.5rem;
  --tf-radius-md: 0.75rem;
  --tf-radius-lg: 1rem;
  --tf-radius-full: 9999px;

  /* Stíny — jemné, laděné do inkoustu, ne do černé */
  --tf-shadow-sm: 0 1px 2px rgb(26 21 51 / 0.05);
  --tf-shadow-md: 0 4px 16px -6px rgb(26 21 51 / 0.12);

  /* Šířky shellu */
  --tf-sidebar-w: 16.5rem;
  --tf-sidebar-w-collapsed: 4.5rem;

  /* Škála vrstev — nahrazuje !important záplaty */
  --tf-layer-dropdown: 40;
  --tf-layer-overlay: 50;
  --tf-layer-dialog: 60;
  --tf-layer-toast: 70;
}
```

- [ ] **Step 4: Vytvoř `styles/semantic.css`**

```css
/* Sémantická vrstva. Jediné, na co smí sáhnout komponenta.
   Názvy shadcn se zachovávají, aby existující primitivy fungovaly beze změny. */
:root {
  --background: var(--tf-canvas);
  --foreground: var(--tf-ink);
  --card: var(--tf-surface);
  --card-foreground: var(--tf-ink);
  --popover: var(--tf-surface);
  --popover-foreground: var(--tf-ink);
  --primary: var(--tf-iris);
  --primary-foreground: var(--tf-surface);
  --secondary: var(--tf-iris-wash);
  --secondary-foreground: var(--tf-iris-strong);
  --muted: var(--tf-canvas);
  --muted-foreground: var(--tf-mute);
  --accent: var(--tf-iris-wash);
  --accent-foreground: var(--tf-iris-strong);
  --destructive: var(--tf-hot);
  --destructive-foreground: var(--tf-surface);
  --border: var(--tf-hairline);
  --input: var(--tf-hairline);
  --ring: var(--tf-iris);

  /* Sidebar — dřív existoval jen v .dark, tedy nikdy */
  --sidebar: var(--tf-ink);
  --sidebar-foreground: #cfcae6;
  --sidebar-accent: var(--tf-ink-soft);
  --sidebar-accent-foreground: var(--tf-surface);
  --sidebar-border: #2e2758;
  --sidebar-ring: var(--tf-iris);

  /* Stavy jako teplotní škála. Nahrazuje natvrdo psané
     text-emerald-700 / text-amber-700 / text-rose-700. */
  --status-overdue-fg: #a52630;
  --status-overdue-bg: var(--tf-hot-wash);
  --status-overdue-line: var(--tf-hot);

  --status-due-fg: #8f5308;
  --status-due-bg: var(--tf-warm-wash);
  --status-due-line: var(--tf-warm);

  --status-upcoming-fg: var(--tf-iris-strong);
  --status-upcoming-bg: var(--tf-cool-wash);
  --status-upcoming-line: var(--tf-cool);

  --status-settled-fg: #176548;
  --status-settled-bg: var(--tf-done-wash);
  --status-settled-line: var(--tf-done);
}
```

- [ ] **Step 5: Přepiš `app/globals.css`**

Celý soubor nahraď tímto. Tři konfliktní bloky, `.dark`, radiální přechody i všech osm `!important` mizí.

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "../styles/tokens.css";
@import "../styles/semantic.css";

@theme inline {
  --font-sans: var(--font-body), system-ui, sans-serif;
  --font-display: var(--font-display-face), var(--font-body), system-ui, sans-serif;
  --font-ident: var(--font-ident-face), ui-monospace, monospace;

  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);

  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);

  --color-status-overdue-fg: var(--status-overdue-fg);
  --color-status-overdue-bg: var(--status-overdue-bg);
  --color-status-overdue-line: var(--status-overdue-line);
  --color-status-due-fg: var(--status-due-fg);
  --color-status-due-bg: var(--status-due-bg);
  --color-status-due-line: var(--status-due-line);
  --color-status-upcoming-fg: var(--status-upcoming-fg);
  --color-status-upcoming-bg: var(--status-upcoming-bg);
  --color-status-upcoming-line: var(--status-upcoming-line);
  --color-status-settled-fg: var(--status-settled-fg);
  --color-status-settled-bg: var(--status-settled-bg);
  --color-status-settled-line: var(--status-settled-line);

  --radius-sm: var(--tf-radius-sm);
  --radius-md: var(--tf-radius-md);
  --radius-lg: var(--tf-radius-lg);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
  }
  input::placeholder,
  textarea::placeholder {
    @apply text-muted-foreground/50;
  }
  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
  }
}
```

Poznámka: test `nemá v globals.css žádnou !important záplatu` by na bloku `prefers-reduced-motion` spadl. Uprav tvrzení tak, aby hlídalo jen záplaty — nahraď v testu z kroku 1 řádek `expect(globals).not.toContain("!important")` za:

```ts
    const patchLines = globals
      .split("\n")
      .filter((l) => l.includes("!important") && !l.match(/animation|transition/))
    expect(patchLines).toEqual([])
```

- [ ] **Step 6: Vyměň písma v `app/layout.tsx`**

Nahraď import a definice Inter/Poppins:

```tsx
import { Bricolage_Grotesque, IBM_Plex_Mono, Inter } from "next/font/google"

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-body",
  display: "swap",
})

const bricolage = Bricolage_Grotesque({
  subsets: ["latin", "latin-ext"],
  weight: ["500", "600", "700"],
  variable: "--font-display-face",
  display: "swap",
})

const plexMono = IBM_Plex_Mono({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500"],
  variable: "--font-ident-face",
  display: "swap",
})
```

V `<body>` nahraď `${GeistMono.variable} ${inter.variable} ${poppins.variable}` za `${inter.variable} ${bricolage.variable} ${plexMono.variable}`. Import `GeistMono` z `geist/font/mono` odstraň.

- [ ] **Step 7: Smaž mrtvý theme provider**

```bash
git rm components/theme-provider.tsx
```

`components/ui/sonner.tsx` importuje `useTheme` z `next-themes`. Bez providera vrací `undefined`, což Sonner zvládá, ale je to zbytečná závislost — nahraď v `sonner.tsx` `const { theme = "system" } = useTheme()` za `const theme = "light"` a import `useTheme` smaž.

- [ ] **Step 8: Spusť testy**

Run: `pnpm vitest run tests/design/tokens.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add styles app/globals.css app/layout.tsx components/ui/sonner.tsx tests/design
git rm --cached components/theme-provider.tsx 2>/dev/null || true
git commit -m "refactor(design): make tokens a single source of truth"
```

---

### Task 2: České formátování peněz

**Files:**
- Modify: `lib/utils.ts:9-14`
- Modify: `lib/money.ts:88-94`
- Modify: `lib/pdf-generator.tsx:143-148`
- Test: `tests/money.test.ts`

**Interfaces:**
- Produces: `formatCurrency(amount: number): string` a `formatScaled(scaled: Scaled): string` vracejí české formátování EUR.

- [ ] **Step 1: Napiš padající test**

Přidej do `tests/money.test.ts`. **Pozor na U+00A0** — s obyčejnou mezerou test spadne.

```ts
describe("české formátování", () => {
  it("odděluje tisíce nedělitelnou mezerou a měnu dává dozadu", () => {
    // cs-CZ: U+00A0 jako oddělovač tisíců i před symbolem měny.
    expect(formatScaled(123_456)).toBe("1 234,56 €")
  })

  it("nepoužívá španělské formátování", () => {
    // es-ES vracelo "1234,56 €" — bez oddělovače tisíců.
    expect(formatScaled(123_456)).not.toBe("1234,56 €")
  })
})
```

- [ ] **Step 2: Spusť test, ověř že padá**

Run: `pnpm vitest run tests/money.test.ts -t "české formátování"`
Expected: FAIL — dostaneš `"1234,56 €"` místo `"1 234,56 €"`

- [ ] **Step 3: Změň locale ve všech třech formátovačích**

V `lib/money.ts` (uprav i komentář, který dnes tvrdí „es-ES jako ve zbytku appky"):

```ts
/** Formátování pro souhrny určené člověku i modelu (EUR, cs-CZ jako ve zbytku appky). */
export function formatScaled(scaled: Scaled): string {
  return new Intl.NumberFormat("cs-CZ", {
    style: "currency",
    currency: "EUR",
  }).format(toDecimal(scaled))
}
```

V `lib/utils.ts` a `lib/pdf-generator.tsx` nahraď `"es-ES"` za `"cs-CZ"`.

- [ ] **Step 4: Spusť celou sadu**

Run: `pnpm test && pnpm typecheck`
Expected: PASS — včetně stávajících tvrzení `toContain("121")` a `toContain("€")`, která v cs-CZ platí dál.

- [ ] **Step 5: Ověř, že v repu nezůstalo es-ES**

Run: `grep -rn "es-ES" --include="*.ts" --include="*.tsx" lib app components`
Expected: žádný výstup

- [ ] **Step 6: Commit**

```bash
git add lib/utils.ts lib/money.ts lib/pdf-generator.tsx tests/money.test.ts
git commit -m "fix(money): format amounts in Czech, not Spanish"
```

---

### Task 3: Rozřazení faktur podle splatnosti

Čistá logika za časovou osou. Vzniká odděleně a otestovaně, aby komponenta v Tasku 8 byla jen vykreslení.

**Files:**
- Create: `lib/services/due-schedule.ts`
- Test: `tests/services/due-schedule.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type DueBucket = "overdue" | "due" | "upcoming"
  export interface ScheduledInvoice<T> { item: T; bucket: DueBucket; daysFromToday: number }
  export interface DueSchedule<T> {
    overdue: ScheduledInvoice<T>[]
    due: ScheduledInvoice<T>[]
    upcoming: ScheduledInvoice<T>[]
    span: { min: number; max: number }
  }
  export function buildDueSchedule<T extends { due_date: string; paid_date: string | null }>(
    invoices: readonly T[], today: Date,
  ): DueSchedule<T>
  export function axisPosition(daysFromToday: number, span: { min: number; max: number }): number
  ```

Pravidla: zaplacené faktury se na osu nedostanou. `daysFromToday < 0` → `overdue`; `0..7` → `due`; `> 7` → `upcoming`. `axisPosition` vrací 0–1 pro umístění na ose; při nulovém rozpětí vrací 0.5.

- [ ] **Step 1: Napiš padající test**

```ts
// tests/services/due-schedule.test.ts
import { describe, expect, it } from "vitest"
import { axisPosition, buildDueSchedule } from "@/lib/services/due-schedule"

const today = new Date("2026-08-13T10:30:00Z")
const inv = (due: string, paid: string | null = null) => ({ due_date: due, paid_date: paid })

describe("buildDueSchedule", () => {
  it("rozřadí faktury podle vzdálenosti od dneška", () => {
    const s = buildDueSchedule(
      [inv("2026-07-30"), inv("2026-08-15"), inv("2026-09-20")],
      today,
    )
    expect(s.overdue.map((e) => e.daysFromToday)).toEqual([-14])
    expect(s.due.map((e) => e.daysFromToday)).toEqual([2])
    expect(s.upcoming.map((e) => e.daysFromToday)).toEqual([38])
  })

  it("počítá dnešek jako nula, ne jako po splatnosti", () => {
    const s = buildDueSchedule([inv("2026-08-13")], today)
    expect(s.overdue).toEqual([])
    expect(s.due[0].daysFromToday).toBe(0)
  })

  it("ignoruje denní dobu — splatnost je datum, ne okamžik", () => {
    const late = new Date("2026-08-13T23:59:00Z")
    expect(buildDueSchedule([inv("2026-08-13")], late).due[0].daysFromToday).toBe(0)
  })

  it("zaplacené faktury na osu nepatří", () => {
    const s = buildDueSchedule([inv("2026-07-01", "2026-07-05")], today)
    expect(s.overdue).toEqual([])
    expect(s.due).toEqual([])
    expect(s.upcoming).toEqual([])
  })

  it("řadí od nejstarší splatnosti", () => {
    const s = buildDueSchedule([inv("2026-07-30"), inv("2026-07-01")], today)
    expect(s.overdue.map((e) => e.daysFromToday)).toEqual([-43, -14])
  })

  it("hlásí rozpětí osy", () => {
    const s = buildDueSchedule([inv("2026-07-30"), inv("2026-09-20")], today)
    expect(s.span).toEqual({ min: -14, max: 38 })
  })

  it("u prázdného vstupu vrátí rozpětí kolem dneška", () => {
    expect(buildDueSchedule([], today).span).toEqual({ min: 0, max: 0 })
  })
})

describe("axisPosition", () => {
  it("mapuje rozpětí na 0..1", () => {
    expect(axisPosition(-10, { min: -10, max: 10 })).toBe(0)
    expect(axisPosition(0, { min: -10, max: 10 })).toBe(0.5)
    expect(axisPosition(10, { min: -10, max: 10 })).toBe(1)
  })

  it("při nulovém rozpětí staví doprostřed místo dělení nulou", () => {
    expect(axisPosition(0, { min: 0, max: 0 })).toBe(0.5)
  })
})
```

- [ ] **Step 2: Spusť test, ověř že padá**

Run: `pnpm vitest run tests/services/due-schedule.test.ts`
Expected: FAIL — modul neexistuje

- [ ] **Step 3: Napiš implementaci**

```ts
// lib/services/due-schedule.ts

/**
 * Čistá logika časové osy splatnosti.
 *
 * Splatnost je datum, ne okamžik — proto se obě strany srovnávají na půlnoc
 * UTC. Bez toho by faktura splatná dnes večer vycházela jako „po splatnosti"
 * podle toho, kolik je hodin.
 */

export type DueBucket = "overdue" | "due" | "upcoming"

/** Kolik dní dopředu ještě spadá do „brzy". */
const DUE_SOON_DAYS = 7

const MS_PER_DAY = 86_400_000

export interface ScheduledInvoice<T> {
  item: T
  bucket: DueBucket
  daysFromToday: number
}

export interface DueSchedule<T> {
  overdue: ScheduledInvoice<T>[]
  due: ScheduledInvoice<T>[]
  upcoming: ScheduledInvoice<T>[]
  span: { min: number; max: number }
}

function midnightUtc(value: Date | string): number {
  const d = typeof value === "string" ? new Date(`${value}T00:00:00Z`) : value
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

function bucketFor(days: number): DueBucket {
  if (days < 0) return "overdue"
  return days <= DUE_SOON_DAYS ? "due" : "upcoming"
}

export function buildDueSchedule<
  T extends { due_date: string; paid_date: string | null },
>(invoices: readonly T[], today: Date): DueSchedule<T> {
  const anchor = midnightUtc(today)

  const scheduled = invoices
    .filter((item) => !item.paid_date)
    .map((item) => {
      const days = Math.round((midnightUtc(item.due_date) - anchor) / MS_PER_DAY)
      return { item, bucket: bucketFor(days), daysFromToday: days }
    })
    .sort((a, b) => a.daysFromToday - b.daysFromToday)

  const days = scheduled.map((e) => e.daysFromToday)

  return {
    overdue: scheduled.filter((e) => e.bucket === "overdue"),
    due: scheduled.filter((e) => e.bucket === "due"),
    upcoming: scheduled.filter((e) => e.bucket === "upcoming"),
    span: {
      min: days.length ? Math.min(...days) : 0,
      max: days.length ? Math.max(...days) : 0,
    },
  }
}

export function axisPosition(
  daysFromToday: number,
  span: { min: number; max: number },
): number {
  const range = span.max - span.min
  if (range === 0) return 0.5
  return (daysFromToday - span.min) / range
}
```

- [ ] **Step 4: Spusť testy**

Run: `pnpm vitest run tests/services/due-schedule.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/services/due-schedule.ts tests/services/due-schedule.test.ts
git commit -m "feat(invoices): bucket unpaid invoices by distance from today"
```

---

### Task 4: Stavy faktur na tokenech

Odstraní natvrdo psané barvy z `InvoiceStatusBadge` a sjednotí je s teplotní škálou.

**Files:**
- Modify: `components/invoices/invoice-status-badge.tsx`
- Test: `tests/design/status-colors.test.ts`

**Interfaces:**
- Consumes: `--color-status-*` z Tasku 1, `InvoiceStatus` z `lib/services/invoices.ts`.
- Produces: `InvoiceStatusBadge({ status }: { status: InvoiceStatus })` beze změny signatury.

- [ ] **Step 1: Napiš padající test**

```ts
// tests/design/status-colors.test.ts
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const PALETTE = /\b(?:text|bg|border|ring)-(?:emerald|amber|rose|red|green|yellow)-\d{2,3}\b/

describe("stavové barvy", () => {
  it("nikde nepoužívá barvy z Tailwind palety mimo token systém", () => {
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry)
        if (statSync(path).isDirectory()) walk(path)
        else if (/\.tsx$/.test(path)) {
          const hit = readFileSync(path, "utf8").match(PALETTE)
          if (hit) offenders.push(`${path}: ${hit[0]}`)
        }
      }
    }
    walk("components")
    walk("app")
    expect(offenders).toEqual([])
  })
})
```

- [ ] **Step 2: Spusť test, ověř že padá**

Run: `pnpm vitest run tests/design/status-colors.test.ts`
Expected: FAIL — vypíše `invoice-status-badge.tsx: bg-emerald-50`, `app/page.tsx: text-emerald-700`, `app/invoices/page.tsx: text-rose-700` a další

- [ ] **Step 3: Přepiš `InvoiceStatusBadge` na tokeny**

```tsx
import type { InvoiceStatus } from "@/lib/services/invoices"
import { cn } from "@/lib/utils"

/**
 * Stav faktury v seznamu.
 *
 * Barvy jdou z teplotní škály v token systému, ne z Tailwind palety — stejná
 * škála pohání i časovou osu splatnosti, takže „po splatnosti" má všude
 * v aplikaci jeden odstín.
 */
const STYLES: Record<InvoiceStatus, { label: string; badge: string; dot: string }> = {
  paid: {
    label: "Zaplaceno",
    badge: "bg-status-settled-bg text-status-settled-fg ring-status-settled-line/30",
    dot: "bg-status-settled-line",
  },
  unpaid: {
    label: "Nezaplaceno",
    badge: "bg-status-due-bg text-status-due-fg ring-status-due-line/30",
    dot: "bg-status-due-line",
  },
  overdue: {
    label: "Po splatnosti",
    badge: "bg-status-overdue-bg text-status-overdue-fg ring-status-overdue-line/40",
    dot: "bg-status-overdue-line",
  },
}

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const style = STYLES[status]

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 whitespace-nowrap rounded-full px-2.5 py-1 ring-1 ring-inset",
        "text-[11px] font-medium",
        style.badge,
      )}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", style.dot)} aria-hidden="true" />
      {style.label}
    </span>
  )
}
```

- [ ] **Step 4: Poznámka k dočasnému stavu**

Test z kroku 1 bude pořád padat kvůli `toneClass()` v `app/page.tsx` a `app/invoices/page.tsx` — ty se ruší až v Tasku 9 a 10. Do té doby přeskoč soubory v `app/` a hlídej jen `components/`:

```ts
    walk("components")
    // walk("app") — zapnout v Tasku 10, až zmizí toneClass()
```

V Tasku 10 se řádek odkomentuje.

- [ ] **Step 5: Spusť testy**

Run: `pnpm vitest run tests/design && pnpm typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add components/invoices/invoice-status-badge.tsx tests/design/status-colors.test.ts
git commit -m "refactor(invoices): drive status colors from design tokens"
```

---

### Task 5: Vrstva `patterns/`

Sem se stěhuje všechno, co se dnes kopíruje mezi stránkami.

**Files:**
- Create: `components/patterns/page-shell.tsx`
- Create: `components/patterns/page-header.tsx`
- Create: `components/patterns/stat-tile.tsx`
- Create: `components/patterns/empty-state.tsx`
- Create: `components/patterns/step-label.tsx`
- Create: `components/patterns/data-table.tsx`
- Delete: `components/layout/page-header.tsx`, `components/layout/section-label.tsx`

**Interfaces:**
- Produces:
  ```ts
  PageShell({ children, width }: { children: ReactNode; width?: "narrow" | "wide" })
  PageHeader({ eyebrow, title, description, actions }: {
    eyebrow?: ReactNode; title: ReactNode; description?: ReactNode; actions?: ReactNode })
  StatTile({ label, value, meta, tone }: {
    label: string; value: string; meta?: string
    tone?: "neutral" | "overdue" | "due" | "upcoming" | "settled" })
  EmptyState({ icon, title, description, action }: {
    icon?: ReactNode; title: string; description?: string; action?: ReactNode })
  StepLabel({ number, title }: { number: string; title: string })
  DataTable / TableHead / TableCell — viz kód níže
  ```

- [ ] **Step 1: Vytvoř `page-shell.tsx`**

Nahrazuje `container mx-auto py-10 sm:py-16 px-4 sm:px-8 max-w-6xl` opakované ve 14 souborech.

```tsx
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/**
 * Vnitřní odsazení stránky uvnitř shellu. Šířku drží na jednom místě,
 * ať se stránky nerozjedou jedna od druhé.
 */
export function PageShell({
  children,
  width = "wide",
}: {
  children: ReactNode
  width?: "narrow" | "wide"
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-4 py-8 sm:px-8 sm:py-10",
        width === "wide" ? "max-w-6xl" : "max-w-3xl",
      )}
    >
      {children}
    </div>
  )
}
```

- [ ] **Step 2: Vytvoř `page-header.tsx`**

Přesun z `components/layout/`, ztišený: titulek klesá z `text-6xl` na `text-4xl`, protože hrdinou obrazovky je časová osa, ne nadpis.

```tsx
import type { ReactNode } from "react"

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className="mb-8 flex flex-col gap-4 sm:mb-10 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-2 text-xs font-medium text-muted-foreground">{eyebrow}</p>
        )}
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  )
}
```

- [ ] **Step 3: Vytvoř `stat-tile.tsx`**

Nahrazuje zdvojený `toneClass()` a zdvojený markup dlaždic.

```tsx
import { cn } from "@/lib/utils"

const TONE = {
  neutral: "text-foreground",
  overdue: "text-status-overdue-fg",
  due: "text-status-due-fg",
  upcoming: "text-status-upcoming-fg",
  settled: "text-status-settled-fg",
} as const

export type StatTone = keyof typeof TONE

export function StatTile({
  label,
  value,
  meta,
  tone = "neutral",
}: {
  label: string
  value: string
  meta?: string
  tone?: StatTone
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-5 py-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1.5 font-display text-2xl font-semibold tabular-nums",
          TONE[tone],
        )}
      >
        {value}
      </p>
      {meta && <p className="mt-1 text-xs text-muted-foreground">{meta}</p>}
    </div>
  )
}
```

- [ ] **Step 4: Vytvoř `empty-state.tsx`**

Prázdná obrazovka je vyzvání k akci, ne oznámení o prázdnotě.

```tsx
import type { ReactNode } from "react"

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card px-6 py-16 text-center">
      {icon && <div className="mb-4 flex justify-center text-muted-foreground">{icon}</div>}
      <p className="font-display text-lg font-semibold text-foreground">{title}</p>
      {description && (
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  )
}
```

- [ ] **Step 5: Vytvoř `step-label.tsx`**

Přejmenovaný `SectionLabel`. Používá se **jen tam, kde pořadí nese informaci** — tedy na `/connect`, kde jde o skutečné kroky nastavení.

```tsx
/**
 * Popisek kroku v postupu. Číslo tu smí být jen tehdy, když pořadí něco
 * znamená — jako u nastavení konektoru. Na dashboardu a v seznamech ne.
 */
export function StepLabel({ number, title }: { number: string; title: string }) {
  return (
    <div className="mb-5 flex items-center gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary font-ident text-[11px] text-primary-foreground tabular-nums">
        {number}
      </span>
      <span className="font-display text-base font-semibold text-foreground">{title}</span>
      <span className="h-px flex-1 bg-border" aria-hidden="true" />
    </div>
  )
}
```

- [ ] **Step 6: Vytvoř `data-table.tsx`**

Nahrazuje lokální `Th`/`Td`/`Dash` v `app/invoices/page.tsx`.

```tsx
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export function DataTable({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border">{head}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

export function TableHead({
  children,
  align,
}: {
  children: ReactNode
  align?: "right"
}) {
  return (
    <th
      className={cn(
        "px-4 py-3 text-xs font-medium text-muted-foreground",
        align === "right" ? "text-right" : "text-left",
      )}
    >
      {children}
    </th>
  )
}

export function TableCell({
  children,
  align,
  className,
}: {
  children: ReactNode
  align?: "right"
  className?: string
}) {
  return (
    <td
      className={cn(
        "px-4 py-3 text-sm text-foreground",
        align === "right" && "text-right",
        className,
      )}
    >
      {children}
    </td>
  )
}

/** Prázdná hodnota v tabulce. */
export function Dash() {
  return <span className="text-muted-foreground/40">—</span>
}
```

- [ ] **Step 7: Ověř**

Run: `pnpm typecheck`
Expected: PASS. `components/layout/*` zatím nemaž — stránky na něj ještě odkazují, ruší se v Tasku 12.

- [ ] **Step 8: Commit**

```bash
git add components/patterns
git commit -m "feat(ui): add domain-free pattern layer"
```

---

### Task 6: Komponenty shellu

**Files:**
- Create: `components/app-shell/sidebar.tsx`
- Create: `components/app-shell/nav-items.ts`
- Create: `components/app-shell/topbar.tsx`
- Create: `components/app-shell/user-menu.tsx`
- Test: `tests/design/nav.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // nav-items.ts
  export interface NavItem { href: string; label: string; icon: LucideIcon }
  export const NAV_ITEMS: NavItem[]
  export function isActive(pathname: string, href: string): boolean
  // sidebar.tsx
  export function Sidebar({ email }: { email: string | null })
  // topbar.tsx
  export function Topbar({ title, action }: { title: string; action?: ReactNode })
  ```

- [ ] **Step 1: Napiš padající test na aktivní položku**

Dnešní logika `pathname.startsWith(item.href + "/")` je v `header.tsx` a netestovaná. Vytáhne se a otestuje.

```ts
// tests/design/nav.test.ts
import { describe, expect, it } from "vitest"
import { NAV_ITEMS, isActive } from "@/components/app-shell/nav-items"

describe("zvýraznění aktivní položky", () => {
  it("na přehledu zvýrazní jen přehled", () => {
    expect(isActive("/", "/")).toBe(true)
    expect(isActive("/", "/invoices")).toBe(false)
  })

  it("zvýrazní sekci i na podstránce", () => {
    expect(isActive("/invoices/new", "/invoices")).toBe(true)
    expect(isActive("/invoices/abc/edit", "/invoices")).toBe(true)
  })

  it("nezvýrazní přehled na podstránce", () => {
    expect(isActive("/invoices", "/")).toBe(false)
  })

  it("nesplete si sekce se shodným prefixem", () => {
    expect(isActive("/invoices-archive", "/invoices")).toBe(false)
  })
})

describe("navigace", () => {
  it("vede na všech šest sekcí", () => {
    expect(NAV_ITEMS.map((i) => i.href)).toEqual([
      "/", "/invoices", "/customers", "/activities", "/company", "/connect",
    ])
  })
})
```

- [ ] **Step 2: Spusť test, ověř že padá**

Run: `pnpm vitest run tests/design/nav.test.ts`
Expected: FAIL — modul neexistuje

- [ ] **Step 3: Vytvoř `nav-items.ts`**

Pořadí se mění oproti dnešku: Faktury jdou hned za Přehled, protože to je hlavní denní úkol. Nastavení klesá dolů.

```ts
import { Building2, ClipboardList, FileText, LayoutDashboard, Plug, Users } from "lucide-react"
import type { LucideIcon } from "lucide-react"

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Přehled", icon: LayoutDashboard },
  { href: "/invoices", label: "Faktury", icon: FileText },
  { href: "/customers", label: "Zákazníci", icon: Users },
  { href: "/activities", label: "Aktivity", icon: ClipboardList },
  { href: "/company", label: "Moje údaje", icon: Building2 },
  { href: "/connect", label: "Připojení", icon: Plug },
]

/** Kde se nav položka počítá jako aktivní. Přehled jen přesnou shodou. */
export function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/"
  return pathname === href || pathname.startsWith(`${href}/`)
}
```

- [ ] **Step 4: Vytvoř `sidebar.tsx`**

```tsx
"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { NAV_ITEMS, isActive } from "./nav-items"
import { UserMenu } from "./user-menu"

const STORAGE_KEY = "tf-sidebar-collapsed"

function NavList({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname()

  return (
    <nav className="flex flex-col gap-1 px-3">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon
        const active = isActive(pathname, item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            title={collapsed ? item.label : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              "outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" />
            <span className={cn("truncate", collapsed && "sr-only")}>{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

function Brand({ collapsed }: { collapsed: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2 px-6 py-5">
      <span className="font-display text-lg font-bold text-sidebar-accent-foreground">
        {collapsed ? "T" : "Terky"}
      </span>
      {!collapsed && (
        <span className="font-ident text-[10px] text-sidebar-foreground/60">faktury</span>
      )}
    </Link>
  )
}

export function Sidebar({ email }: { email: string | null }) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(STORAGE_KEY) === "1")
  }, [])

  const toggle = () => {
    setCollapsed((prev) => {
      window.localStorage.setItem(STORAGE_KEY, prev ? "0" : "1")
      return !prev
    })
  }

  return (
    <>
      {/* Mobil — spouštěč v rohu, obsah v Sheetu */}
      <div className="fixed left-3 top-3 z-30 lg:hidden">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon-sm">
              <Menu className="size-4" />
              <span className="sr-only">Otevřít menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[17rem] bg-sidebar p-0">
            <SheetTitle className="sr-only">Hlavní menu</SheetTitle>
            <Brand collapsed={false} />
            <NavList collapsed={false} onNavigate={() => setMobileOpen(false)} />
            <div className="mt-auto p-3">
              <UserMenu email={email} collapsed={false} />
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop — trvalý hřbet */}
      <aside
        style={{
          width: collapsed ? "var(--tf-sidebar-w-collapsed)" : "var(--tf-sidebar-w)",
        }}
        className="fixed inset-y-0 left-0 z-20 hidden shrink-0 flex-col bg-sidebar transition-[width] duration-200 lg:flex"
      >
        <Brand collapsed={collapsed} />
        <NavList collapsed={collapsed} />
        <div className="mt-auto flex flex-col gap-2 p-3">
          <UserMenu email={email} collapsed={collapsed} />
          <Button
            variant="ghost"
            size="sm"
            onClick={toggle}
            aria-label={collapsed ? "Rozbalit menu" : "Sbalit menu"}
            className="justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4" />
            ) : (
              <>
                <PanelLeftClose className="size-4" />
                Sbalit
              </>
            )}
          </Button>
        </div>
      </aside>
    </>
  )
}
```

Poznámka: `sidebar.tsx` čte `--tf-sidebar-w`. To je jediná povolená výjimka z pravidla „komponenty nesahají na primitivy" — je to rozměr shellu, ne barva. Test hranice z Tasku 1 prohledává jen `components/`, takže tuhle výjimku musíš do testu zapsat explicitně:

```ts
    walk("components")
    const allowed = new Set(["components/app-shell/sidebar.tsx"])
    expect(offenders.filter((p) => !allowed.has(p.replaceAll("\\", "/")))).toEqual([])
```

- [ ] **Step 5: Vytvoř `user-menu.tsx`**

```tsx
"use client"

import { LogOut } from "lucide-react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

export function UserMenu({ email, collapsed }: { email: string | null; collapsed: boolean }) {
  const router = useRouter()

  const signOut = async () => {
    await createClient().auth.signOut()
    router.push("/auth/login")
    router.refresh()
  }

  return (
    <div className={cn("rounded-md bg-sidebar-accent/40 p-2", collapsed && "bg-transparent p-0")}>
      {!collapsed && email && (
        <p className="truncate px-1 pb-2 font-ident text-[11px] text-sidebar-foreground/70">
          {email}
        </p>
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={signOut}
        className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        <LogOut className="size-4" />
        <span className={cn(collapsed && "sr-only")}>Odhlásit se</span>
      </Button>
    </div>
  )
}
```

- [ ] **Step 6: Vytvoř `topbar.tsx`**

```tsx
import type { ReactNode } from "react"

export function Topbar({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="sticky top-0 z-10 flex h-14 items-center justify-between gap-4 border-b border-border bg-background/85 px-4 backdrop-blur sm:px-8">
      <p className="truncate pl-10 font-medium text-foreground lg:pl-0">{title}</p>
      {action}
    </div>
  )
}
```

- [ ] **Step 7: Spusť testy**

Run: `pnpm vitest run tests/design && pnpm typecheck`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add components/app-shell tests/design/nav.test.ts
git commit -m "feat(shell): add sidebar navigation and topbar"
```

---

### Task 7: Route groups

Rozdělí stránky se shellem od veřejných. Rozhodnutí přejde z podmínky za běhu (`user && <Header />`) do struktury adresářů.

**Files:**
- Create: `app/(app)/layout.tsx`
- Move: `app/page.tsx`, `app/customers/`, `app/activities/`, `app/company/`, `app/connect/`, `app/oauth/` → `app/(app)/…`
- Move: `app/invoices/{page,new,[id]}` → `app/(app)/invoices/…`; `app/invoices/download/` **zůstává** mimo skupinu
- Modify: `app/layout.tsx`
- Delete: `components/layout/header.tsx`, `components/layout/footer.tsx`

**Interfaces:**
- Consumes: `Sidebar` z Tasku 6.
- Produces: `app/(app)/layout.tsx` obaluje své stránky shellem; kořenový layout už jen `<html>`, písma a `Toaster`.

- [ ] **Step 1: Přesuň stránky do skupiny**

Route group `(app)` se v URL neprojeví — adresy zůstávají stejné.

```bash
mkdir -p "app/(app)"
git mv app/page.tsx "app/(app)/page.tsx"
git mv app/customers "app/(app)/customers"
git mv app/activities "app/(app)/activities"
git mv app/company "app/(app)/company"
git mv app/connect "app/(app)/connect"
git mv app/oauth "app/(app)/oauth"

mkdir -p "app/(app)/invoices"
git mv app/invoices/page.tsx "app/(app)/invoices/page.tsx"
git mv app/invoices/new "app/(app)/invoices/new"
git mv "app/invoices/[id]" "app/(app)/invoices/[id]"
# app/invoices/download/ zůstává — je veřejná a shell mít nesmí
```

- [ ] **Step 2: Ověř, že veřejné cesty zůstaly**

```bash
ls app/invoices/download/\[publicId\]/page.tsx
ls app/auth
```
Expected: obojí existuje mimo `(app)`

- [ ] **Step 3: Vytvoř `app/(app)/layout.tsx`**

```tsx
import type { ReactNode } from "react"

import { Sidebar } from "@/components/app-shell/sidebar"
import { createClient } from "@/lib/supabase/server"

/**
 * Shell pro přihlášenou část aplikace. Nepřihlášené sem proxy nepustí,
 * takže se tu na uživatele nemusí ptát podmínkou — stačí e-mail do menu.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <div className="min-h-screen">
      <Sidebar email={user?.email ?? null} />
      <div className="lg:pl-[var(--tf-sidebar-w)]">{children}</div>
    </div>
  )
}
```

Poznámka: sbalený sidebar mění šířku na klientu, ale odsazení obsahu je v CSS pevné. To je vědomý ústupek — jinak by layout musel být klientská komponenta a přišel by o serverové načtení uživatele. Sbalení tedy zužuje jen hřbet; obsah drží šířku. Pokud to bude po vizuální kontrole rušit, řeš v Tasku 14.

- [ ] **Step 4: Zjednoduš kořenový layout**

`app/layout.tsx` už neřeší navigaci — jen dokument, písma a toasty.

```tsx
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="cs">
      <body
        className={`font-sans ${inter.variable} ${bricolage.variable} ${plexMono.variable} min-h-screen`}
      >
        {children}
        <Toaster />
        <Analytics />
      </body>
    </html>
  )
}
```

Odstraň importy `Header`, `Footer`, `createClient`, `Suspense` a `async` z funkce.

- [ ] **Step 5: Smaž starý shell**

```bash
git rm components/layout/header.tsx components/layout/footer.tsx
```

- [ ] **Step 6: Ověř build a URL**

Run: `pnpm typecheck && pnpm build`
Expected: PASS. Ve výpisu tras zkontroluj, že `(app)` **není** v žádné adrese a že `/invoices/download/[publicId]` i `/auth/login` dál existují.

- [ ] **Step 7: Commit**

```bash
git add -A app components/layout
git commit -m "refactor(shell): split authenticated pages from public ones"
```

---

### Task 8: Časová osa splatnosti

Signature prvek. Jediná ozdoba v celém návrhu.

**Files:**
- Create: `components/invoices/due-timeline.tsx`

**Interfaces:**
- Consumes: `buildDueSchedule`, `axisPosition` z Tasku 3.
- Produces: `DueTimeline({ invoices, today }: { invoices: TimelineInvoice[]; today: Date })` kde `TimelineInvoice = { id: string; invoice_number: string; total: number; due_date: string; paid_date: string | null; customer?: { name: string } | null }`

- [ ] **Step 1: Vytvoř komponentu**

```tsx
import Link from "next/link"

import { axisPosition, buildDueSchedule } from "@/lib/services/due-schedule"
import type { DueBucket } from "@/lib/services/due-schedule"
import { cn, formatCurrency, formatDate } from "@/lib/utils"

export interface TimelineInvoice {
  id: string
  invoice_number: string
  total: number
  due_date: string
  paid_date: string | null
  customer?: { name: string } | null
}

const MARK: Record<DueBucket, string> = {
  overdue: "bg-status-overdue-line",
  due: "bg-status-due-line",
  upcoming: "bg-status-upcoming-line",
}

const BUCKET_LABEL: Record<DueBucket, string> = {
  overdue: "Po splatnosti",
  due: "Tento týden",
  upcoming: "Později",
}

/**
 * Časová osa splatnosti.
 *
 * V tomhle dómenu je vzdálenost od dneška jediná skutečná posloupnost, takže
 * strukturu nese ona — ne číslované sekce. Vlevo od značky DNES je po
 * splatnosti, vpravo to, co teprve přijde.
 *
 * Na úzkých obrazovkách se osa nezmenšuje, ale mění na tři sloupce. Vodorovné
 * scrollování by z ní udělalo hádanku.
 */
export function DueTimeline({
  invoices,
  today,
}: {
  invoices: TimelineInvoice[]
  today: Date
}) {
  const schedule = buildDueSchedule(invoices, today)
  const all = [...schedule.overdue, ...schedule.due, ...schedule.upcoming]

  if (all.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card px-6 py-10 text-center">
        <p className="font-display text-lg font-semibold text-foreground">
          Nikdo ti nic nedluží.
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Všechny vystavené faktury jsou zaplacené.
        </p>
      </div>
    )
  }

  const todayPos = axisPosition(0, schedule.span)

  return (
    <section aria-label="Časová osa splatnosti" className="rounded-lg border border-border bg-card">
      {/* Osa — od tabletu nahoru */}
      <div className="hidden px-6 pb-4 pt-6 sm:block">
        <div className="relative h-24">
          <div className="absolute inset-x-0 top-12 h-px bg-border" aria-hidden="true" />

          <div
            className="absolute top-6 flex -translate-x-1/2 flex-col items-center"
            style={{ left: `${todayPos * 100}%` }}
          >
            <span className="font-ident text-[10px] text-muted-foreground">DNES</span>
            <span className="mt-1 h-12 w-px bg-foreground/40" aria-hidden="true" />
          </div>

          {all.map((entry) => (
            <Link
              key={entry.item.id}
              href={`/invoices/${entry.item.id}/view`}
              style={{ left: `${axisPosition(entry.daysFromToday, schedule.span) * 100}%` }}
              className="group absolute top-12 -translate-x-1/2 -translate-y-1/2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className={cn("block size-3 rounded-full ring-2 ring-card", MARK[entry.bucket])} />
              <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs text-background group-hover:block group-focus-visible:block">
                {entry.item.invoice_number} · {formatCurrency(entry.item.total)} ·{" "}
                {formatDate(entry.item.due_date)}
              </span>
            </Link>
          ))}
        </div>
      </div>

      {/* Sbalené sloupce — mobil i legenda na širokých */}
      <div className="grid grid-cols-3 divide-x divide-border border-t border-border sm:border-t">
        {(["overdue", "due", "upcoming"] as const).map((bucket) => {
          const entries = schedule[bucket]
          const sum = entries.reduce((acc, e) => acc + e.item.total, 0)
          return (
            <div key={bucket} className="px-4 py-4">
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className={cn("size-2 rounded-full", MARK[bucket])} aria-hidden="true" />
                {BUCKET_LABEL[bucket]}
              </span>
              <p className="mt-1.5 font-display text-xl font-semibold tabular-nums text-foreground">
                {formatCurrency(sum)}
              </p>
              <p className="text-xs text-muted-foreground">
                {entries.length} {entries.length === 1 ? "faktura" : entries.length < 5 ? "faktury" : "faktur"}
              </p>
            </div>
          )
        })}
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Ověř**

Run: `pnpm typecheck && pnpm vitest run`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add components/invoices/due-timeline.tsx
git commit -m "feat(invoices): add due-date timeline"
```

---

### Task 9: Dashboard

**Files:**
- Modify: `app/(app)/page.tsx` (celý přepis)

**Interfaces:**
- Consumes: `DueTimeline` (Task 8), `PageShell`/`PageHeader`/`StatTile`/`EmptyState` (Task 5), `Topbar` (Task 6).

- [ ] **Step 1: Přepiš stránku**

Zaniká: `toneClass()`, `SectionLabel` s čísly 01/02/03, `ActionPanel` s obřími nadpisy. Hrdinou je osa.

```tsx
import Link from "next/link"
import { FileText, Plus, Users } from "lucide-react"

import { Topbar } from "@/components/app-shell/topbar"
import { DueTimeline } from "@/components/invoices/due-timeline"
import { PageShell } from "@/components/patterns/page-shell"
import { StatTile } from "@/components/patterns/stat-tile"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/server"
import { formatCurrency } from "@/lib/utils"

export default async function HomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: invoices }, { count: customerCount }] = await Promise.all([
    supabase
      .from("invoices")
      .select("id, invoice_number, total, due_date, paid_date, customer:customers(name)")
      .eq("user_id", user.id)
      .order("due_date", { ascending: true }),
    supabase
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
  ])

  const rows = invoices ?? []
  const today = new Date()
  const unpaid = rows.filter((r) => !r.paid_date)
  const paid = rows.filter((r) => r.paid_date)

  return (
    <>
      <Topbar
        title="Přehled"
        action={
          <Button asChild size="sm">
            <Link href="/invoices/new">
              <Plus className="size-4" />
              Nová faktura
            </Link>
          </Button>
        }
      />
      <PageShell>
        <h1 className="mb-6 font-display text-2xl font-semibold tracking-tight text-foreground">
          Vítej zpátky, Terko.
        </h1>

        <DueTimeline invoices={rows} today={today} />

        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            label="Čeká na platbu"
            value={formatCurrency(unpaid.reduce((s, r) => s + r.total, 0))}
            meta={`${unpaid.length} nezaplacených`}
            tone="due"
          />
          <StatTile
            label="Zaplaceno celkem"
            value={formatCurrency(paid.reduce((s, r) => s + r.total, 0))}
            meta={`${paid.length} faktur`}
            tone="settled"
          />
          <StatTile label="Faktur celkem" value={String(rows.length)} />
          <StatTile label="Zákazníků" value={String(customerCount ?? 0)} />
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/invoices">
              <FileText className="size-4" />
              Všechny faktury
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/customers/new">
              <Users className="size-4" />
              Přidat zákazníka
            </Link>
          </Button>
        </div>
      </PageShell>
    </>
  )
}
```

- [ ] **Step 2: Ověř**

Run: `pnpm typecheck && pnpm build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/page.tsx"
git commit -m "feat(dashboard): lead with the due-date timeline"
```

---

### Task 10: Seznam faktur

**Files:**
- Modify: `app/(app)/invoices/page.tsx` (celý přepis)
- Modify: `tests/design/status-colors.test.ts` (zapnout `walk("app")`)

- [ ] **Step 1: Přepiš stránku**

Zaniká lokální `Th`/`Td`/`Dash`/`SectionLabelInline` i druhá kopie `toneClass()`. Zachovej beze změny: filtrování přes `searchParams.status`, `invoiceStatus()`, `InvoiceActions`, hranu řádku u faktur po splatnosti.

```tsx
import Link from "next/link"
import { FileText, Plus } from "lucide-react"

import { Topbar } from "@/components/app-shell/topbar"
import { InvoiceActions } from "@/components/invoices/invoice-actions"
import { InvoiceFilters } from "@/components/invoices/invoice-filters"
import { InvoiceStatusBadge } from "@/components/invoices/invoice-status-badge"
import { DataTable, Dash, TableCell, TableHead } from "@/components/patterns/data-table"
import { EmptyState } from "@/components/patterns/empty-state"
import { PageHeader } from "@/components/patterns/page-header"
import { PageShell } from "@/components/patterns/page-shell"
import { StatTile } from "@/components/patterns/stat-tile"
import { Button } from "@/components/ui/button"
import { DateTimeDisplay } from "@/components/ui/date-time-display"
import { createClient } from "@/lib/supabase/server"
import { invoiceStatus } from "@/lib/services/invoices"
import { cn, formatCurrency, formatDate } from "@/lib/utils"

const FILTER_LABEL: Record<string, string> = {
  paid: "Zaplacené",
  unpaid: "Nezaplacené",
  overdue: "Po splatnosti",
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  let query = supabase
    .from("invoices")
    .select("*, customer:customers(name, email)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })

  if (params.status === "paid") query = query.not("paid_date", "is", null)
  else if (params.status === "unpaid") query = query.is("paid_date", null)
  else if (params.status === "overdue") {
    query = query.is("paid_date", null).lt("due_date", new Date().toISOString().split("T")[0])
  }

  const [{ data: invoices, error }, { data: allInvoices }] = await Promise.all([
    query,
    supabase.from("invoices").select("total, paid_date, due_date").eq("user_id", user.id),
  ])

  if (error) console.error("[invoices] load failed:", error)

  const all = allInvoices ?? []
  const paid = all.filter((i) => i.paid_date)
  const unpaid = all.filter((i) => !i.paid_date)
  const overdue = unpaid.filter((i) => invoiceStatus(i) === "overdue")
  const rows = invoices ?? []

  return (
    <>
      <Topbar
        title="Faktury"
        action={
          <Button asChild size="sm">
            <Link href="/invoices/new">
              <Plus className="size-4" />
              Nová faktura
            </Link>
          </Button>
        }
      />
      <PageShell>
        <PageHeader
          eyebrow={params.status ? FILTER_LABEL[params.status] : undefined}
          title="Faktury"
          description="Vystavuj, sleduj a posílej faktury zákazníkům."
        />

        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            label="Celkem"
            value={String(all.length)}
            meta={formatCurrency(all.reduce((s, i) => s + i.total, 0))}
          />
          <StatTile
            label="Zaplaceno"
            value={String(paid.length)}
            meta={formatCurrency(paid.reduce((s, i) => s + i.total, 0))}
            tone="settled"
          />
          <StatTile
            label="Nezaplaceno"
            value={String(unpaid.length)}
            meta={formatCurrency(unpaid.reduce((s, i) => s + i.total, 0))}
            tone="due"
          />
          <StatTile
            label="Po splatnosti"
            value={String(overdue.length)}
            meta={overdue.length > 0 ? "Vyžaduje pozornost" : "Vše v pořádku"}
            tone={overdue.length > 0 ? "overdue" : "neutral"}
          />
        </div>

        <div className="mb-4 flex justify-end">
          <InvoiceFilters currentStatus={params.status} />
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={<FileText className="size-8" />}
            title={params.status ? "Pro tenhle filtr tu nic není." : "Zatím žádné faktury."}
            description="Vystav první fakturu a objeví se tady i na časové ose."
            action={
              <Button asChild>
                <Link href="/invoices/new">
                  <Plus className="size-4" />
                  Vystavit fakturu
                </Link>
              </Button>
            }
          />
        ) : (
          <DataTable
            head={
              <>
                <TableHead>Číslo</TableHead>
                <TableHead>Zákazník</TableHead>
                <TableHead>Vystavena</TableHead>
                <TableHead>Splatná</TableHead>
                <TableHead>Odesláno</TableHead>
                <TableHead align="right">Částka</TableHead>
                <TableHead>Stav</TableHead>
                <TableHead align="right">Akce</TableHead>
              </>
            }
          >
            {rows.map((invoice) => {
              const status = invoiceStatus(invoice)
              return (
                <tr
                  key={invoice.id}
                  className={cn(
                    "border-b border-border/60 last:border-0",
                    status === "overdue" && "border-l-2 border-l-status-overdue-line",
                  )}
                >
                  <TableCell>
                    <Link
                      href={`/invoices/${invoice.id}/view`}
                      className="font-ident text-sm text-foreground hover:text-primary"
                    >
                      {invoice.invoice_number}
                    </Link>
                  </TableCell>
                  <TableCell>{invoice.customer?.name || <Dash />}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(invoice.issue_date)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(invoice.due_date)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {invoice.email_sent_at ? (
                      <DateTimeDisplay date={invoice.email_sent_at} />
                    ) : (
                      <Dash />
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <span className="font-display font-semibold tabular-nums">
                      {formatCurrency(invoice.total)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <InvoiceStatusBadge status={status} />
                  </TableCell>
                  <TableCell align="right">
                    <InvoiceActions
                      invoiceId={invoice.id}
                      isPaid={!!invoice.paid_date}
                      customerEmail={invoice.customer?.email}
                    />
                  </TableCell>
                </tr>
              )
            })}
          </DataTable>
        )}
      </PageShell>
    </>
  )
}
```

- [ ] **Step 2: Zapni kontrolu barev nad `app/`**

V `tests/design/status-colors.test.ts` odkomentuj `walk("app")`.

- [ ] **Step 3: Ověř**

Run: `pnpm vitest run tests/design && pnpm typecheck && pnpm build`
Expected: PASS. Pokud test hlásí další soubory, oprav je v Tasku 11/12.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/invoices/page.tsx" tests/design/status-colors.test.ts
git commit -m "refactor(invoices): rebuild list on the pattern layer"
```

---

### Task 11: Zákazníci a aktivity

**Files:**
- Modify: `app/(app)/customers/page.tsx`
- Modify: `app/(app)/activities/page.tsx`
- Modify: `app/(app)/activities/[clientId]/page.tsx`

- [ ] **Step 1: Převeď obě stránky na vrstvu patterns**

Pro každou: obal do `<Topbar title=… action=… />` + `<PageShell>`, nahraď `container mx-auto …`, `PageHeader` importuj z `@/components/patterns/page-header`, prázdné stavy nahraď `EmptyState`, seznamy nech jako `ul`/`DataTable` podle toho, co tam je dnes. Ztlum titulky — `PageHeader` už je menší sám o sobě, takže stačí odstranit `<span className="text-primary">` obalení v titulcích.

Konkrétně u `customers/page.tsx` nahraď blok prázdného stavu:

```tsx
<EmptyState
  icon={<Users className="size-8" />}
  title="Zatím žádní zákazníci."
  description="Přidej prvního zákazníka, ať ho máš po ruce při vystavování faktur."
  action={
    <Button asChild>
      <Link href="/customers/new">
        <Plus className="size-4" />
        Přidat zákazníka
      </Link>
    </Button>
  }
/>
```

- [ ] **Step 2: Ověř**

Run: `pnpm vitest run tests/design && pnpm typecheck && pnpm build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/customers" "app/(app)/activities"
git commit -m "refactor(customers,activities): move pages onto the pattern layer"
```

---

### Task 12: Formuláře, Moje údaje a Připojení

**Files:**
- Modify: `app/(app)/company/page.tsx`, `app/(app)/connect/page.tsx`
- Modify: `app/(app)/invoices/new/page.tsx`, `app/(app)/invoices/[id]/edit/page.tsx`, `app/(app)/invoices/[id]/view/page.tsx`
- Modify: `app/(app)/customers/new/page.tsx`, `app/(app)/customers/[id]/edit/page.tsx`
- Modify: `app/(app)/activities/[clientId]/new/page.tsx`, `app/(app)/activities/[clientId]/[activityId]/edit/page.tsx`
- Delete: `components/layout/` (celý adresář)

- [ ] **Step 1: Převeď zbývající stránky**

Stejný postup jako Task 11. Formulářové stránky použij `<PageShell width="narrow">`.

- [ ] **Step 2: Na `/connect` zachovej číslování**

`SectionLabel` nahraď `StepLabel` ze `@/components/patterns/step-label` — **čísla zůstávají**, protože tady jde o skutečné kroky nastavení v pořadí. To je jediné místo v aplikaci, kde číslování něco znamená.

```tsx
import { StepLabel } from "@/components/patterns/step-label"
// …
<StepLabel number="01" title="Adresa serveru" />
```

- [ ] **Step 3: Smaž prázdný adresář**

```bash
git rm -r components/layout
```

- [ ] **Step 4: Ověř, že nikde nezůstal starý import**

Run: `grep -rn "components/layout" app components`
Expected: žádný výstup

- [ ] **Step 5: Ověř**

Run: `pnpm vitest run && pnpm typecheck && pnpm build`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A app components
git commit -m "refactor(pages): finish move to the pattern layer"
```

---

### Task 13: Vrstvy místo `!important`

**Files:**
- Modify: `components/ui/sheet.tsx`, `components/ui/dropdown-menu.tsx`, `components/ui/alert-dialog.tsx`, `components/ui/select.tsx`

**Interfaces:**
- Consumes: `--tf-layer-*` z Tasku 1.

- [ ] **Step 1: Dej overlayům vlastní neprůhledné pozadí**

Příčinou osmi `!important` záplat bylo, že primitivy spoléhaly na tokeny, které v `:root` chyběly. Teď existují, takže stačí je použít přímo v komponentách.

V každém ze čtyř souborů:
- na `*-overlay` nastav `bg-foreground/50` a `style={{ zIndex: "var(--tf-layer-overlay)" }}`
- na `*-content` nastav `bg-popover text-popover-foreground` a `style={{ zIndex: "var(--tf-layer-dialog)" }}` (u `dropdown-menu` a `select` použij `var(--tf-layer-dropdown)`)

- [ ] **Step 2: Ověř, že záplaty jsou pryč**

Run: `pnpm vitest run tests/design/tokens.test.ts`
Expected: PASS — test `nemá v globals.css žádnou !important záplatu` prochází

- [ ] **Step 3: Vizuálně ověř překryvy**

Spusť `pnpm dev` a projdi:
- `/customers` → smazat zákazníka (alert-dialog musí být neprůhledný)
- `/invoices/new` → rozbalit select zákazníka (nesmí prosvítat)
- šířka 375 px → otevřít menu (sheet musí překrýt obsah)

- [ ] **Step 4: Commit**

```bash
git add components/ui
git commit -m "fix(ui): replace z-index patches with a layer scale"
```

---

### Task 14: Závěrečná kontrola

**Files:**
- Modify: `CLAUDE.md`
- Modify: podle nálezů

- [ ] **Step 1: Plná brána**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: PASS

- [ ] **Step 2: Vizuální průchod**

`pnpm dev`, projdi všech šest sekcí na šířkách 1440 px a 375 px. Kontroluj:
- sidebar se sbaluje a stav přežije reload
- na mobilu je menu v Sheetu a spouštěč nepřekrývá obsah
- časová osa nemá vodorovné scrollování na 375 px
- `Tab` prochází navigací a fokus je vidět

- [ ] **Step 3: Ověř veřejné cesty**

Odhlas se a otevři `/auth/login` a `/invoices/download/<publicId>` — ani jedna nesmí mít sidebar a obě musí být dostupné bez přihlášení.

- [ ] **Step 4: Aktualizuj `CLAUDE.md`**

Sekce `### UI` už neplatí. Přepiš ji na tři vrstvy komponent a dvě vrstvy tokenů, zmiň `styles/tokens.css` jako jediný zdroj pravdy a route group `(app)`. Odstraň zmínku o dark mode, pokud tam je.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: describe the token and component layers"
```

---

## Self-review

**Pokrytí specu.** Tokeny → Task 1. Písma → Task 1. Teplotní škála → Task 1 + 4. Sidebar → Task 6. Route groups a stránky bez shellu → Task 7. Signature osa → Task 3 + 8. `patterns/` → Task 5. Zrušení falešného číslování a zachování skutečného na `/connect` → Task 5 + 12. Peníze `cs-CZ` → Task 2. `!important` → Task 1 + 13. Dark mode pryč → Task 1. Brána → každý task, plná v Tasku 14.

**Konzistence typů.** `buildDueSchedule` / `axisPosition` / `DueSchedule` / `DueBucket` z Tasku 3 se v Tasku 8 používají pod stejnými názvy. `StatTone` z Tasku 5 pokrývá hodnoty `tone`, které předávají Tasky 9–11. `NavItem` / `isActive` z Tasku 6 sedí na test v témže tasku.

**Známé napětí.** Test hranice tokenů z Tasku 1 se v Tasku 6 rozšiřuje o výjimku pro `sidebar.tsx` (rozměr, ne barva) a v Tasku 10 o `walk("app")`. Obojí je v plánu zapsané v místě, kde k tomu dojde — ne jako dodatečná oprava.

**Vědomý ústupek.** Sbalený sidebar nemění odsazení obsahu (Task 7, krok 3). Alternativa by udělala z layoutu klientskou komponentu a přišla by o serverové načtení uživatele.
