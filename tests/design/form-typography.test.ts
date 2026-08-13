import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Hlídač verzálkového stylu.
 *
 * Redesign nahradil drobné prostrkané verzálky (`text-[10px] uppercase
 * tracking-[0.22em]`) normální typografií. Přežily ale ve formulářích, které
 * přepis stránek minul — popisky polí, tlačítka, filtry — a v šestnácti
 * souborech se to samo vracelo do nové práce jako vzor k okopírování.
 *
 * Test hlídá jen tuhle konkrétní kombinaci. Samotné `uppercase` je legitimní
 * (zkratky, `IBAN`), stejně jako `tracking-tight` u velkých nadpisů. Zakázané
 * je jen prostrkání zadané v `em` u textu, protože přesně tak vypadal starý
 * editorial styl.
 */
const OLD_EDITORIAL_STYLE = /uppercase[^"'`]*tracking-\[[\d.]+em\]|tracking-\[[\d.]+em\][^"'`]*uppercase/

const SKIP_DIRS = new Set(["node_modules", ".next", "dist"])

function walk(dir: string, hits: string[]): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      walk(path, hits)
      continue
    }
    if (!/\.tsx?$/.test(path)) continue

    const source = readFileSync(path, "utf8")
    source.split("\n").forEach((line, index) => {
      if (OLD_EDITORIAL_STYLE.test(line)) {
        hits.push(`${path}:${index + 1}`)
      }
    })
  }
  return hits
}

describe("typografie formulářů", () => {
  it("nikde nepoužívá prostrkané verzálky z původního editorial stylu", () => {
    const offenders = walk("components", walk("app", []))
    expect(offenders).toEqual([])
  })
})

describe("stavy tlačítek při mutacích", () => {
  it("nepřepisuje popisek tlačítka během ukládání", () => {
    // Tlačítko se má jmenovat stejně celou cestu — spinner řeší `loading`.
    // Přepis na „Ukládám…" mění šířku tlačítka pod kurzorem a popisek
    // přestane pojmenovávat akci.
    const offenders: string[] = []
    const walkForSwaps = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        if (SKIP_DIRS.has(entry)) continue
        const path = join(dir, entry)
        if (statSync(path).isDirectory()) {
          walkForSwaps(path)
          continue
        }
        if (!/\.tsx$/.test(path)) continue

        const source = readFileSync(path, "utf8")
        source.split("\n").forEach((line, index) => {
          if (/\{\s*is\w+\s*\?\s*["'][^"']*[….]{1,3}["']\s*:/.test(line)) {
            offenders.push(`${path}:${index + 1}`)
          }
        })
      }
    }
    walkForSwaps("app")
    walkForSwaps("components")
    expect(offenders).toEqual([])
  })
})
