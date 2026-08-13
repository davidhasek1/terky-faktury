import { readFileSync } from "node:fs"
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
// Scoped to sheet.tsx only for now. dropdown-menu.tsx, alert-dialog.tsx and
// select.tsx still carry the same patches (verified: they also contain
// `!bg-`/`!text-`/`!border-` and hardcoded hex/rgba in inline styles) — a
// later task is expected to clean those up and can widen FILES below.
const FILES = ["components/ui/sheet.tsx"]

const IMPORTANT_COLOR_UTILITY = /!(?:bg|text|border)-[\w-]+/
const HARDCODED_STYLE_COLOR = /style=\{\{[^}]*(#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\))[^}]*\}\}/

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
})
