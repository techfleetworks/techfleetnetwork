import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildMessage, validateNotifyPayload } from "./notify-utils.ts";

Deno.test("validateNotifyPayload rejects invalid events and non-object payloads", () => {
  assertEquals(validateNotifyPayload(null), { ok: false, error: "Invalid payload" });
  assertEquals(validateNotifyPayload({ event: "__proto__" }), { ok: false, error: "Missing event" });
});

Deno.test("validateNotifyPayload sanitizes Discord markdown, mentions, control chars, and long fields", () => {
  const result = validateNotifyPayload({
    event: "resource_explored",
    display_name: "*@everyone*\n<script>alert(1)</script>",
    search_query: "`secret` @here ".repeat(40),
    discord_user_id: "not-a-snowflake",
  });

  assertEquals(result.ok, true);
  if (!result.ok) return;
  assertEquals(result.payload.discord_user_id, undefined);
  assertStringIncludes(result.payload.display_name ?? "", "@\u200beveryone");
  assertEquals((result.payload.search_query ?? "").length <= 200, true);
  assertEquals(/[\n`*_]/.test(result.payload.search_query ?? ""), false);
});

Deno.test("buildMessage only creates direct mentions from validated snowflake IDs", () => {
  const result = validateNotifyPayload({
    event: "discord_verified",
    discord_username: "@fleet-admin",
    discord_user_id: "123456789012345678",
  });

  assertEquals(result.ok, true);
  if (!result.ok) return;
  assertStringIncludes(buildMessage(result.payload), "<@123456789012345678>");
});