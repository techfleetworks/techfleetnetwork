// PUB-SMOKE-001: the live post-deploy catalog check must actually discriminate a
// broken contract from a healthy one — otherwise the deploy gate is vacuous
// (verifiable-quality-gates). We test BOTH layers:
//   - the pure predicates (preflightAllowsApikey, isWellFormedList), and
//   - checkGateway, the composition that converts a live response into the
//     problem list that gates the deploy — with an injected fetch stub, so the
//     status/reachability/shape decisions can't silently rot under mutation.
import { describe, it, expect } from "vitest";
import {
  preflightAllowsApikey,
  isWellFormedList,
  isWellFormedMap,
  checkGateway,
} from "../../../scripts/ci/smoke-public-catalog.mjs";

describe("isWellFormedMap (PUB-SMOKE-001, youtube-durations {id: seconds})", () => {
  it("accepts a plain object map, rejects arrays / missing / non-objects", () => {
    expect(isWellFormedMap({ durations: {} }, "durations")).toBe(true);
    expect(isWellFormedMap({ durations: { abc: 510 } }, "durations")).toBe(true);
    expect(isWellFormedMap({ durations: [] }, "durations")).toBe(false); // array, not a map
    expect(isWellFormedMap({ durations: null }, "durations")).toBe(false);
    expect(isWellFormedMap({ other: {} }, "durations")).toBe(false);
    expect(isWellFormedMap(null, "durations")).toBe(false);
  });
});

describe("preflightAllowsApikey (PUB-SMOKE-001)", () => {
  it("accepts an allow-headers list that includes apikey", () => {
    expect(preflightAllowsApikey("authorization, x-client-info, apikey, content-type")).toBe(true);
    expect(preflightAllowsApikey("apikey")).toBe(true);
    expect(preflightAllowsApikey("APIKEY, Content-Type")).toBe(true); // case-insensitive
  });

  it("DISCRIMINATING: rejects the exact public-classes bug (apikey omitted)", () => {
    expect(preflightAllowsApikey("content-type")).toBe(false);
    expect(preflightAllowsApikey("authorization, content-type")).toBe(false);
    // A substring match must NOT pass it (e.g. a header literally named "x-apikey-note").
    expect(preflightAllowsApikey("content-type, x-apikey-note")).toBe(false);
    expect(preflightAllowsApikey("")).toBe(false);
    expect(preflightAllowsApikey(null)).toBe(false);
    expect(preflightAllowsApikey(undefined)).toBe(false);
  });
});

describe("isWellFormedList (PUB-SMOKE-001)", () => {
  it("accepts a feed carrying its array", () => {
    expect(isWellFormedList({ count: 0, classes: [] }, "classes")).toBe(true);
    expect(isWellFormedList({ classes: [{ id: "x" }] }, "classes")).toBe(true);
    expect(isWellFormedList({ courses: [] }, "courses")).toBe(true);
  });

  it("DISCRIMINATING: rejects a malformed or error-shaped response", () => {
    expect(isWellFormedList({ error: "boom" }, "classes")).toBe(false); // error body, no array
    expect(isWellFormedList({ classes: "not-an-array" }, "classes")).toBe(false);
    expect(isWellFormedList(null, "classes")).toBe(false);
    expect(isWellFormedList("a string", "classes")).toBe(false);
    expect(isWellFormedList({ courses: [] }, "classes")).toBe(false); // wrong key
  });
});

// --- checkGateway: the deploy-gating composition -----------------------------

/** A fake Response good enough for checkGateway (status, allow-headers, json()). */
function res(
  {
    status = 200,
    allowHeaders = "authorization, apikey, content-type",
    json = { classes: [] },
  }: { status?: number; allowHeaders?: string | null; json?: unknown } = {},
) {
  return {
    status,
    headers: { get: (h: string) => (h.toLowerCase() === "access-control-allow-headers" ? allowHeaders : null) },
    json: async () => json,
  };
}

type FakeRes = ReturnType<typeof res>;

/** fetch stub: OPTIONS → `preflight`, GET → next value from `gets` (array = sequence). */
function stubFetch(
  { preflight = res(), gets = [res()] }: { preflight?: FakeRes | Error; gets?: Array<FakeRes | Error> } = {},
) {
  const queue = [...gets];
  return async (_url: string, opts: { method?: string }) => {
    if (opts?.method === "OPTIONS") {
      if (preflight instanceof Error) throw preflight;
      return preflight;
    }
    const next = queue.length > 1 ? queue.shift()! : queue[0];
    if (next instanceof Error) throw next;
    return next;
  };
}

const GW = { path: "public-classes", key: "classes" };
const fast = { attempts: 1, backoffMs: 0, timeoutMs: 1000, log: () => {} };

describe("checkGateway — deploy-gating composition (PUB-SMOKE-001)", () => {
  it("healthy contract → no problems", async () => {
    const fetchImpl = stubFetch({ preflight: res(), gets: [res({ json: { classes: [{ id: "a" }] } })] });
    const problems = await checkGateway("https://x", GW, { ...fast, fetchImpl });
    expect(problems).toEqual([]);
  });

  it("DISCRIMINATING: preflight missing apikey → problem names apikey", async () => {
    const fetchImpl = stubFetch({ preflight: res({ allowHeaders: "content-type" }) });
    const problems = await checkGateway("https://x", GW, { ...fast, fetchImpl });
    expect(problems.some((p) => /apikey/i.test(p))).toBe(true);
  });

  it("DISCRIMINATING: non-200 GET → problem names the status", async () => {
    const fetchImpl = stubFetch({ gets: [res({ status: 404, json: { error: "nope" } })] });
    const problems = await checkGateway("https://x", GW, { ...fast, fetchImpl });
    expect(problems.some((p) => /HTTP 404/.test(p))).toBe(true);
  });

  it("DISCRIMINATING: malformed body (no array) → problem names the key", async () => {
    const fetchImpl = stubFetch({ gets: [res({ json: { error: "boom" } })] });
    const problems = await checkGateway("https://x", GW, { ...fast, fetchImpl });
    expect(problems.some((p) => /"classes" list/.test(p))).toBe(true);
  });

  it("DISCRIMINATING: unreachable preflight → problem, no crash", async () => {
    const fetchImpl = stubFetch({ preflight: new Error("ECONNREFUSED") });
    const problems = await checkGateway("https://x", GW, { ...fast, fetchImpl });
    expect(problems.some((p) => /preflight request failed/.test(p))).toBe(true);
  });

  it("retries a transient 5xx then succeeds (no false-FAIL on cold start)", async () => {
    // First GET is a 503 cold-start, second is healthy — must recover to no problems.
    const fetchImpl = stubFetch({
      preflight: res(),
      gets: [res({ status: 503, json: {} }), res({ json: { classes: [] } })],
    });
    const problems = await checkGateway("https://x", GW, { attempts: 2, backoffMs: 0, timeoutMs: 1000, log: () => {}, fetchImpl });
    expect(problems).toEqual([]);
  });
});
