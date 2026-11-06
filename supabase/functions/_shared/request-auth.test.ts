import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { extractBearerToken } from "./admin-client.ts";
import { issuedAtIsoFromClaims } from "./request-auth.ts";

Deno.test("extractBearerToken denies missing or malformed authorization headers", () => {
  assertEquals(extractBearerToken(new Request("https://example.test")), null);
  assertEquals(
    extractBearerToken(
      new Request("https://example.test", {
        headers: { Authorization: "Basic abc" },
      }),
    ),
    null,
  );
  assertEquals(
    extractBearerToken(
      new Request("https://example.test", {
        headers: { Authorization: "Bearer   " },
      }),
    ),
    null,
  );
});

Deno.test("extractBearerToken accepts only explicit bearer tokens", () => {
  assertEquals(
    extractBearerToken(
      new Request("https://example.test", {
        headers: { Authorization: "Bearer abc.def.ghi" },
      }),
    ),
    "abc.def.ghi",
  );
});

// SEC-1 / RH1 — the issued-at used for the server-side revocation check must come
// from the token's own `iat` claim, and a token with no usable `iat` must be
// unverifiable (null → caller fails closed), never silently treated as not-revoked.
Deno.test("issuedAtIsoFromClaims derives issued-at ISO from a numeric iat claim", () => {
  // 2026-11-06T00:00:00Z = 1793923200 seconds.
  assertEquals(issuedAtIsoFromClaims({ sub: "u1", iat: 1793923200 }), "2026-11-06T00:00:00.000Z");
});

Deno.test("issuedAtIsoFromClaims returns null when iat is absent or non-numeric (fail closed)", () => {
  assertEquals(issuedAtIsoFromClaims({ sub: "u1" }), null);
  assertEquals(issuedAtIsoFromClaims({ sub: "u1", iat: "1793923200" }), null);
  assertEquals(issuedAtIsoFromClaims({ sub: "u1", iat: Number.NaN }), null);
  assertEquals(issuedAtIsoFromClaims(null), null);
  assertEquals(issuedAtIsoFromClaims(undefined), null);
});
