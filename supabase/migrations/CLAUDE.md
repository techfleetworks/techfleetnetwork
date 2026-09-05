# Rules for DB migrations (scoped — loads when working here)

Migrations here are **hand-applied** (`supabase db push`) and **forward-only**, and a migration can be
live on prod **while the old app code is still running** (a `db push` is not atomic with a frontend/edge
deploy — see ADR-0035, the db-objects-present gate that supersedes ADR-0020). So every migration must be safe to apply _before_
the code that uses it ships, and safe to leave applied if that code later rolls back. That forces
**expand/contract** (ADR-0026). One concern per migration; each migration independently applicable.

- **Expand first, contract later — never in the same migration.** _Expand_ = additive only (add a
  nullable column, a new table/index/function, a new enum value). _Contract_ = destructive (drop/rename
  a column, tighten a constraint, remove a function) and only lands in a **later** migration, after all
  code paths stopped using the old shape and the expand migration is verified applied.

- **Never drop or rename a column in place.**

  ```sql
  -- ❌ never — old code still selecting `full_name` breaks the instant this applies
  ALTER TABLE profiles RENAME COLUMN full_name TO display_name;
  -- ✅ always — add-new, backfill, dual-write in code, switch reads, THEN (later migration) drop old
  ALTER TABLE profiles ADD COLUMN IF NOT EXISTS display_name text;      -- expand
  UPDATE profiles SET display_name = full_name WHERE display_name IS NULL;  -- backfill
  -- … ship code that writes both + reads display_name … then, in a SEPARATE later migration:
  ALTER TABLE profiles DROP COLUMN IF EXISTS full_name;                 -- contract
  ```

- **Never add a `NOT NULL` column without a default+backfill in the same breath.**

  ```sql
  -- ❌ never — fails on existing rows / blocks old inserts
  ALTER TABLE orders ADD COLUMN owner_id uuid NOT NULL;
  -- ✅ add nullable → backfill → (later, once every writer sets it) add the NOT NULL constraint
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS owner_id uuid;            -- expand
  UPDATE orders SET owner_id = /* derive */ WHERE owner_id IS NULL;     -- backfill
  -- later: ALTER TABLE orders ALTER COLUMN owner_id SET NOT NULL;      -- contract
  ```

- **Never change a column type, or drop a function/RPC other code still calls, in place.** Add the new
  form alongside, migrate callers, then remove. A `create or replace function` that changes a signature
  is a drop — treat it as contract.

- **Single-writer ownership changes (Phase 3) MUST use expand/contract.** Introducing the one owner of a
  fact (moving a mirrored value to its source) is an expand (new owning column/table + backfill + dual-write)
  then a contract (drop the mirror) — never a single cut-over, so readers never see a half-applied state.

- **Idempotent + reversible-forward.** Use `IF NOT EXISTS` / `CREATE OR REPLACE` / guarded `DO` blocks so
  re-running is a no-op (the migration-smoke gate re-applies from scratch). If a change can't be undone by
  a later forward migration, it needs an explicit owner sign-off note in the file.

- **Prove it.** RLS / `SECURITY DEFINER` / trigger changes get a pgTAP suite in `supabase/tests/` (runs in
  the `db-test` job). The invariant is proven at the DB, its owning layer (ADR-0024).
