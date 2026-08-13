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
    // walk("app") — zapnout v Tasku 10, až zmizí toneClass()
    expect(offenders).toEqual([])
  })
})
