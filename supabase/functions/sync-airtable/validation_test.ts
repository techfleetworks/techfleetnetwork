import { assertEquals, assertInstanceOf } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseSyncAirtableRequest, validateAirtableConfig } from "./validation.ts";

Deno.test("parseSyncAirtableRequest only accepts UUID application ids", () => {
  assertInstanceOf(parseSyncAirtableRequest(null), Response);
  assertInstanceOf(parseSyncAirtableRequest({ application_id: "abc" }), Response);
  assertInstanceOf(parseSyncAirtableRequest({ application_id: "123e4567-e89b-92d3-a456-426614174000" }), Response);

  const parsed = parseSyncAirtableRequest({ application_id: "123e4567-e89b-42d3-a456-426614174000" });
  assertEquals(parsed instanceof Response, false);
  if (parsed instanceof Response) return;
  assertEquals(parsed.application_id, "123e4567-e89b-42d3-a456-426614174000");
});

Deno.test("validateAirtableConfig rejects malformed base and table names", () => {
  assertInstanceOf(validateAirtableConfig(undefined, "Applications"), Response);
  assertInstanceOf(validateAirtableConfig("base-id", "Applications"), Response);
  assertInstanceOf(validateAirtableConfig("app12345678901234", "../Secrets"), Response);
  assertEquals(validateAirtableConfig("app12345678901234", " General Applications "), "General Applications");
});