## Current state

Project blasts already send **one transactional email per recipient** through the queue — each recipient's email goes only to them, so no recipient ever sees another recipient's address in `To:`/`Cc:`. The "BCC privacy" goal is therefore already met by the existing 1:1 architecture (the email API has no batch/BCC field).

What's missing: the **admin sender does not currently receive a copy** of the blast they send.

## Change (one edge-function edit + one BDD addition)

**File:** `supabase/functions/send-project-blast/index.ts`

1. After the recipient list is built (line ~168) and before the send loop, look up the sender's profile email (already fetched at line ~171 as `senderProfile.email`).
2. If `senderProfile.email` is present and not already in the recipient list (case-insensitive match), append a synthetic recipient `{ user_id: userId, email: senderProfile.email, firstName: senderProfile.first_name }` with an `isSenderCopy: true` flag.
3. In `processOne`:
   - Use idempotency key `blast-${blastId}-sender-${userId}` for the sender copy so retries are safe and it never collides with a real recipient row.
   - Skip the in-app `notifications` insert for the sender copy (they triggered it — don't self-notify).
   - Still record a `project_blast_recipients` row with a marker (`error: 'sender_copy'` or a new boolean column is overkill — reuse the `email_status` field; the email_hash differs so no UNIQUE collision).
4. Bump `recipient_count` and `email_sent_count` accounting to include the sender copy (or, cleaner, exclude it from `recipient_count` by tracking `senderCopySent` separately and only adding to `email_sent_count`). Pick: **exclude from `recipient_count`** so the audit/UI still says "you emailed N applicants" — the sender copy is bookkeeping, not an applicant.

**Privacy reaffirmation (no code change needed):** Document in the function header comment that 1:1 sends are the BCC equivalent — no `Cc`/multi-`To` is ever constructed.

**BDD scenarios** (append to `bdd_scenarios`): 
- `PB-021` — Admin sender receives a self-copy of every blast they send (idempotency key `blast-{id}-sender-{userId}`, no duplicate notification row).
- `PB-022` — Recipient email headers contain only the recipient's own address (no other recipient leaked via Cc/To). Asserts on `project_blast_recipients` count == applicants count, and sender copy row has distinct `email_hash`.
- `PB-023` — If the sender's email is already in the applicant list (sender applied to their own project), no second copy is sent (dedupe by case-insensitive email).

## Out of scope

- No DB schema changes — `project_blast_recipients` already has `email_hash`, `email_status`, `email_message_id`, no UNIQUE on `(blast_id, user_id)` that would block a sender copy with the same `user_id` only if it exists; if it does exist, we'll dedupe by email instead and skip writing a recipient row.
- No UI changes (the composer empty-state, history widget, and recipient counts continue to work; sender copy is invisible).
- No template changes — the existing `project-blast` template is reused for the sender copy.
- No rate-limit change.

## Risk

Low. One extra queued email per blast (capped by existing 5/hr rate limit). Idempotency key prevents duplicates on retry. If the sender's email is missing/invalid, the copy is silently skipped (already covered by the `recipients.filter((r) => r.email)` pattern).
