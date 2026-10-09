// Deno tests for discordFetch's totalBudgetMs bound (ADR-0063).
//
// WHY: a 429 with a large Retry-After sleeps up to MAX_RETRY_DELAY_MS (15s) PER retry, so an
// unbounded discordFetch can run far past any client timeout — the browser aborts while the bot
// keeps working (the Discord-connect invite failure). `totalBudgetMs` must cap the TOTAL wall-clock
// (attempts + backoff sleeps) so a server-side caller finishes before the client gives up.
import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { discordFetch } from "./discord-fetch.ts";

function stubFetch(fn: typeof fetch): () => void {
  const orig = globalThis.fetch;
  globalThis.fetch = fn as typeof fetch;
  return () => {
    globalThis.fetch = orig;
  };
}

Deno.test("totalBudgetMs caps total time under repeated 429 + long Retry-After", async () => {
  let calls = 0;
  const restore = stubFetch(() => {
    calls++;
    return Promise.resolve(
      new Response("rate limited", { status: 429, headers: { "Retry-After": "10" } })
    );
  });
  try {
    const start = Date.now();
    // Unbounded, this would sleep ~10s between each of 5 retries (>40s). The 500ms budget must
    // stop it almost immediately and still return the last response, not throw.
    const { response } = await discordFetch("https://discord.com/api/v10/x", {
      maxRetries: 5,
      baseDelayMs: 1000,
      totalBudgetMs: 500,
    });
    const elapsed = Date.now() - start;
    assert(elapsed < 2000, `expected the budget to bound elapsed < 2000ms, got ${elapsed}ms`);
    assertEquals(response.status, 429);
    assert(calls >= 1, "should have attempted at least once");
  } finally {
    restore();
  }
});

Deno.test(
  "no totalBudgetMs = unchanged behavior: a first-try success returns immediately",
  async () => {
    const restore = stubFetch(() => Promise.resolve(new Response("ok", { status: 200 })));
    try {
      const { response, retries } = await discordFetch("https://discord.com/api/v10/x");
      assertEquals(response.status, 200);
      assertEquals(retries, 0);
    } finally {
      restore();
    }
  }
);

Deno.test("totalBudgetMs does not truncate a fast successful call", async () => {
  const restore = stubFetch(() => Promise.resolve(new Response("ok", { status: 200 })));
  try {
    const { response, retries } = await discordFetch("https://discord.com/api/v10/x", {
      totalBudgetMs: 5000,
    });
    assertEquals(response.status, 200);
    assertEquals(retries, 0);
  } finally {
    restore();
  }
});

// The server-bound coverage the four sibling handlers rely on (ADR-0063): manage-discord-roles,
// repair-discord-username, grant-observer-role, and backfill-discord-usernames all pass
// totalBudgetMs so their live-Discord work finishes before the browser's invokeEdge budget aborts.
// The two cases below pin the wrapper behaviors that make that hold under the real failure modes:
// a hung socket, and 5xx retry storms with no Retry-After header.

Deno.test(
  "totalBudgetMs aborts a hung in-flight fetch instead of hanging past the budget",
  async () => {
    // repair-/backfill-discord-usernames read a live member; a hung Discord socket must not outlast
    // the budget. Each attempt gets an abort signal; when the budget fires, the attempt is aborted.
    let sawSignal = false;
    const restore = stubFetch((_input: Request | URL | string, init?: RequestInit) => {
      const signal = init?.signal;
      if (signal) sawSignal = true;
      return new Promise<Response>((_resolve, reject) => {
        // Never resolves on its own — only the budget's abort signal ends it.
        signal?.addEventListener("abort", () =>
          reject(new DOMException("The signal has been aborted", "AbortError"))
        );
      });
    });
    try {
      const start = Date.now();
      let threw = false;
      try {
        await discordFetch("https://discord.com/api/v10/x", {
          maxRetries: 1,
          baseDelayMs: 1000,
          totalBudgetMs: 400,
        });
      } catch {
        threw = true;
      }
      const elapsed = Date.now() - start;
      assert(sawSignal, "each attempt must receive an abort signal when a budget is set");
      assert(threw, "a fully-hung fetch must throw once the budget is spent, not hang");
      assert(elapsed < 2000, `budget must bound a hung fetch; elapsed ${elapsed}ms`);
    } finally {
      restore();
    }
  }
);

Deno.test("totalBudgetMs bounds exponential backoff on repeated 5xx (no Retry-After)", async () => {
  // Not every retryable failure carries Retry-After; the exponential-backoff path must honor the
  // budget too, so a bounded caller returns the last response rather than sleeping past the client.
  let calls = 0;
  const restore = stubFetch(() => {
    calls++;
    return Promise.resolve(new Response("server error", { status: 500 }));
  });
  try {
    const start = Date.now();
    const { response } = await discordFetch("https://discord.com/api/v10/x", {
      maxRetries: 5,
      baseDelayMs: 1000,
      totalBudgetMs: 400,
    });
    const elapsed = Date.now() - start;
    assert(elapsed < 1500, `expected the budget to bound exponential backoff, got ${elapsed}ms`);
    assertEquals(response.status, 500);
    assert(calls >= 1, "should have attempted at least once");
  } finally {
    restore();
  }
});
