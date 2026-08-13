import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// components/ui/sheet.tsx used to hardcode a white background via Tailwind's
// `!`-prefixed important utility (`!bg-white`) and via raw hex/rgba literals
// inside a React inline `style={{ ... }}` object. Both shapes bypass the
// token system completely — they don't go through styles/tokens.css or
// styles/semantic.css at all — so tests/design/tokens.test.ts (which only
// scans app/globals.css for `!important` and components/**, app/**, lib/**
// for `--tf-` primitive references) could not see either of them. That gap
// let the mobile sidebar drawer render white instead of the dark "ink spine"
// sidebar background, because the inline hex/`!important` beat the
// `bg-sidebar` className passed in from the caller.
//
// Walks all of components/ui/ instead of a hardcoded file list — a
// hardcoded list previously missed a plain `bg-white` in select.tsx even
// though the file was already on the list, because the pattern only looked
// for the `!`-prefixed form.
const UI_DIR = "components/ui"

function walkTsx(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...walkTsx(path))
    else if (/\.tsx?$/.test(entry.name)) files.push(path)
  }
  return files
}

const FILES = walkTsx(UI_DIR)

const IMPORTANT_COLOR_UTILITY = /!(?:bg|text|border)-[\w-]+/
const HARDCODED_STYLE_COLOR = /style=\{\{[^}]*(#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\))[^}]*\}\}/
const WHITE_OR_BLACK_UTILITY = /\b(?:bg|text)-(?:white|black)\b/
const HARDCODED_SHADOW = /shadow-\[[^\]]*rgba?\(/

describe("barvy v UI primitivech (components/ui)", () => {
  it("nepoužívá !-prefixované Tailwind barvy (!bg-, !text-, !border-)", () => {
    const offenders = FILES.filter((file) => IMPORTANT_COLOR_UTILITY.test(readFileSync(file, "utf8")))
    expect(
      offenders,
      "!-prefixovaná utilita obchází vrstvu tokenů a vyhraje nad barvou, kterou předá volající komponenta (viz bg-sidebar v mobilním Sheetu) — použij sémantický token (např. bg-popover) jako výchozí a nech volajícího ho přebít přes className.",
    ).toEqual([])
  })

  it("nemá natvrdo zapsanou hex/rgba barvu v inline style", () => {
    const offenders = FILES.filter((file) => HARDCODED_STYLE_COLOR.test(readFileSync(file, "utf8")))
    expect(
      offenders,
      "hex/rgba barva v inline style={{ ... }} má vyšší prioritu než jakákoli Tailwind třída a obchází vrstvu tokenů úplně — nahraď ji sémantickou barevnou třídou (bg-*, text-*) na className.",
    ).toEqual([])
  })

  it("nepoužívá natvrdo bg-white/bg-black/text-white/text-black", () => {
    const offenders = FILES.filter((file) => WHITE_OR_BLACK_UTILITY.test(readFileSync(file, "utf8")))
    expect(
      offenders,
      "bg-white/bg-black/text-white/text-black obchází sémantickou vrstvu — použij bg-card, bg-popover, text-foreground nebo *-foreground párový token podle pozadí, na kterém text sedí.",
    ).toEqual([])
  })

  it("nemá ručně psaný rgba() stín v arbitrary shadow-[...]", () => {
    const offenders = FILES.filter((file) => HARDCODED_SHADOW.test(readFileSync(file, "utf8")))
    expect(
      offenders,
      "ručně psaný rgba() stín obchází --tf-shadow-sm/--tf-shadow-md — použij shadow-sm/shadow-md (mapované v @theme inline ze sémantické vrstvy).",
    ).toEqual([])
  })
})
