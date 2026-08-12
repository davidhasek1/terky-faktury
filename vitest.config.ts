import path from "node:path"

import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
  },
  // tsconfig.json má kvůli Next.js `jsx: "preserve"`; pro testy musí být JSX
  // skutečně přeloženo (e-mailové šablony jsou .tsx).
  oxc: { jsx: { runtime: "automatic", importSource: "react" } },
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, ".") },
  },
})
