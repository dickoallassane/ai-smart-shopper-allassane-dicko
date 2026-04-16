import path from "node:path"
import { fileURLToPath } from "node:url"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

const rootDir = fileURLToPath(new URL(".", import.meta.url))

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: [path.resolve(rootDir, "vitest.setup.ts")]
  },
  resolve: {
    alias: {
      "@shopfriend/shared": path.resolve(rootDir, "../../packages/shared/src/index.ts")
    }
  }
})
