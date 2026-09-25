import { describe, it, expect } from "vitest";
import { parseIdentity, serializeIdentity, safeLocalPath } from "./parse";

describe("safeLocalPath — a redirect target is a claim too", () => {
  it("keeps same-origin absolute paths", () => {
    expect(safeLocalPath("/ops/deals/abc")).toBe("/ops/deals/abc");
    expect(safeLocalPath("/")).toBe("/");
  });
  it("refuses open-redirect shapes", () => {
    expect(safeLocalPath("https://evil.example")).toBeNull();
    expect(safeLocalPath("//evil.example")).toBeNull();
    expect(safeLocalPath("javascript:alert(1)")).toBeNull();
    expect(safeLocalPath("/x\\..\\y")).toBeNull();
    expect(safeLocalPath("/x\r\nSet-Cookie: a=b")).toBeNull();
    expect(safeLocalPath(null)).toBeNull();
    expect(safeLocalPath(42)).toBeNull();
  });
});

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
