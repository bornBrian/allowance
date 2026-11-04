import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // An explicit root, so running from "d:\" and "D:\" on Windows finds the same files.
  root: import.meta.dirname,
  resolve: {
    alias: {
      "@": path.join(import.meta.dirname, "src"),
      "server-only": path.join(import.meta.dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    env: { DATABASE_PATH: ":memory:" },
  },
});
