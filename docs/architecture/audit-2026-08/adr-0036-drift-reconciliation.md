# ADR-0036 — prod drift reconciliation checklist

The comprehensive schema gate (`scripts/ci/check-db-schema-present.mjs`) found **10 genuine
committed-but-unapplied (or diverged) schema objects** when it first reconciled the whole declared
schema against prod. They are waived in `scripts/ci/db-schema-allowlist.json` as documented,
shrink-only **known-drift** so the blocking gate can ship and catch every NEW drift immediately.

This is the burndown list. Each fix is applied in the **Supabase Dashboard → SQL Editor** (prod
has no migrations ledger and can't be reached from CI/dev). **After applying a fix, remove that
object's line(s) from `db-schema-allowlist.json`** — the gate fails closed if a waived object turns
out to be present, so a stale waiver can't linger silently. Nothing here blocks CI; the waivers keep
the gate green while you work down the list.

Priority order: A (real feature gap) → D (access decision) → B (observability columns) → C (leave as-is).

---

## Group A — `20260625120000_fleety_rearchitecture.sql` only partially applied · 6 objects

Prod has the fleety tables, their columns, pkeys, policies and RLS — but is missing this migration's
two secondary indexes, two `updated_at` triggers, and the two `fleety_examples` provenance columns.
Effect: `updated_at` is not auto-maintained on `fleety_synonyms`/`fleety_user_memory`; two query
indexes are absent; nugget-promotion provenance (`promoted_from_turn_id`/`promoted_at`) is missing.

**Fix (recommended): re-run the whole migration** — it is marked _idempotent and safe to re-run_
(every statement is `IF NOT EXISTS` / `CREATE OR REPLACE`), so it's a no-op for what already exists
and creates only the six missing objects (and ensures `public.update_updated_at_column()` exists for
the triggers). Paste the full contents of `supabase/migrations/20260625120000_fleety_rearchitecture.sql`
into the SQL Editor and run.

Minimal alternative (if you'd rather not re-run the whole file):

```sql
-- indexes
CREATE INDEX IF NOT EXISTS fleety_synonyms_status_idx
  ON public.fleety_synonyms (status, occurrence_count);
CREATE INDEX IF NOT EXISTS fleety_user_memory_user_active_idx
  ON public.fleety_user_memory (user_id, expires_at);

-- shared trigger fn (no-op if already present) + the two updated_at triggers
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS fleety_synonyms_updated_at ON public.fleety_synonyms;
CREATE TRIGGER fleety_synonyms_updated_at
  BEFORE UPDATE ON public.fleety_synonyms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS fleety_user_memory_updated_at ON public.fleety_user_memory;
CREATE TRIGGER fleety_user_memory_updated_at
  BEFORE UPDATE ON public.fleety_user_memory
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- provenance columns
ALTER TABLE public.fleety_examples
  ADD COLUMN IF NOT EXISTS promoted_from_turn_id uuid,
  ADD COLUMN IF NOT EXISTS promoted_at           timestamptz;
```

Then remove from `db-schema-allowlist.json`: the two `index` entries, the two `trigger` entries, and
`public.fleety_examples.promoted_from_turn_id` + `.promoted_at` from `column`.

---

## Group D — `project_roster` "Members can view own roster entries" policy never applied · 1 object · DECISION

Migration `20260415024855` adds a SELECT policy letting a member read their OWN roster rows; prod
has only `Admins can manage roster`. This _changes access_, so it may have been withheld deliberately.

- **If members SHOULD see their own roster entries** — apply it, then remove the `policy` entry:

```sql
CREATE POLICY "Members can view own roster entries"
  ON public.project_roster FOR SELECT TO authenticated
  USING (member_email = (SELECT email FROM public.profiles WHERE user_id = auth.uid()));
```

- **If it was intentionally withheld** — leave the waiver in place and change its `_reasons` note in
  `db-schema-allowlist.json` from "PENDING DECISION" to "INTENTIONAL — members are not given self-view".

---

## Group B — `stats_drift_log.delta` / `.auto_recomputed` never reached prod · 2 objects · DECISION

Migration `20260520035733` CREATEs `stats_drift_log` with a generated `delta` and `auto_recomputed`,
but prod's table (created earlier/differently) has neither, so the `CREATE TABLE IF NOT EXISTS`
no-op'd. Confirm the drift-detection RPC in that migration still functions against prod's shape (it
references `auto_recomputed`).

- **If prod should match the migration** — add the columns, then remove both `column` entries:

```sql
ALTER TABLE public.stats_drift_log
  ADD COLUMN IF NOT EXISTS delta bigint GENERATED ALWAYS AS (actual - expected) STORED,
  ADD COLUMN IF NOT EXISTS auto_recomputed boolean NOT NULL DEFAULT false;
```

- **If prod's 6-column shape is canonical** — forward-fix the migration in a new expand/contract
  migration (so the committed CREATE stops declaring columns prod won't have) and keep the waiver
  until that migration lands.

---

## Group C — `request_idempotency.status` is a migration mistake, not a prod gap · 1 object · LEAVE AS-IS (recommended)

Migration `20260603000800` re-CREATEs `request_idempotency` (`IF NOT EXISTS`) with a `status text`
column, but `20260602230329` already created the table with `status_code`, so the redefinition
silently no-op'd. Prod has `status_code`; the app and the earlier migration agree on `status_code`.

- **Recommended: keep the waiver** (prod is correct; the `status` declaration is the bug) and, when
  convenient, remove the redundant `CREATE TABLE IF NOT EXISTS request_idempotency (…)` block from
  `20260603000800` in a follow-up so the derive stops declaring a phantom column. Change the
  `_reasons` note to "INTENTIONAL — migration mistake; prod's status_code is canonical".
- Also verify prod's `complete_idempotency()` body writes `status_code`, not `status` (if it writes
  `status`, that function errors against prod and needs a forward fix — unrelated to this gate but
  worth checking while you're here).

---

_Regenerate confidence any time with a fresh prod dump:_
`$env:SUPABASE_ACCESS_TOKEN="sbp_…"; $env:DB_SCHEMA_PROD_DUMP="prod-snapshot.json"; node scripts/ci/check-db-schema-present.mjs`
_then diff declared-vs-snapshot offline. When the list reaches zero, `db-schema-allowlist.json` holds
only the intentional `tickets`/`ticket_events` design drift._
