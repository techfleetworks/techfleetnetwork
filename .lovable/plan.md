# Compliance Plan — Terms & Conditions + Terms of Use

I read both policies end-to-end against the codebase, DB schema, auth flow, footer, registration, Fleety, recording flow, and the existing `recordPolicyAcknowledgment` helper. The documents make ~21 enforceable promises. The platform currently honors maybe a third of them. This plan closes every gap, in order of legal risk.

## Audit findings (current vs required)

| # | Document promise | Current state | Gap |
|---|---|---|---|
| 1 | T&C §2 / ToU §2 — ≥18, or 13–17 with verifiable parent/guardian consent | `minAgeForCountry` defaults to **13**; no guardian flow; `profiles` stores only `birth_year` | Default age 18; add 13–17 guardian-consent path; store full DOB |
| 2 | T&C §23 / ToU §19 — material-change re-acceptance | `recordPolicyAcknowledgment` writes to **localStorage only**; no version table; no re-prompt | DB-backed acknowledgments + version gate |
| 3 | ToU §18 — electronic-communications consent | Implicit only | Explicit checkbox at signup, recorded |
| 4 | T&C §19 / ToU §17 — sanctions & export controls | No screening | Block embargoed countries at signup; deny-list audit |
| 5 | T&C §11 — recording consent + revocation by email | `VideoRecorder` exists, no consent record, no revocation endpoint | Per-session consent row + `/legal/revoke-recording` form → `info@techfleet.network` |
| 6 | T&C §9 — EU 14-day right of withdrawal | No paid flow yet, no cancel route | `/legal/cancel-paid-service` form (gated, future-proof) |
| 7 | ToU §11 — self-serve account deletion | Exists | Verify + link from footer |
| 8 | T&C §21 — GDPR Art. 28 DPA when processor for client | No DPA template surfaced | Add DPA artifact + admin "Send DPA" action on Clients |
| 9 | ToU §4 — acceptable use (no scraping/bots/abuse) | Partial (rate limits) | Add abuse-report route + WAF hint headers; document existing controls |
| 10 | ToU §9 — Beta/AI disclaimer on AI outputs | Fleety lacks an in-line disclaimer | Add persistent "Beta · may be inaccurate · not professional advice" line in Fleety UI |
| 11 | ToU §5/§47 — TM notice | Footer missing ™ + ownership line | Add `Tech Fleet™ © 2026` + DMCA link |
| 12 | T&C §20 — informal 30-day dispute resolution | No intake | `/legal/dispute` form → audit row + email |
| 13 | T&C §4 — Code of Conduct as binding doc | No CoC page | Add `/code-of-conduct` policy page + acceptance |
| 14 | T&C §24 / ToU §21 — correct postal address | Says "Programs Office, Delaware, USA" | Replace with `8 The Grn Suite 6269, Dover, DE 19901` and `302-497-4065` |
| 15 | T&C §23 — versioned effective dates per doc | Single `POLICY_LAST_UPDATED` constant | Per-policy version + checksum |

## Changes to ship

### 1. Database (one migration)

```text
policy_versions (
  policy_key text,            -- 'terms','terms-of-use','privacy','cookies','accessibility','code-of-conduct'
  version text,               -- 'YYYY-MM-DD'
  effective_at timestamptz,
  checksum text,              -- sha256 of markdown source
  is_current boolean,
  PRIMARY KEY (policy_key, version)
)

policy_acknowledgments (
  id uuid pk, user_id uuid null, anon_id text null,
  policy_key text, version text,
  method text check (method in ('checkbox','google-oauth','re-accept','registration')),
  ip inet, user_agent text, accepted_at timestamptz default now(),
  electronic_comms_consent boolean default false
)

recording_consents (
  id uuid pk, user_id uuid, session_ref text, granted boolean,
  granted_at timestamptz, revoked_at timestamptz null,
  scope text check (scope in ('this-session','future-uses'))
)

sanctions_screenings (
  id uuid pk, user_id uuid, country_code text, decision text,
  list_version text, screened_at timestamptz default now()
)

dispute_intake (
  id uuid pk, user_id uuid null, email citext, summary text,
  created_at timestamptz, resolved_at timestamptz null
)

dpa_executions (
  id uuid pk, client_id uuid, signed_by text, signed_at timestamptz,
  pdf_storage_path text, version text
)
```

`profiles`: add `birth_month`, `birth_day`, `guardian_email`, `guardian_consent_token`, `guardian_consent_at`, `electronic_comms_consent_at`. RLS: user reads own; admins read all; inserts via SECURITY DEFINER RPCs. Strict triggers (no PII in audit columns; hash-chain audit_log entry on every acknowledgment).

### 2. Edge functions

- `record-policy-acknowledgment` — server-side insert with IP+UA, validates current `policy_versions`.
- `screen-sanctions` — checks country against U.S. OFAC/EU/UK embargoed list (Cuba, Iran, North Korea, Syria, Crimea, Donetsk, Luhansk, Russia per export-control flag); returns deny + reason; logs to `sanctions_screenings`.
- `revoke-recording-consent` — flips row, queues email to `info@techfleet.network`, notifies user.
- `submit-dispute` — writes `dispute_intake`, emails legal alias, starts 30-day SLA timer (digest reminder).
- `request-guardian-consent` — emails guardian a signed token link; on click → signs and updates `profiles`.

All functions: JWT or service-role validation per Core rule.

### 3. Frontend

- **RegisterPage**: full DOB picker; default `minAgeForCountry` → **18**; if 13–17 → guardian-consent sub-flow (must complete before sign-in unlocks); explicit "I agree to receive electronic communications" checkbox; sanctions screen call before account creation.
- **LegalPolicyPanel**: on accept, call `record-policy-acknowledgment` (not just localStorage); fall back to localStorage only if offline + retry on next sign-in.
- **Re-acceptance gate**: `usePolicyVersionGate` hook in `AppLayout` blocks app shell with a non-dismissible re-accept sheet when any `is_current` version > user's last ack.
- **Footer (`AppFooter`)**: add `Tech Fleet™ · © 2026 · 8 The Grn Suite 6269, Dover, DE 19901 · 302-497-4065 · info@techfleet.network`; add Code of Conduct, Dispute Resolution, DMCA, Cancel Paid Service links.
- **Fleety**: persistent caption "Beta — Fleety can be inaccurate. Do not rely on it for legal, financial, medical, or other professional advice."
- **VideoRecorder**: pre-recording consent modal with scope choice (this session / future use); writes `recording_consents`; "Revoke future use" link in user settings → calls revoke fn.
- **New routes (all public, no login):** `/code-of-conduct`, `/legal/dispute`, `/legal/revoke-recording`, `/legal/cancel-paid-service`, `/legal/dmca`.

### 4. Admin

- Clients admin: "Send DPA" button → `dpa_executions`; download generated PDF that incorporates GDPR Art. 28 controller-processor terms.
- System Health → new **Compliance** tab: counts of unaccepted-current-version users, pending guardian consents, open disputes (>30d highlighted red), sanctions denials, recording revocations.

### 5. Content fixes (markdown)

Update `public/policies/Terms-and-Conditions.md` §24 and `Terms-of-Use.md` §21 mailing address to:
`Tech Fleet, 8 The Grn Suite 6269, Dover, DE 19901, USA · 302-497-4065`.
Bump `POLICY_LAST_UPDATED` and seed `policy_versions` with checksums of all five markdown files + new Code of Conduct.

### 6. BDD scenarios (inserted into `bdd_scenarios`)

`COMPLY-AGE-001..004` (≥18, 13–17 guardian path, <13 deny, DOB tampering).
`COMPLY-ACK-001..003` (server insert, version gate re-accept, offline retry).
`COMPLY-SANC-001..002` (embargoed country deny, list version recorded).
`COMPLY-REC-001..002` (consent capture + revocation email).
`COMPLY-DISPUTE-001` (30-day SLA digest).
`COMPLY-DPA-001` (admin sends DPA, audit hash chained).
`COMPLY-COMMS-001` (electronic-comms consent stored).
Each with tri-layer Then-clauses [UI]/[DB]/[Code] and `feature_area_number`.

### 7. Memory

New: `mem://compliance/terms-enforcement` summarizing the version-gate rule, age policy, sanctions list source, and dispute SLA. Add Core line: "Acknowledgments are server-side rows in `policy_acknowledgments`; localStorage is fallback only."

## Out of scope (deferred, called out so we don't pretend)

- Building an actual paid-billing/Stripe flow — only the cancellation intake is created now, gated until billing exists.
- Live OFAC SDN per-name screening — country-level only this pass; per-name list ingestion is a follow-up.
- Translating policy markdown into all i18n locales — we route to existing translation cache; English is canonical for now.
- Court-grade e-signature for DPA — generated PDF with typed name + IP/UA is acceptable for B2B per current ESIGN/eIDAS guidance; Adobe Sign integration is future work.

Approve and I'll implement in this order: migration → edge functions → server-side ack wiring → registration overhaul → version gate → footer/disclaimers → admin compliance tab → BDD + memory.
