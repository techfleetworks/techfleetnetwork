import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url));

Deno.test("SEC-NOTIFICATION-FANOUT-EDGE-056: requires service key or admin JWT authorization", () => {
  assertEquals(source.includes('req.headers.get("authorization")'), true);
  assertEquals(source.includes("token === SERVICE_KEY"), true);
  assertEquals(source.includes("auth.getUser()"), true);
  assertEquals(source.includes('.eq("role", "admin")'), true);
});

Deno.test("SEC-NOTIFICATION-FANOUT-EDGE-056: uses an allowlist for role verification", () => {
  assertEquals(source.includes("ADMIN_ROLE_COLUMNS"), true);
  assertEquals(source.includes(".select(ADMIN_ROLE_COLUMNS)"), true);
  assertEquals(source.includes('.select("*")'), false);
  assertEquals(source.includes(".select('*')"), false);
});

Deno.test("SEC-NOTIFICATION-FANOUT-EDGE-056: does not leak raw server errors", () => {
  assertEquals(source.includes("SAFE_SERVER_ERROR"), true);
  assertEquals(source.includes("err.message"), false);
  assertEquals(source.includes('error: "Unauthorized"'), true);
});
