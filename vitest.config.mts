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
    // Cycle 2: there are now TWO suites that talk to the real Neon database
    // (spine.integration and settlement/pending), and there is only one
    // database. Vitest runs files in parallel workers by default, so the
    // spine's global-count assertions ("expected 24 to be 23") were being
    // moved under its feet by rows the other suite legitimately created.
    // Serialising files is the honest fix — the constraint is the shared
    // database, not the assertions. Costs a few seconds on a 4-second suite.
    fileParallelism: false,
  },
});
