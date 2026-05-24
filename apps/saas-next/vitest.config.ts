import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url))
    }
  },
  test: {
    environment: "node",
    include: [
      "src/**/__tests__/**/*.test.ts",
      "app/**/__tests__/**/*.test.ts"
    ],
    coverage: {
      enabled: false
    }
  }
});
