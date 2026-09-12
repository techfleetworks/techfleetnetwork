# ADR 0041 — Gumroad purchase side-effects: derive emails (and, later, account provisioning) off the ledger

- Status: Accepted
- Date: 2026-09-12
- Deciders: TechFleet (owner)
- Extends: [ADR-0037](0037-membership-ledger-source-of-truth.md) (ledger/projection) and
  [ADR-0038](0038-gumroad-identity-resolution.md) (identity resolution) — changes neither.
- Related: `supabase/migrations/20260912130000_gumroad_purchase_email.sql`,
  `supabase/tests/gumroad_purchase_email_test.sql`,
  `supabase/functions/_shared/email/domain/email-tiers.ts`, ADR-0018 (transactional/marketing
  scope separation), the v2 email pipeline (`email_outbox` → `email-dispatcher` → Resend).

## Context and problem statement

The ledger recognizes membership, but a purchase produces **no member-facing side-effects**.
Two use cases were requested:

- **UC2** — when *anyone* pays for **membership** and their email already maps to a platform
  user: record it (already done) **and send them a confirmation email**.
- **UC1** — when a **non-user** pays for membership: **create an account** (Supabase auth
  invite) and send them a confirmation email; the existing profile-insert trigger then
  attaches their pending sale and projects membership.

Both must be **fail-proof** (a missed webhook, a provider hiccup, or a replay must never
double-send or silently drop) and must not weaken the frozen auth layer.

## Decision drivers

- Exactly-once + self-healing, driven off durable ledger state — the property that makes it
  "structurally impossible to fail."
- Reuse existing infrastructure (the v2 `email_outbox`, `enqueue_email_v2`, the dispatcher's
  retries + global-suppression enforcement); do not build a second email path.
- Keep the webhook dumb (it only records the sale).
- UC1 creates `auth.users` → the **frozen auth zone** (06-auth-flow-lockdown): it must ship
  in-repo, gated on the auth regression suite — never in an external tool holding the
  service-role key (n8n was considered and rejected for this write for that reason).
- Scope: **membership purchases only** (owner decision) — a one-off masterclass buyer is not
  auto-emailed or auto-provisioned.

## Considered options

1. **Do the side-effects inside the webhook, inline.** Rejected: a webhook timeout or a flaky
   provider silently drops the email, and Gumroad retries double-send. Not exactly-once.
2. **Orchestrate in n8n.** Rejected for these writes: account creation is frozen-auth (can't
   live outside the repo/regression suite) and would put the service-role key in a third
   party; and n8n executions aren't transactional with the DB, so exactly-once is harder, not
   easier. (n8n remains the right tool for downstream *external fan-out* — Slack/Discord/
   EmailOctopus — off a single "member recognized" event.)
3. **Derive side-effects off the ledger, exactly-once (chosen).**

## Decision outcome

**Chosen: option 3.** Side-effects are idempotent projections of the ledger, split by risk:

**UC2 — purchase email (this PR, no auth changes).** A trigger on `gumroad_sales`
(`trg_gumroad_sales_purchase_email`) enqueues a **Tier-0** transactional `founding-purchase`
email via `enqueue_email_v2` (the established DB-trigger→v2 pattern). It fires only when a sale
becomes **linked to a user**, is a **cataloged membership SKU**, and is **active**
(not refunded/disputed). Exactly-once is structural: the `idempotency_key`
`founding-purchase:<sale_id>` collides on re-fire (`ON CONFLICT DO UPDATE`), so a replay or
re-projection never sends twice. The enqueue is exception-wrapped so an email failure never
rolls back the sale. Tier 0 reads no member preference; only global suppression (at dispatch)
can stop it. Copy ships as a clearly-marked **placeholder**, replaced later via a follow-up
migration.

**UC1 — account provisioning (next PR, frozen-auth, gated on the regression suite).** A worker
that claims `pending_user` membership sales and calls `auth.admin.inviteUserByEmail`;
`handle_new_user` creates the profile and `trg_profile_resolve_pending` attaches the sale and
projects membership. The invite's confirmation email is GoTrue's existing `invite` template —
no new template. Not in this PR because it touches auth.

## Consequences

**Good**
- Exactly-once + self-healing (idempotency_key + a trigger that re-fires harmlessly); reuses
  the v2 outbox, dispatcher retries, and suppression — no second email path.
- Membership-scoped; the webhook stays dumb; the ledger/projector are untouched.
- Clean seam for the deferred UC1 and for n8n external fan-out later.

**Bad / accepted**
- The email HTML/text lives inline in the migration (matching the DB-trigger convention), so
  changing copy needs a follow-up migration — accepted; a future move to the edge template
  registry is possible if copy iterates often.
- UC1 (the account-creation half) is deferred to its own gated PR — this PR delivers only the
  existing-user email.
- Recipient is the **purchasing** email (`gumroad_sales.email`); for an alias-resolved sale
  that is the alias, not the account's primary email — acceptable for a purchase confirmation.
- Exactly-once holds against **re-fires/replays** (the `idempotency_key`). A *hard* enqueue
  failure (rare — a local INSERT into `email_outbox`) is surfaced as a `RAISE WARNING` and does
  not roll back the sale, but it is not written to `email_send_log` or durably retried for this
  email. So the guarantee is "exactly-once, never rolls back the sale," not "an enqueue can
  never fail." Follow-up (optional): log a `failed` `email_send_log` row for parity with the
  fanout trigger if this ever proves noisy.

## Confirmation

- `supabase/tests/gumroad_purchase_email_test.sql` (pgTAP): a resolved membership sale enqueues
  exactly one `founding-purchase` email; re-firing never duplicates; a non-membership sale, a
  `pending_user` sale, and a refunded sale each enqueue nothing.
- Email guards: a Tier-0 `founding-purchase` entry is registered in `email-tiers.ts`
  (`check-email-tier-registry`); the send path reads no member preference
  (`check-no-tier0-preference-gate`); it uses `enqueue_email_v2`, not the retired raw queue
  (`check-no-raw-email-enqueue`).
- Mechanical arch gate + `judge-arch` PASS on the diff.
