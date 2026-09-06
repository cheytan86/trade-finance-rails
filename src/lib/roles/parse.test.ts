import { describe, it, expect } from "vitest";
import { parseIdentity, serializeIdentity } from "./parse";

describe("parseIdentity — the cookie is a claim, validated like one", () => {
  it("roundtrips a valid identity", () => {
    const id = {
      seat: "supplier" as const,
      partyId: "3f1a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8",
    };
    expect(parseIdentity(serializeIdentity(id))).toEqual(id);
  });
  it("accepts a party-less seat", () => {
    expect(parseIdentity(JSON.stringify({ seat: "ops", partyId: null }))).toEqual({
      seat: "ops",
      partyId: null,
    });
  });
  it("collapses garbage to null — never to a privileged default", () => {
    expect(parseIdentity(undefined)).toBeNull();
    expect(parseIdentity("")).toBeNull();
    expect(parseIdentity("not-json")).toBeNull();
    expect(parseIdentity(JSON.stringify({ seat: "admin" }))).toBeNull();
    expect(parseIdentity(JSON.stringify({ seat: 42 }))).toBeNull();
    expect(parseIdentity(JSON.stringify(["supplier"]))).toBeNull();
  });
  it("drops a malformed partyId but keeps the seat", () => {
    expect(
      parseIdentity(JSON.stringify({ seat: "supplier", partyId: "1 OR 1=1" })),
    ).toEqual({ seat: "supplier", partyId: null });
  });
});
