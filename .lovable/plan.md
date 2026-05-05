
## Goal

1. Extend the existing daily triage digest so each admin email includes a single combined `triage-plans-YYYY-MM-DD.md` attachment containing every triaged/proposed/resolved entry's hypothesis + plan + file list.
2. Add an optional Notion connector so each triaged entry can be pushed to a Notion database as a backlog item.

---

## Part 1 — Markdown attachment in the daily digest

Today the digest runs at 15:00 UTC via `triage-digest-builder` and sends one Discord post + one transactional email per admin. No attachments anywhere in the pipeline.

### Changes

**A. Build the markdown in `triage-digest-builder`**
- After the existing aggregation query, also fetch all `agent_fix_queue` rows whose `status` ∈ (`triaged`, `proposed`, `applied`, `resolved`) updated in the last 24h, plus all currently `pending`/`triaged`/`proposed` open items.
- Render a single markdown doc:
  ```
  # Tech Fleet Triage Report — 2026-05-05
  ## Open (pending/triaged/proposed)
  ### {event_type} — {fingerprint}
  - Status / Severity / Occurrences / First seen / Last seen
  - Root cause hypothesis
  - Proposed fix summary
  - Proposed files (path — change_summary)
  ## Resolved in last 24h
  ...
  ```
- Cap at ~200 entries / 1 MB to stay safely under provider limits.

**B. Add attachment support to the email pipeline**
- Extend `enqueue_email` payload shape to accept `attachments: [{ filename, contentBase64, contentType }]`.
- Update `process-email-queue` to forward `attachments` to the Lovable Email send call.
- Update the `triage-digest` template enqueue call to pass the markdown as a single attachment (`triage-plans-2026-05-05.md`, base64-encoded, `text/markdown`).
- Discord post stays unchanged (a one-line "Full plan doc attached to your email" footer added).

**C. Quiet-day guard unchanged**
- If quiet day, no email = no attachment (already handled).

**D. BDD**
- Add `DIGEST-005` "email contains markdown attachment" + `DIGEST-006` "attachment omitted on quiet days" in `bdd_scenarios`, with [UI]/[DB]/[Code] then-clauses.

---

## Part 2 — Notion backlog sync

Yes, this is supported. Notion is available as a standard connector in this workspace and uses the connector gateway, which means I never see your Notion token — it's stored as `NOTION_API_KEY` and proxied through `https://connector-gateway.lovable.dev/notion/...`.

### Setup steps you'll do once

1. In Notion, create (or pick) a database with these properties:
   - `Name` (title)
   - `Status` (select: Pending, Triaged, Proposed, Resolved, Dismissed)
   - `Severity` (select)
   - `Fingerprint` (text)
   - `Occurrences` (number)
   - `Source` (text)
   - `Last seen` (date)
   - `Lovable URL` (url) — deep link back to System Health → Triage tab
2. Share the database with the Notion connector's integration user.
3. Copy the database ID (32-char hex from the URL).

### Setup steps I'll do

1. Trigger the Notion connect flow so the connection is linked to this project.
2. Add a project setting row (`integration_settings` table, key=`notion_triage_db_id`) so admins can paste the database ID in the System Health → Triage tab without redeploying.
3. New edge function `triage-notion-sync`:
   - Admin-only JWT check.
   - Two modes:
     - `POST { fix_queue_id }` — push one row (called from the Triage tab "Send to Notion" button on a Details dialog).
     - `POST { mode: "auto" }` — invoked at the end of `triage-digest-builder` to push every entry that became `proposed` or `triaged` in the last 24h and doesn't yet have a `notion_page_id`.
   - Uses `https://connector-gateway.lovable.dev/notion/v1/pages` with `Authorization: Bearer LOVABLE_API_KEY` + `X-Connection-Api-Key: NOTION_API_KEY`.
   - On success stores the returned Notion page ID in a new column `agent_fix_queue.notion_page_id` (nullable text) so we never duplicate.
   - On status change to `resolved`/`dismissed`, PATCH the Notion page status to match.
4. Add a "Send to Notion" button + small "Synced ✓" badge in the existing Triage Details dialog.
5. BDD `NOTION-001..004` covering: manual push, auto push from digest, idempotency (no dupes), status update on resolve.

### Cost / safety
- Pure REST calls, no AI.
- Idempotent via `notion_page_id`.
- Service-role/admin gated.
- Failures logged to `audit_log` and surfaced in System Health, never block digest email.

---

## Implementation order (once you approve)

1. DB migration: add `notion_page_id` column + `integration_settings` row helper.
2. Connect Notion connector (interactive prompt to you).
3. Extend email pipeline to support attachments + redeploy `process-email-queue` and `send-transactional-email`.
4. Update `triage-digest-builder` to build markdown + attach + (optionally) call `triage-notion-sync`.
5. New `triage-notion-sync` edge function + Triage tab "Send to Notion" button + DB-ID settings field.
6. Write BDD scenarios.
7. Manually invoke the digest once end-to-end and confirm the email lands with the .md attached and Notion rows appear.

Want me to proceed with both parts, or just Part 1 first and Part 2 after you've created the Notion database?
