// Offline unit tests for the Braintrust observability owner.
// No network, no SDK import: the enabled-path tests inspect the buffered records
// via the test-only _snapshot seam + the pure buildEvents() mapper, and never call
// finish() (which is the only path that dynamic-imports the SDK / flushes).
//
// CI: deno test supabase/functions/_shared/observability/braintrust.test.ts
// (must be listed in the .github/workflows/ci.yml deno-test allowlist to run).

import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { braintrustEnabled, buildEvents, startFleetyTrace } from "./braintrust.ts";

function clearEnv() {
  Deno.env.delete("BRAINTRUST_API_KEY");
  Deno.env.delete("FLEETY_BRAINTRUST_ENABLED");
  Deno.env.delete("BRAINTRUST_PROJECT_ID");
}

Deno.test("braintrustEnabled: OFF when no API key (fail-safe default)", () => {
  clearEnv();
  assertEquals(braintrustEnabled(), false);
});

Deno.test(
  "braintrustEnabled: ON when key present and flag unset (default-on, no dark launch)",
  () => {
    clearEnv();
    Deno.env.set("BRAINTRUST_API_KEY", "bt-test-key");
    assertEquals(braintrustEnabled(), true);
    clearEnv();
  }
);

Deno.test("braintrustEnabled: OFF when flag explicitly disabled (kill switch)", () => {
  clearEnv();
  Deno.env.set("BRAINTRUST_API_KEY", "bt-test-key");
  for (const v of ["0", "false", "off", "no", "OFF", "False"]) {
    Deno.env.set("FLEETY_BRAINTRUST_ENABLED", v);
    assertEquals(braintrustEnabled(), false, `flag="${v}" should disable`);
  }
  clearEnv();
});

Deno.test(
  "disabled: startFleetyTrace returns a no-op trace that never throws and resolves finish()",
  async () => {
    clearEnv(); // no key => disabled
    const t = startFleetyTrace({ fn: "techfleet-chat", question: "hi", userId: "u1" });
    const span = t.llmSpan("answer", "in");
    span.log({ output: "out", metrics: { tokens: 1 } });
    span.end();
    t.log({ output: "root-out" });
    t.setError(new Error("boom"));
    await t.finish(); // must resolve with no SDK import and no throw
    assertEquals(
      (t as unknown as { _snapshot?: unknown })._snapshot,
      undefined,
      "the no-op trace must not expose a buffer"
    );
  }
);

Deno.test(
  "enabled: task root + llm child; raw user_id intact; secrets scrubbed; names kept; timing present",
  () => {
    clearEnv();
    Deno.env.set("BRAINTRUST_API_KEY", "bt-test-key");
    const USER = "11111111-1111-4111-8111-111111111111";
    const JWT = "eyJabcdefghij.eyJklmnopqrst.signaturesignature";

    const t = startFleetyTrace({
      fn: "techfleet-chat",
      traceId: "trace-123",
      userId: USER,
      caller: "member",
      question: `my name is Dana Lee, token ${JWT}`,
      metadata: { intent: "support" },
    });
    const span = t.llmSpan("answer", `answer input ${JWT}`, { model: "deepseek/deepseek-v4-pro" });
    span.log({
      output: "Hello Dana",
      metrics: { prompt_tokens: 12, completion_tokens: 5, tokens: 17, time_to_first_token: 0.3 },
    });
    span.end();
    t.log({ output: "Hello Dana", metrics: { tokens: 17 } });

    const snap = (t as unknown as { _snapshot: () => unknown })._snapshot();
    assert(snap, "snapshot must exist when enabled");
    // deno-lint-ignore no-explicit-any
    const ev = buildEvents(snap as any);

    // Root (task) span
    assertEquals(ev.root.type, "task");
    assertEquals(
      ev.root.event.metadata?.user_id,
      USER,
      "raw DB user_id must survive intact in metadata (not [redacted-id])"
    );
    assertEquals(ev.root.event.metadata?.trace_id, "trace-123");
    assertEquals(ev.root.event.metadata?.caller, "member");
    assertEquals(ev.root.event.metadata?.fn, "techfleet-chat");
    assertEquals(ev.root.event.metadata?.intent, "support");
    const rootInput = ev.root.event.input as string;
    assertStringIncludes(rootInput, "Dana Lee"); // free-text name preserved (raw content)
    assertStringIncludes(rootInput, "[redacted-jwt]"); // secret stripped
    assert(!rootInput.includes("eyJabc"), "JWT must be gone from content");
    assertEquals(typeof ev.root.event.metrics?.start, "number", "root carries start timing");

    // Child (llm) span
    assertEquals(ev.children.length, 1);
    assertEquals(ev.children[0].type, "llm");
    assertEquals(ev.children[0].name, "answer");
    assertEquals(ev.children[0].event.metadata?.model, "deepseek/deepseek-v4-pro");
    assertStringIncludes(ev.children[0].event.input as string, "[redacted-jwt]");
    assertEquals(ev.children[0].event.output, "Hello Dana");
    assertEquals(ev.children[0].event.metrics?.prompt_tokens, 12);
    assertEquals(ev.children[0].event.metrics?.completion_tokens, 5);
    assertEquals(typeof ev.children[0].event.metrics?.start, "number");
    assertEquals(
      typeof ev.children[0].event.metrics?.end,
      "number",
      "ended child carries end timing"
    );

    clearEnv();
  }
);

Deno.test("enabled: content UUIDs are preserved by secrets-only scrub (eval fidelity)", () => {
  clearEnv();
  Deno.env.set("BRAINTRUST_API_KEY", "bt-test-key");
  // A realistic v4 UUID contains hex letters (which break a credit-card digit run,
  // so it is not CC-redacted) and is <40 contiguous hex (so not hex-token-redacted).
  const someUuid = "a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5";
  const t = startFleetyTrace({ fn: "x", question: `tell me about project ${someUuid}` });
  const snap = (t as unknown as { _snapshot: () => unknown })._snapshot();
  // deno-lint-ignore no-explicit-any
  const ev = buildEvents(snap as any);
  assertStringIncludes(
    ev.root.event.input as string,
    someUuid,
    "a UUID in content must NOT be redacted by secrets-only scrub"
  );
  clearEnv();
});
