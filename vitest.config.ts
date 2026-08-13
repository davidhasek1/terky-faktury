import path from "node:path"

import { defineConfig } from "vitest/config"

// Nastav timezone aplikace na Prague (kde ji používají)
process.env.TZ = "Europe/Prague"

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, ".") },
  },
})
