import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url));

Deno.test("SEC-EMAIL-UNSUBSCRIBE-PROJECTION-052: avoids wildcard token projections", () => {
  assertEquals(source.includes('.select("*")'), false);
  assertEquals(source.includes(".select('*')"), false);
});

Deno.test("SEC-EMAIL-UNSUBSCRIBE-PROJECTION-052: uses allowlists for token reads and update returns", () => {
  assertEquals(source.includes("UNSUBSCRIBE_TOKEN_COLUMNS"), true);
  assertEquals(source.includes("UNSUBSCRIBE_TOKEN_UPDATE_COLUMNS"), true);
  assertEquals(source.includes(".select(UNSUBSCRIBE_TOKEN_COLUMNS)"), true);
  assertEquals(source.includes(".select(UNSUBSCRIBE_TOKEN_UPDATE_COLUMNS)"), true);
});

Deno.test("SEC-EMAIL-UNSUBSCRIBE-PROJECTION-052: does not over-fetch token metadata", () => {
  assertEquals(source.includes('"email, used_at"'), true);
  assertEquals(source.includes("created_at"), false);
  assertEquals(source.includes("updated_at"), false);
  assertEquals(source.includes("private_metadata"), false);
  assertEquals(source.includes("ip_address"), false);
});
