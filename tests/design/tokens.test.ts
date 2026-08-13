import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const tokens = readFileSync("styles/tokens.css", "utf8")
const semantic = readFileSync("styles/semantic.css", "utf8")
const globals = readFileSync("app/globals.css", "utf8")

function declaredNames(css: string): string[] {
  return [...css.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((m) => m[1])
}

function themeInlineBlock(css: string): string {
  const match = css.match(/@theme\s+inline\s*\{([\s\S]*?)\n\}/)
  if (!match) throw new Error("@theme inline blok nenalezen v app/globals.css")
  return match[1]
}

const SKIP_DIRS = new Set(["node_modules", ".next"])

/** Projde components/, app/ a lib/ a vrátí soubory, na které sedí `filter`. */
function scanSourceDirs(filter: (content: string) => boolean): string[] {
  const offenders: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (SKIP_DIRS.has(entry)) continue
      const path = join(dir, entry)
      if (statSync(path).isDirectory()) {
        walk(path)
      } else if (/\.tsx?$/.test(path) && filter(readFileSync(path, "utf8"))) {
        offenders.push(path)
      }
    }
  }
  for (const dir of ["components", "app", "lib"]) walk(dir)
  return offenders
}

// Tokeny, které existují jen jako strukturální CSS proměnná — čtou se přímo
// přes var(--jméno) v inline stylu (z-index) nebo v arbitrary Tailwind
// hodnotě (šířka shellu), nikdy jako Tailwind třída typu bg-*/text-*. Nemají
// tedy co dělat v @theme inline a nepatří do bijekce níž.
const STRUCTURAL_ONLY_TOKENS = new Set([
  "--layer-dropdown",
  "--layer-overlay",
  "--layer-dialog",
  "--layer-toast",
  "--sidebar-width",
  "--sidebar-width-collapsed",
])

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

  it("nemá žádnou !important záplatu — ani v globals.css, ani v komponentách", () => {
    // Osm !important záplat, který tenhle test připomíná, žilo v
    // components/ui/* (viz fbca046), ne v globals.css — sken jen
    // globals.css by je tedy nikdy nechytil.
    const globalOffenders = globals
      .split("\n")
      .filter((l) => l.includes("!important") && !l.match(/animation|transition/))
    const componentOffenders = scanSourceDirs((c) => c.includes("!important"))
    expect([...globalOffenders, ...componentOffenders]).toEqual([])
  })

  it("neobsahuje mrtvý dark mode — ani .dark v CSS, ani dark: varianty v komponentách", () => {
    expect(globals).not.toContain(".dark")
    // Co v projektu skutečně existovalo, byly dark: varianty roztroušené
    // po komponentách (viz cac2859) — kontrola jen globals.css by to
    // nezachytila.
    const offenders = scanSourceDirs((c) => /\bdark:[\w-]/.test(c))
    expect(offenders).toEqual([])
  })

  it("mapuje každý mapovatelný sémantický token do @theme, jinak Tailwind třída potichu nic nevyrenderuje", () => {
    // Přidej sémantický token, zapomeň řádek `--color-*: var(--token)`
    // v @theme inline, a bg-<token> v CSS prostě neexistuje — Tailwind ji
    // tiše vynechá, žádná chyba. Přesně tohle je bg-highlight bug, na
    // který tenhle projekt dřív narazil.
    const theme = themeInlineBlock(globals)
    const mappable = declaredNames(semantic).filter((n) => !STRUCTURAL_ONLY_TOKENS.has(n))
    const unmapped = mappable.filter((n) => !theme.includes(`var(${n})`))
    expect(unmapped).toEqual([])
  })

  it("pokrývá celou teplotní škálu stavů", () => {
    for (const status of ["overdue", "due", "upcoming", "settled"]) {
      for (const role of ["fg", "bg", "line"]) {
        expect(semantic).toContain(`--status-${status}-${role}`)
      }
    }
  })
})

describe("hranice tokenů", () => {
  it("nedovolí komponentám sáhnout na primitivní token", () => {
    const offenders = scanSourceDirs((c) => c.includes("--tf-"))
    expect(offenders).toEqual([])
  })
})
