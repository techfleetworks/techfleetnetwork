-- pgTAP: classes.deliverables column contract (public-access A1b).
-- Run: `supabase db test` (or pg_prove) against a DB with the migrations applied.
-- deliverables has no DB CHECK (it mirrors skills/prerequisites — item count,
-- length and XSS are enforced at the zod validator layer, covered by
-- src/test/validators/class.test.ts). This proves the additive column landed
-- with the right shape and default, so the expand migration can't silently
-- regress. Runs in a rolled-back transaction.

BEGIN;
SELECT plan(3);

-- The additive column exists, is a text array, and defaults to an empty array.
SELECT has_column('public', 'classes', 'deliverables', 'classes.deliverables column exists');
SELECT col_type_is('public', 'classes', 'deliverables', 'text[]', 'deliverables is a text array');
SELECT col_default_is('public', 'classes', 'deliverables', '{}', 'deliverables defaults to an empty array');

SELECT * FROM finish();
ROLLBACK;
