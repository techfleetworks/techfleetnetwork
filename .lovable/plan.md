
# Open-Source Ticketing Tool — Evaluation & Integration Plan

## Goal

Pick one self-hostable, open-source ticketing system that can serve **all three** Tech Fleet use cases in one place:
1. Trainee support help desk (questions, account issues, accommodations)
2. Bug & feedback tracking (replaces/augments current Feedback feature)
3. Internal admin task board (Tech Fleet staff work)

The tool must integrate as an **embedded experience**: trainees and admins stay inside Tech Fleet Network, sign in with the same account (SSO), and see ticket status in the existing dashboard.

---

## Candidates Considered

I shortlisted the most actively maintained OSS options that can do help-desk + issue tracking + internal tasks, are self-hostable, and have a real REST/GraphQL API for embedding.

| Tool | License | Stack | Best at | Weak at |
|---|---|---|---|---|
| **Zammad** | AGPLv3 | Ruby on Rails + PostgreSQL | Multi-channel help desk (email, chat, web form), strong SLAs, audit trail, role-based permissions | Heavier ops; not a true Kanban/issue tracker |
| **FreeScout** | AGPLv3 | PHP/Laravel + MySQL | Lightweight email-style help desk, very low resource footprint | Weak for internal task boards / dev bug tracking |
| **Chatwoot** | MIT (Community) | Ruby on Rails + PostgreSQL + Redis | Live chat + omnichannel inbox, modern UI, great embeddable widget | Ticket workflow is conversation-first, less structured statuses |
| **Plane** | AGPLv3 | Next.js + Django + Postgres | Modern Jira-like project/issue tracker, Kanban, cycles, modules | Not a help-desk; no email-to-ticket out of the box |
| **OpenProject** | GPLv3 | Ruby on Rails + Postgres | Project + work-package tracking, gantt, time tracking | Heavy; help-desk side is minimal |
| **Trudesk** | MIT | Node.js + MongoDB | Simple tickets + Kanban + chat in one | Smaller community, slower releases |

### Why most single-purpose tools fall short for "all three"
- Pure help-desks (FreeScout, Zammad) handle trainee tickets well but admins won't enjoy them as a task board.
- Pure issue trackers (Plane, OpenProject) are great for bugs/tasks but trainees would find them intimidating and there's no clean "contact support" surface.
- Chatwoot is closest to "one tool, many uses" because every conversation IS a ticket, statuses (open/pending/resolved/snoozed), labels, teams, custom attributes, and an SDK widget designed to embed in apps with **identity hand-off (SSO via HMAC)**.

---

## Recommendation: **Chatwoot (Community Edition, self-hosted)**

**Why it wins for Tech Fleet:**

1. **Truly embeddable** — Official JS SDK with `setUser()` + HMAC identity verification. Trainees never see a separate login. Matches the "Embedded (SSO + in-app widget)" choice.
2. **One tool, three modes** — Use **Inboxes** to separate concerns:
   - `Trainee Support` (web widget + email)
   - `Bug Reports` (web form from a "Report a bug" button)
   - `Internal Tasks` (admin-only inbox, used like a Kanban via labels + statuses)
3. **MIT license** for Community Edition — safest license for a nonprofit; no AGPL copy-left risk if we ever fork or extend.
4. **Modern UI** — matches our dark/blue aesthetic better than Zammad/FreeScout out of the box, and theming is supported.
5. **Webhooks + REST API** — clean two-way sync into our existing `agent_fix_queue`, `feedback`, and notification systems.
6. **Active community** — frequent releases, large GitHub footprint, Docker-first deploy.

**Honorable mention:** If we decide later that admins need a real Jira-style board for engineering work, **Plane** can run alongside Chatwoot just for internal eng tasks and we'd webhook-bridge the two.

---

## Proposed Architecture

```text
Tech Fleet Network (this app)
   │
   │  1. User signs in (Supabase auth)
   │
   │  2. App loads Chatwoot widget with:
   │       - identifier = profile.id
   │       - identifier_hash = HMAC(profile.id, CHATWOOT_HMAC_KEY)
   │       - name, email, avatar, custom_attributes (role, cohort)
   │
   ▼
Chatwoot (self-hosted, Docker)
   │
   │  3. Trainee opens widget → conversation in "Trainee Support" inbox
   │  3b. "Report a bug" button → pre-fills subject, lands in "Bug Reports" inbox
   │  3c. Admins use Chatwoot UI directly for "Internal Tasks" inbox
   │
   │  4. Webhook on conversation_created / status_changed / message_created
   ▼
Edge function `chatwoot-webhook` (verifies HMAC signature)
   │
   ├─► public.tickets               (mirror: id, chatwoot_id, status, inbox, owner_id)
   ├─► public.notifications         (in-app bell update)
   ├─► public.agent_fix_queue       (if inbox = Bug Reports → triage)
   └─► Discord #support channel     (optional broadcast)
```

---

## Hosting Plan

- **Where:** Lovable Cloud cannot host a Rails + Redis + Postgres app, so Chatwoot itself runs on a **small VPS** (Hetzner / DigitalOcean / Fly.io — ~$10–20/mo) using the official `docker-compose.production.yaml`.
- **Domain:** `support.techfleet.network` (subdomain, TLS via Caddy/Nginx).
- **Database:** Chatwoot's own Postgres (separate from Lovable Cloud) — keeps schemas isolated.
- **Backups:** Nightly pg_dump → S3-compatible bucket.
- **SMTP:** Reuse existing Resend transactional setup.

---

## What Gets Built in Tech Fleet Network

### 1. Database (Lovable Cloud)
- `public.tickets` — local mirror of Chatwoot conversations for fast in-app reads (id, chatwoot_conversation_id, owner_user_id, inbox_type ENUM `support|bug|internal`, status, subject, last_message_at).
- `public.ticket_events` — append-only event log from webhook (for audit + debugging).
- RLS: trainees see only `owner_user_id = auth.uid()`; admins see all.
- BDD scenarios (`bdd_scenarios` table) covering create / status-change / admin-reply / bug-route flows with tri-layer Then-clauses.

### 2. Edge functions
- `chatwoot-widget-token` — returns `{ identifier_hash, attributes }` for the signed-in user (HMAC-signed server-side using `CHATWOOT_HMAC_KEY`).
- `chatwoot-webhook` — verifies signature, upserts mirror rows, fans out notifications, routes Bug Reports into `agent_fix_queue`.
- `chatwoot-create-ticket` — server-side ticket creation for the existing "Submit Feedback" and "Report a bug" UI paths (so the unsafe-content / regex errors we just hardened still flow through one pipeline).

### 3. Frontend
- New `<SupportWidget />` mounted in `AppLayout` (loads Chatwoot SDK with identifier + hash; respects reduced-motion and theming).
- `/support` route: list of my tickets (Card view, AG Grid fallback for admins) backed by `public.tickets`.
- `/admin/tickets` for admins: cross-inbox triage with status chips matching our existing toast color system.
- "Report a bug" button repurposed to open the widget pre-filled for the Bug Reports inbox.

### 4. Secrets to add
- `CHATWOOT_BASE_URL`
- `CHATWOOT_API_ACCESS_TOKEN` (admin token)
- `CHATWOOT_HMAC_KEY` (per-inbox identity validation key)
- `CHATWOOT_WEBHOOK_SECRET`

### 5. Observability
- All edge functions wrapped in `withAuditWrapper` (consistent with the recent error-logging audit).
- Webhook failures land in `agent_fix_queue` so System Health → Triage surfaces broken syncs.

---

## Rollout Phases

1. **Stand up Chatwoot** on VPS at `support.techfleet.network` + create three inboxes.
2. **DB migration** for `tickets` + `ticket_events` + RLS + BDD rows.
3. **Edge functions** + secrets.
4. **Embed widget** in AppLayout for signed-in users only; feature-flag it for admins first.
5. **Migrate Feedback + Report-a-bug** entry points to create Chatwoot conversations.
6. **Admin triage page** + notification fan-out + Discord bridge.
7. **Decommission** the old standalone Feedback table once parity is confirmed (kept read-only for 30 days).

---

## Open questions for you

- VPS provider preference, or want me to recommend one and document the deploy?
- OK to keep `public.feedback` read-only for 30 days then archive, or do you want a hard cutover?
- Should "Internal Tasks" inbox be visible only to admin role, or also to a future "staff" role?
