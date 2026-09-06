import { describe, it, expect } from "vitest";

// Placeholder proving the gate can fail before any domain module exists.
// Retired the moment the first real test lands (ledger core, prompt A2).
describe("the gate", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
