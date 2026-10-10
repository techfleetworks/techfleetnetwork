# ADR 0066 — Pin patched `undici` & `ip-address` via npm `overrides` to clear the dependency-advisory gate

- Status: Proposed
- Date: 2026-09-29
- Deciders: Morgan Denner (owner explicitly chose **upgrade over waiver**)
- Epic: Security / Supply-chain / CI gates
- Related:
  - `scripts/ci/check-dependency-advisories.mjs` — the blocking `dependency-advisories` gate (runs
    `npm audit --json`, hard-fails on any advisory not covered by an unexpired waiver).
  - `security-advisories.waivers.json` — the expiring waiver allow-list (the ONLY bypass). **No entry added here.**
  - `package.json` (`overrides`) + `package-lock.json` — the fix surface.
  - Advisories cleared: `undici` GHSA-3wwx-pv8p-q78v; `ip-address` GHSA-rpw4-54j3-4h4q and GHSA-2vr4-cq9g-pvrc.
  - Unblocks PR #401 (shipathon application-resume fix, ADR-0065) and every other PR — the gate is red on
    `main` independently of any PR's code.
  - Prior art: ADR-0041 (dependency-advisory blocking gate + waiver model); the `esbuild`/`undici`/`fast-uri`
    security pins already in `overrides`.

## Context

The `dependency-advisories` gate went **red** with **3 un-waived transitive moderate advisories**, so it blocked
every PR:

- **moderate** `undici` — GHSA-3wwx-pv8p-q78v — DoS via unhandled error in WebSocket permessage-deflate
  decompression (vulnerable `>=7.28.0 <7.29.1`).
- **moderate** `ip-address` — GHSA-rpw4-54j3-4h4q — `Address6.isLinkLocal()` treats `fe80::/64` as `fe80::/10`
  → SSRF / trust-boundary bypass (vulnerable `<=10.5.0`).
- **moderate** `ip-address` — GHSA-2vr4-cq9g-pvrc — no classifier for NAT64 `64:ff9b:1::/48`
  → SSRF / trust-boundary bypass (vulnerable `>=10.2.0 <=10.5.0`).

This was **not** caused by PR #401 (it changed no dependencies); `main` was in the same state. Both packages are
**transitive and dev-/tooling-only**, confirmed by the dependency tree and by their lockfile metadata:

- `undici@7.29.0` ← `jsdom` (a **devDependency** — Vitest's test DOM). Absent from the production dependency tree
  (`npm ls --omit=dev` does not list it); its lockfile node is `"dev": true`. Vite bundles only what `src/`
  imports, so `undici` is never in the shipped browser bundle, and the Deno edge functions have a separate module
  graph. In the browser, WebSocket is the native platform API, not `undici`.
- `ip-address@10.5.0` ← `@cyclonedx/cyclonedx-npm` → `libxmljs2` → `node-gyp` → `make-fetch-happen` →
  `@npmcli/agent` → `socks-proxy-agent` → `socks`. That is the **SBOM generator CLI** (`npm run sbom`), run in CI
  only; its lockfile node is `"optional": true`. `ip-address` parses SOCKS-proxy addresses — only exercised when
  dialing through a SOCKS proxy to untrusted addresses, which CI does not do.

This app ships a **static Vite bundle served by nginx — there is NO prod Node server** (`CLAUDE.md` §Commands),
so a Node-only DoS/SSRF living in build/test tooling is **not reachable in production**. That alone would make a
waiver defensible — but it is unnecessary here, because a clean upstream fix exists for all three.

A stale pin masked how easy the fix was: `overrides` already carried `"undici": "^7.29.0"`, a floor set **below**
the `7.29.1` patch, so the lockfile stayed resolved at the vulnerable `7.29.0`. The maintainer had already chosen
the override mechanism for `undici`; the pin simply predated the patch.

## Decision drivers

- **Real fix over waiver.** `CLAUDE.md`: "prefer a real fix… never weaken security." A waiver suppresses a known
  advisory; when a patched version exists, waiving would hide a _fixable_ vulnerability. Owner confirmed: upgrade.
- **Smallest change that fully solves it.** No app-code or schema change; touch only the two dependency files.
- **Match the surrounding code.** `overrides` is already this repo's mechanism for security/compat transitive
  pins (`esbuild`, `undici`, `fast-uri`, `@tootallnate/once`).
- **Keep the gate honest.** The gate going red is the system working; the response is to remove the vulnerable
  code, not to lower the gate or grow the waiver file.

## Decision

Fix all three advisories by **upgrading the vulnerable transitives through npm `overrides`**, and refresh the
lockfile. No waiver entries.

```jsonc
// package.json > overrides
"undici": "^7.29.1",      // was "^7.29.0" — floor raised above the GHSA-3wwx-pv8p-q78v patch; resolves 7.30.0
"ip-address": "^10.7.2",  // new — above the <=10.5.0 vuln range; clears GHSA-rpw4-54j3-4h4q + GHSA-2vr4-cq9g-pvrc
```

Resolved by `npm install` (lockfile only where native postinstalls are irrelevant): `undici` → **7.30.0**
(dev), `ip-address` → **10.7.2** (optional). Both stay inside their single consumer's declared range —
`jsdom` needs `undici@^7.25.0`, `socks` needs `ip-address@^10.0.1` — so the override resolves cleanly with no
peer conflict. The diff is exactly two files (2 override lines; 6 changed lockfile lines).

## Security model

- The override **removes the vulnerable code from the installed tree** — this is a stronger outcome than a
  reachability-based waiver: even the dev/CI tooling paths (Vitest, SBOM generation) now run patched versions.
- Defense-in-depth beyond the pin: neither package is in a shipped artifact — `undici` (test-only) and
  `ip-address` (CI SBOM tool) are excluded from the nginx-served browser bundle and from the Deno edge functions,
  so even a future regression in these packages could not reach production users.
- Nothing is hidden: `security-advisories.waivers.json` is unchanged, so the gate still hard-fails on any _new_
  unwaived advisory. The one remaining waiver (`quill` GHSA-v3m3-f69x-jf25, low, DOMPurify-mitigated) is
  untouched and unexpired.

## Alternatives considered

- **Add expiring waivers (dev/tooling-only rationale).** Rejected: a clean patched version exists; waiving would
  record a mitigation for a vulnerability we can simply delete. Reserved for advisories with no upstream fix
  (the `quill` case). Owner explicitly chose the upgrade.
- **Bump the direct dep instead (`jsdom` 29→30, or `@cyclonedx/cyclonedx-npm`).** Rejected: a major `jsdom` bump
  changes the test DOM for a _patch-level_ `undici` fix; `ip-address` sits 7 levels under an SBOM CLI whose bump
  would not deterministically move the deep `socks` pin. Larger and riskier for zero added benefit.
- **Leave `undici: ^7.29.0` and rely on `npm update`.** Rejected: non-deterministic and silent; raising the
  override floor is self-documenting and forces re-resolution above the patch.
- **Weaken the gate (severity threshold / disable).** Rejected: the gate is the enforcement mechanism; weakening
  it to pass is exactly the anti-pattern `CLAUDE.md` forbids.

## Consequences

**Good**

- `dependency-advisories` is green; PR #401 and all PRs are unblocked.
- The vulnerable `undici`/`ip-address` code is gone from the tree, not merely annotated.
- Minimal, in-pattern change (two files); trivially reversible (revert the diff).

**Trade-offs / honest limits**

- Override floors need occasional maintenance; the gate is what catches a stale floor by going red — which is
  exactly what surfaced this one. That feedback loop is the intended behavior, not a defect.
- `overrides` are global. Both pins are compatible supersets of their only consumers' ranges, so there is no
  collateral downgrade/upgrade risk here; a future new consumer with a stricter range would surface at
  `npm install`.
- **Noted follow-up (out of scope):** `@cyclonedx/cyclonedx-npm` is a build-time CLI declared in `dependencies`
  rather than `devDependencies`. It is not imported by the app and not in the bundle, so this ADR does not move
  it; flagged for a separate cleanup.

**Rollout (`release-deployment-safety`)**

- `package.json` + `package-lock.json` only. **No schema migration, no app-code change, no edge-function change.**
- Dev/CI-only dependencies are not in the Cloudflare Pages bundle, so there is no runtime/deploy behavior change
  for users. Rollback = revert the two-file diff; instant.

## Confirmation

- **Gate (the deliverable):** `node scripts/ci/check-dependency-advisories.mjs` exits **0** — "1 advisory
  examined across 2 vulnerable package path(s); 1 waived, 0 unwaived, 0 expired." `npm audit` shows the three
  moderate advisories gone; only the pre-existing waived `quill` (low) remains.
- **Tests:** `npm run test` (Vitest) — **2526 passed, 69 skipped**. The only failures are **pre-existing /
  environmental on the dev box, not caused by this change**, verified by re-running them in isolation:
  - `AdminProjects.test.tsx` (PROJECT-007) and `check-auth-warn-snapshot.smoke.test.ts` (AWS-005) time out
    only under full-suite load (`environment` setup ~2473s on this OneDrive-backed Windows box, `rg` absent
    from PATH); both **pass when the files are run in isolation**.
  - `llm-arch-review.smoke.test.ts` fails to load with a transform `SyntaxError` on this Windows toolchain
    (the imported `scripts/ci/llm-arch-review.mjs` passes `node --check`); it is a CI smoke test owned by
    PR #318, unchanged here.
    This change cannot affect any of them: `ip-address` is never loaded at test time, `undici` is only jsdom's
    fetch backend (none of the three make network requests), and none of the three files touch either package.
    **CI is the source of truth** (`CLAUDE.md` §Commands) for the full green — clean Linux infra has `rg`
    present, no OneDrive latency, and no msys-fork flakiness.
- **Architecture gate (both halves):** `npm run check:architecture` exits 0 (mechanical — "scanned 2 file(s),
  PASS"), and `judge-arch` returns **PASS** — no boundary, data-ownership, dependency-direction, or
  error-handling surface changed (dependency-config only); it also confirmed no waiver was added and the
  lockfile re-resolution is limited to the two packages.

## Addendum (2026-10-08) — prune the now-unused `undici` / `ip-address` waivers

The original ADR-0065-era waivers for `undici` (GHSA-3wwx-pv8p-q78v) and `ip-address`
(GHSA-rpw4-54j3-4h4q, GHSA-2vr4-cq9g-pvrc) predated this ADR's `overrides`. Once the overrides pinned
patched versions (`undici ^7.29.1`, `ip-address ^10.7.2`), `npm audit` stopped reporting those
advisories, so the three waivers became dead entries. Because the gate **fails on any expired waiver,
needed or not** (`check-dependency-advisories.mjs`: "Expired waivers are themselves a failure"), leaving
them would have turned into a spurious CI failure on their 2026-12-31 expiry. They are removed here.
`security-advisories.waivers.json` now carries only the two still-active waivers — `quill` and `braces`
(no upstream patch; both documented, mitigated, expiring). Verified: `check-dependency-advisories.mjs`
exits 0 (2 advisories examined, 2 waived, 0 unwaived, 0 expired).

**Deliberately deferred (not done here):** `dompurify` and `sharp` are pinned both as direct deps and
in `overrides` at the same version. This is harmless (belt-and-suspenders, no CI/security/expiry impact);
removing the redundant pin safely requires a full lockfile regeneration plus a dependency-tree check to
confirm no transitive consumer regresses — disproportionate for a cosmetic change, so it is left for a
future deps pass.
