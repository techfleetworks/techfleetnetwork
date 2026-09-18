import {
  assert,
  assertEquals,
  assertRejects,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildStructuredBody,
  LlmRateLimitError,
  LlmTerminalError,
  parseStructuredArguments,
  throwForLlmStatus,
  withRetries,
} from "./port.ts";

Deno.test("buildStructuredBody forces the structured-output tool call", () => {
  const body = buildStructuredBody({
    model: "openai/gpt-oss-20b",
    messages: [{ role: "user", content: "hi" }],
    toolName: "emit_x",
    schema: { type: "object", properties: { a: { type: "string" } }, required: ["a"] },
    reasoningEffort: "low",
  }) as Record<string, any>;
  assertEquals(body.model, "openai/gpt-oss-20b");
  assertEquals(body.reasoning_effort, "low");
  assertEquals(body.tool_choice.function.name, "emit_x");
  assertEquals(body.tools[0].function.name, "emit_x");
  assertEquals(body.tools[0].function.parameters.required, ["a"]);
  // A non-DeepSeek model must NOT carry a provider pin (Anthropic/OpenAI are already US).
  assertEquals(body.provider, undefined);
});

Deno.test("buildStructuredBody pins DeepSeek to US inference providers (data residency)", () => {
  const body = buildStructuredBody({
    model: "deepseek/deepseek-v4-flash-0731",
    messages: [{ role: "user", content: "hi" }],
    toolName: "emit_x",
    schema: { type: "object" },
  }) as Record<string, any>;
  assert(
    Array.isArray(body.provider?.only) && body.provider.only.length > 0,
    "DeepSeek gets a US provider allow-list"
  );
  // No non-US provider may appear (keeps raw personal data out of China jurisdiction).
  for (const p of body.provider.only)
    assert(!/deepseek/i.test(p), "the pin never allows DeepSeek's own (China) endpoint");
});

Deno.test("parseStructuredArguments extracts the JSON args from a tool-call response", () => {
  const resp = {
    choices: [
      { message: { tool_calls: [{ function: { arguments: '{"facts":["x"],"gaps":[]}' } }] } },
    ],
  };
  const args = parseStructuredArguments(resp);
  assertEquals(args.facts, ["x"]);
});

Deno.test("parseStructuredArguments throws when no tool call is present", () => {
  assertThrows(() => parseStructuredArguments({ choices: [{ message: { content: "plain" } }] }));
});

Deno.test("parseStructuredArguments throws on non-JSON arguments", () => {
  const resp = {
    choices: [{ message: { tool_calls: [{ function: { arguments: "not json" } }] } }],
  };
  assertThrows(() => parseStructuredArguments(resp));
});

Deno.test(
  "parseStructuredArguments: finish_reason 'length' is a TERMINAL truncation, not a retryable miss",
  () => {
    // No output at all, cut off at max_tokens.
    assertThrows(
      () =>
        parseStructuredArguments({
          choices: [{ finish_reason: "length", message: { content: "" } }],
        }),
      LlmTerminalError,
      "truncated"
    );
    // Partial, invalid JSON in the tool args, cut off at max_tokens.
    assertThrows(
      () =>
        parseStructuredArguments({
          choices: [
            {
              finish_reason: "length",
              message: { tool_calls: [{ function: { arguments: '{"components":[{"slug":"a"' } }] },
            },
          ],
        }),
      LlmTerminalError,
      "truncated"
    );
  }
);

Deno.test("withRetries returns the first success without retrying", async () => {
  let calls = 0;
  const out = await withRetries(
    "t",
    () => {
      calls++;
      return Promise.resolve("ok");
    },
    { timeoutMs: 1000, deadlineMs: 5000 }
  );
  assertEquals(out, "ok");
  assertEquals(calls, 1);
});

Deno.test(
  "withRetries FAILS FAST on a terminal error — exactly one attempt, no wasted retries",
  async () => {
    let calls = 0;
    await assertRejects(
      () =>
        withRetries(
          "t",
          () => {
            calls++;
            return Promise.reject(new LlmTerminalError("HTTP 400: bad request"));
          },
          { timeoutMs: 1000, deadlineMs: 5000 }
        ),
      LlmTerminalError,
      "bad request"
    );
    assertEquals(calls, 1); // the whole point: a 4xx / truncation / refusal is never retried
  }
);

Deno.test("withRetries retries a transient error, then succeeds", async () => {
  let calls = 0;
  const out = await withRetries(
    "t",
    () => {
      calls++;
      if (calls < 3) return Promise.reject(new Error("transient HTTP 503"));
      return Promise.resolve("recovered");
    },
    { timeoutMs: 1000, deadlineMs: 10_000 }
  );
  assertEquals(out, "recovered");
  assertEquals(calls, 3);
});

Deno.test("withRetries honors a rate-limit wait, then retries", async () => {
  let calls = 0;
  const out = await withRetries(
    "t",
    () => {
      calls++;
      if (calls === 1) return Promise.reject(new LlmRateLimitError(20));
      return Promise.resolve("after wait");
    },
    { timeoutMs: 1000, deadlineMs: 10_000 }
  );
  assertEquals(out, "after wait");
  assertEquals(calls, 2);
});

Deno.test(
  "withRetries is BOUNDED by the deadline — a persistent hang cannot be amplified",
  async () => {
    let calls = 0;
    const started = Date.now();
    await assertRejects(
      () =>
        withRetries(
          "t",
          () => {
            calls++;
            return Promise.reject(new Error("transient always"));
          },
          { timeoutMs: 1000, deadlineMs: 300 }
        ),
      Error,
      "budget"
    );
    const elapsed = Date.now() - started;
    assert(elapsed < 2000, `must fail within the deadline budget, took ${elapsed}ms`);
    assert(calls < 6, `must not burn all MAX_RETRIES when out of budget, made ${calls} calls`);
  }
);

Deno.test(
  "throwForLlmStatus: an OK response does not throw (caller consumes the body)",
  async () => {
    await throwForLlmStatus(new Response("{}", { status: 200 }));
  }
);

Deno.test(
  "throwForLlmStatus: 429 -> LlmRateLimitError waiting the Retry-After window (bare seconds)",
  async () => {
    const err = await assertRejects(
      () => throwForLlmStatus(new Response(null, { status: 429, headers: { "retry-after": "2" } })),
      LlmRateLimitError
    );
    assertEquals(err.waitMs, 2000);
  }
);

Deno.test("throwForLlmStatus: 429 with no Retry-After defaults to a ~1s wait", async () => {
  const err = await assertRejects(
    () => throwForLlmStatus(new Response(null, { status: 429 })),
    LlmRateLimitError
  );
  assertEquals(err.waitMs, 1000);
});

Deno.test(
  "throwForLlmStatus: a long Retry-After is capped so an interactive turn can't stall for minutes",
  async () => {
    const err = await assertRejects(
      () =>
        throwForLlmStatus(new Response(null, { status: 429, headers: { "retry-after": "600" } })),
      LlmRateLimitError
    );
    assertEquals(err.waitMs, 30_000); // 600s asked → capped to MAX_RATE_WAIT_MS
  }
);

Deno.test("throwForLlmStatus: 5xx -> a transient (retryable) error, NOT terminal", async () => {
  await assertRejects(
    () => throwForLlmStatus(new Response("upstream boom", { status: 503 })),
    Error,
    "transient HTTP 503"
  );
  // A 5xx must NOT be an LlmTerminalError — that would make withRetries fail fast instead of retry.
  const err = await assertRejects(() => throwForLlmStatus(new Response("x", { status: 500 })));
  assert(!(err instanceof LlmTerminalError), "5xx is retryable, not fail-fast");
});

Deno.test(
  "throwForLlmStatus: 402 (out of credits) -> LlmTerminalError carrying the status the handler keys off",
  async () => {
    const err = await assertRejects(
      () => throwForLlmStatus(new Response("no credits", { status: 402 })),
      LlmTerminalError,
      "HTTP 402"
    );
    assert(/HTTP 402\b/.test(err.message)); // the chat handler's 402 branch matches this substring
  }
);

Deno.test(
  "throwForLlmStatus: other 4xx -> LlmTerminalError (fail fast, never retried)",
  async () => {
    await assertRejects(
      () => throwForLlmStatus(new Response("bad", { status: 400 })),
      LlmTerminalError,
      "HTTP 400"
    );
  }
);

Deno.test(
  "withRetries preserves the last failure as `cause` on budget exhaustion (callers can classify it)",
  async () => {
    const rate = new LlmRateLimitError(10);
    const err = await assertRejects(
      () => withRetries("t", () => Promise.reject(rate), { timeoutMs: 1000, deadlineMs: 200 }),
      Error,
      "budget"
    );
    // A persistent 429 is recoverable from `.cause` — that's how the chat handler keeps its 429 copy.
    assertEquals((err as Error).cause, rate);
  }
);
