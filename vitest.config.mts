import { defineConfig } from "vitest/config";
import path from "node:path";

// One runner, deliberately. The sibling repo's two-runner split (node --test +
// vitest) existed for its evidence scripts; nothing here needs a second
// environment yet, and STACK_RULES.md records the gate as it actually is.
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  test: {
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    environment: "node",
  },
});
