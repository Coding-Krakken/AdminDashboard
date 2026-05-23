import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./apps/starter-next/src", import.meta.url))
    }
  },
  test: {
    environment: "node",
    include: [
      "packages/**/__tests__/**/*.test.ts",
      "apps/**/__tests__/**/*.test.ts"
    ],
    coverage: {
      enabled: false
    }
  }
});
