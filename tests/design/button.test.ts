import { createElement } from "react"
import { Slot } from "@radix-ui/react-slot"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { Button } from "@/components/ui/button"

/**
 * Regrese, kterou zavedlo přidání `loading` do tlačítka.
 *
 * Původní verze vykreslovala `{showSpinner && <Loader2 />}{children}` i ve
 * větvi `asChild`. I když byl výraz nepravdivý, React z toho udělal pole
 * `[false, children]` — a Radix `Slot` přijímá právě jedno dítě. Spadlo tím
 * každé `<Button asChild>` v aplikaci, tedy i dashboard a všechny prázdné
 * stavy. Typecheck ani build to nechytily, protože je to chyba za běhu.
 *
 * Testy renderují na server, takže nepotřebují DOM.
 */
describe("Button", () => {
  it("propustí potomka v režimu asChild, aniž by rozbil Slot", () => {
    const html = renderToStaticMarkup(
      createElement(
        Button,
        { asChild: true },
        createElement("a", { href: "/faktury" }, "Všechny faktury"),
      ),
    )

    expect(html).toContain("<a")
    expect(html).toContain("Všechny faktury")
  })

  it("v režimu asChild nevkládá spinner ani při loading", () => {
    // Slot by na dvou dětech spadl; `loading` tu proto nesmí nic přidat.
    const html = renderToStaticMarkup(
      createElement(
        Button,
        { asChild: true, loading: true },
        createElement("a", { href: "/faktury" }, "Všechny faktury"),
      ),
    )

    expect(html).toContain("Všechny faktury")
    expect(html).not.toContain("animate-spin")
  })

  it("při ukládání ukáže spinner a nechá popisek být", () => {
    const html = renderToStaticMarkup(
      createElement(Button, { loading: true }, "Uložit změny"),
    )

    expect(html).toContain("Uložit změny")
    expect(html).toContain("animate-spin")
    expect(html).toContain("disabled")
    expect(html).toContain('aria-busy="true"')
  })

  it("nepropustí `loading` na DOM jako atribut", () => {
    // React by jinak hlásil: Received `false` for a non-boolean attribute.
    for (const loading of [true, false]) {
      const html = renderToStaticMarkup(
        createElement(Button, { loading }, "Uložit"),
      )
      expect(html).not.toContain("loading=")
    }
  })

  it("nepropustí `loading` ani uvnitř Slotu, jako v potvrzovacím dialogu", () => {
    // AlertDialogAction s `asChild` obaluje tlačítko Slotem a slévá do něj
    // svoje props. Tahle skladba je v aplikaci u každého mazání.
    for (const loading of [true, false]) {
      const html = renderToStaticMarkup(
        createElement(
          Slot,
          {},
          createElement(Button, { loading, variant: "destructive" }, "Smazat"),
        ),
      )
      expect(html).not.toContain("loading=")
      expect(html).toContain("Smazat")
    }
  })
})
