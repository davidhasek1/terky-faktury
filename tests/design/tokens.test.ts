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
    const patchLines = globals
      .split("\n")
      .filter((l) => l.includes("!important") && !l.match(/animation|transition/))
    expect(patchLines).toEqual([])
  })

  it("neobsahuje mrtvý dark mode", () => {
    expect(globals).not.toContain(".dark")
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
