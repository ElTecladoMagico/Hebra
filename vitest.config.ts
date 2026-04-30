import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "edge-runtime",
    setupFiles: ["./tests/setup.ts"],
    server: { deps: { inline: ["convex-test"] } },
  },
});
