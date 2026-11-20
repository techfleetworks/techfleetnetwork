// PUB-SMOKE-001 — LIVE post-deploy contract check for the logged-out catalog.
//
// Why this exists: three times in a row a public-catalog fix merged and was
// called "done," yet a logged-out visitor still saw nothing — because the thing
// that was broken was in the DEPLOYED runtime, not the source:
//   1. the CORS preflight omitted `apikey`, so the browser blocked the GET
//      (OPTIONS 200 but GET CORS-error) — invisible to any source-level test;
//   2. an inner-join dropped published classes — only visible once the function
//      actually ran against prod data;
//   3. the fix was merged but the edge deploy had not finished, so the live
//      function still served the old behavior.
// Source-text smoke tests (check CORS lists apikey; gateway isn't `!inner`) lock
// the CODE. This locks the LIVE CONTRACT: after every edge deploy, the public
// catalog must be reachable AND its preflight must admit the browser's `apikey`
// header AND it must return well-formed JSON. If not, the deploy FAILS loudly
// instead of the regression surfacing when a user complains.
//
// It deliberately does NOT assert count > 0 — zero published classes in a track
// is a legitimate content state (e.g. Advanced Training today), not a contract
// break. It asserts the SHAPE and the REACHABILITY, which is what "the page can
// load the catalog at all" means.
//
// Resilience: it runs seconds after `supabase functions deploy`, when a function
// can still be cold-starting or briefly 5xx. A single-shot check would false-FAIL
// a good deploy — worse than no gate, because a flaky gate gets ignored. So each
// request has an 8s timeout (matching the frontend `use-public-catalog` client)
// and retries with backoff; only a PERSISTENT failure fails the deploy. This
// mirrors the deploy step's own 3×-retry treatment of transient Supabase calls.
//
// Usage: node scripts/ci/smoke-public-catalog.mjs <base-url>
//   base-url e.g. https://<ref>.supabase.co/functions/v1
// Unit-tested by src/test/smoke/smoke-public-catalog.test.ts — the exported
// predicates AND checkGateway (the layer that gates the deploy) have
// discriminating cases, per verifiable-quality-gates.

/** True when an Access-Control-Allow-Headers value admits the `apikey` request header. */
export function preflightAllowsApikey(allowHeadersValue) {
  if (typeof allowHeadersValue !== "string" || allowHeadersValue.length === 0) return false;
  return allowHeadersValue
    .toLowerCase()
    .split(",")
    .map((h) => h.trim())
    .includes("apikey");
}

/** True when `json` is an object carrying an array under `key` (the feed's shape). */
export function isWellFormedList(json, key) {
  return !!json && typeof json === "object" && Array.isArray(json[key]);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Each public gateway + the response array its feed must carry.
const GATEWAYS = [
  { path: "public-classes", key: "classes" },
  { path: "public-courses", key: "courses" },
];

/**
 * Fetch with a per-request timeout and retry on transient failure (network
 * reject or 5xx). Returns the final Response; throws only if every attempt threw.
 * Injectable `fetchImpl` keeps it unit-testable without a live network.
 */
async function fetchWithRetry(url, opts, { fetchImpl, attempts, timeoutMs, backoffMs }) {
  let lastErr = null;
  let lastRes = null;
  for (let i = 1; i <= attempts; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      lastRes = await fetchImpl(url, { ...opts, signal: ctrl.signal });
      lastErr = null;
      // A 5xx right after deploy is likely a cold start — retry it.
      if (lastRes.status >= 500 && i < attempts) {
        await sleep(backoffMs * i);
        continue;
      }
      return lastRes;
    } catch (e) {
      lastErr = e;
      if (i < attempts) await sleep(backoffMs * i);
    } finally {
      clearTimeout(timer);
    }
  }
  if (lastErr) throw lastErr;
  return lastRes; // exhausted retries on a 5xx — return it so the caller reports the status
}

/**
 * Check one public gateway's LIVE contract. Returns an array of problem strings
 * (empty = healthy). Exported so the deploy-gating logic is itself tested.
 */
export async function checkGateway(base, { path, key }, opts = {}) {
  const {
    fetchImpl = fetch,
    attempts = 3,
    timeoutMs = 8000,
    backoffMs = 2000,
    log = console.log,
  } = opts;
  const url = `${base}/${path}`;
  const retry = { fetchImpl, attempts, timeoutMs, backoffMs };
  const problems = [];

  // 1) CORS preflight must admit `apikey` (the exact header the raw-fetch client sends).
  let preflight;
  try {
    preflight = await fetchWithRetry(
      url,
      {
        method: "OPTIONS",
        headers: {
          Origin: "https://techfleet.network",
          "Access-Control-Request-Method": "GET",
          "Access-Control-Request-Headers": "apikey, content-type",
        },
      },
      retry,
    );
  } catch (e) {
    problems.push(`${path}: preflight request failed after ${attempts} attempt(s) — ${e.message}`);
    return problems; // unreachable — nothing more to check
  }
  const allow = preflight.headers.get("access-control-allow-headers");
  if (!preflightAllowsApikey(allow)) {
    problems.push(`${path}: CORS preflight does not admit "apikey" (allow-headers: ${allow ?? "<none>"})`);
  }

  // 2) GET must be 200 and return the feed's array shape.
  let res, body;
  try {
    res = await fetchWithRetry(url, { headers: { "Content-Type": "application/json" } }, retry);
    body = await res.json();
  } catch (e) {
    problems.push(`${path}: GET failed or returned non-JSON after ${attempts} attempt(s) — ${e.message}`);
    return problems;
  }
  if (res.status !== 200) {
    problems.push(`${path}: GET returned HTTP ${res.status} (expected 200)`);
  }
  if (!isWellFormedList(body, key)) {
    problems.push(`${path}: response has no "${key}" array (got keys: ${Object.keys(body ?? {}).join(", ") || "<none>"})`);
  } else if (problems.length === 0) {
    log(`  ✓ ${path}: HTTP ${res.status}, preflight admits apikey, ${body[key].length} item(s)`);
  }
  return problems;
}

async function main() {
  const base = (process.argv[2] || process.env.PUBLIC_FUNCTIONS_BASE_URL || "").replace(/\/+$/, "");
  if (!base) {
    console.error("Usage: node scripts/ci/smoke-public-catalog.mjs <base-url>  (e.g. https://<ref>.supabase.co/functions/v1)");
    process.exit(2);
  }
  console.log(`smoke-public-catalog: checking live public catalog at ${base}`);
  const all = [];
  for (const gw of GATEWAYS) all.push(...(await checkGateway(base, gw)));

  if (all.length > 0) {
    console.error("\n✗ public catalog contract FAILED:");
    for (const p of all) console.error(`  - ${p}`);
    console.error(
      "\nA logged-out visitor cannot load the catalog. This is the recurring failure mode: " +
        "the fix is in the source but the LIVE function is broken (CORS/reachability/shape).",
    );
    process.exit(1);
  }
  console.log("\n✓ public catalog contract OK — logged-out visitors can load the catalog.");
}

// Run only when invoked directly (not when imported by the unit test). Under
// vitest, process.argv[1] is the test runner entry, so neither branch matches
// and main() does not fire.
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("smoke-public-catalog.mjs")) {
  main();
}
