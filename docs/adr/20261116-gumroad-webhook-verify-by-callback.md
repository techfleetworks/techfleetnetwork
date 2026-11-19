# 20261116 — Gumroad webhook auth: verify-by-callback is the boundary; the URL secret is non-authoritative

- Status: Accepted (locked by mdenner, 2026-11-16)
- Date: 2026-11-16
- Deciders: product owner (mdenner), engineering
- Area: `supabase/functions/gumroad-webhook/` (shared membership + class registration ingestion)
- Related: class-registration-spec.md §2.12, Notion ticket 34c1a3bddce58092864bc1ac090fe335 §6.6/§6.7, ADR-0037 (signed identity token)

## Context

The Gumroad Ping webhook is currently authenticated by a shared secret passed in
the URL query (`?secret=`, constant-time compared) plus a `seller_id` match
(`gumroad-webhook/index.ts:114,139`).

A URL secret over HTTPS is a **legitimate auth layer**, not a broken one: TLS keeps
the query string off the wire, and with access-controlled log sinks that do not
capture query strings the exposure is small. The concern is narrower and specific
to this being a **payment / fraud boundary**:

- It is a **single, static, replayable bearer credential**. The security rests on
  that one secret never leaking — across TLS, every log sink / APM added later,
  Gumroad's own storage of the Ping URL, rotations, and everyone who touches it.
- A leak would be **undetectable** — no signal, so no prompt to rotate — while the
  payload fields (`product_id`, `price`, `email`) are caller-supplied once past the
  secret. A single undetected leak would let forged sales be granted.

This does not make the secret "insecure"; it makes it an unnecessary **single point
of failure** on a boundary that grants paid access. Gumroad's own guidance for
legacy (unsigned) pings — **take only the sale id and fetch the sale from the
Gumroad API** — removes that single point of failure for ~nothing (the reconcile
sweep already calls the same API).

## Decision

1. **Verify-by-callback is THE authorization boundary.** Before any grant, fetch
   the sale from the Gumroad API by `sale_id` using the server-side access token;
   grant only if Gumroad confirms a real, matching, non-refunded sale. The URL
   secret becomes **non-load-bearing** — a leaked/replayed secret grants nothing
   because the API lookup fails.
2. **Enable Gumroad's opt-in Ping signing if it is confirmed live** —
   `X-Gumroad-Signature` (`t=<ts>,v1=<HMAC-SHA256(ts+body)>`); verify the
   signature AND the timestamp age. This is **unconfirmed in official Gumroad
   docs** (seen only in an antiwork/gumroad PR) — verify before relying on it; do
   not block the design on it.
3. **Demote the URL secret to a cheap DoS/noise pre-filter**: rotate it, and add
   **rate-limiting + the shared WAF** (the webhook has neither today — only a
   16 KB body cap). Move it off the query string if feasible, but never rely on it
   for auth.
4. **Defense in depth, unchanged:** idempotent by `sale_id`; refund/dispute/cancel
   downgrade via the projector; the **reconcile sweep removes any grant with no
   real Gumroad sale** and alerts; the **verified-email gate** applies to
   email-matched grants (the signed-token path is exempt).
5. **Failure mode (fail-safe):** if the Gumroad API is down or times out at grant
   time, stay **`pending`** and let the reconcile sweep heal it — never grant on
   error, never block indefinitely.

## Consequences

- A leaked webhook secret no longer equals free access — the boundary moved from a
  static URL secret to a live, per-sale confirmation.
- Adds a Gumroad API dependency on the grant path; mitigated by fail-to-pending +
  reconcile (reading registrations never calls Gumroad, so existing members are
  unaffected during a Gumroad outage).
- **Honest guarantee** (not "cannot fail"): ≥99.9% of paid sign-ups granted within
  the target time; **zero** paid-but-no-access past the limit; **zero**
  access-without-a-real-sale **persisting past the reconcile window** (during the
  window it is non-zero — the sweep cadence is the exposure bound, and must be
  stated).
- **Ownership / behavior change:** implemented by the class-registration program
  (Phase 0 / engine) on the **shared** handler. The verified-email gate changes
  **membership** grant behavior too (today membership grants on an unconfirmed-email
  match), so it needs an explicit membership decision + a backfill/again-check, not
  a silent additive change.

This supersedes the "move the secret to a header" framing in class-registration-spec
§2.12.3 as the primary control: a header move is at best a minor hardening and is
only possible via Gumroad's opt-in signing — verify-by-callback is the control that
actually holds.
