---
name: Terms Enforcement
description: How the platform actually enforces the Terms & Conditions and Terms of Use — age 18 default, guardian flow 13–17, server-side acknowledgments, sanctions screening, recording consent, dispute SLA
type: feature
---
- Min age 18 (`minAgeForCountry` always returns 18). 13–17 requires guardian email; under 13 is rejected.
- `recordPolicyAcknowledgment` calls the `record-policy-acknowledgment` edge fn → `record_policy_ack` SECURITY DEFINER RPC → `policy_acknowledgments` row with IP/UA/electronic-comms flag. localStorage is fallback only (`tfn.policy_ack_pending` replayed via `flushPendingPolicyAcknowledgment`).
- Current versions live in `policy_versions` (one `is_current=true` per `policy_key`); use `CURRENT_POLICY_VERSION` constant.
- Sanctions: `screen-sanctions` edge fn checks `EMBARGOED_COUNTRIES` (CU/IR/KP/SY/RU/BY/MM + UA-43/14/09); deny blocks signup and writes `sanctions_screenings`. List version pinned in `_shared/compliance.ts`.
- Recording consent: `recording_consents` per session; `revoke-recording-consent` edge fn flips the row.
- Disputes: `submit-dispute` → `dispute_intake`; admins must resolve within 30 days (T&C §20).
- DPA: `dpa_executions` per client (admin-only); satisfies T&C §21 / GDPR Art. 28.
- Address everywhere: `8 The Grn Suite 6269, Dover, DE 19901` · `302-497-4065` · `info@techfleet.org`.
