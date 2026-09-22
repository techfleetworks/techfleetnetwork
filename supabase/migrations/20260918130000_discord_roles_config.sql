-- Founding Members Discord role — config table (ADR-0053, PR-A).
-- The single, auditable home for Discord role ids. Satisfies AC3 ("permanently store the
-- Founding Members Role ID … never look it up more than once") without hardcoding the id in
-- code or hiding it in a secret env var.
--
-- Expand-only + idempotent (migrations here are hand-applied & forward-only; migration-smoke
-- re-applies from scratch). This migration PERSISTS a mapping only — it performs no Discord
-- calls and enqueues no grants; the grant path lands in a later PR.

CREATE TABLE IF NOT EXISTS public.discord_roles (
  key        text PRIMARY KEY,
  role_id    text NOT NULL,
  role_name  text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.discord_roles IS
  'Canonical Discord role-id mapping (ADR-0053). One row per logical role, looked up by key by the grant worker — so a role id is stored once and never re-discovered via the Discord API.';

-- Seed the Founding Members role (id from the ticket). Idempotent: refresh id/name if present.
INSERT INTO public.discord_roles (key, role_id, role_name)
VALUES ('founding_members', '1533887923597087041', 'Founding Members')
ON CONFLICT (key) DO UPDATE
  SET role_id = EXCLUDED.role_id,
      role_name = EXCLUDED.role_name,
      updated_at = now();

-- RLS: admin-only read/write. The service-role grant worker bypasses RLS; SECURITY DEFINER
-- readers (below, in the companion migration) run as owner. Role ids are low-sensitivity but
-- there is no member-facing reason to read this table, so keep it admin-scoped.
ALTER TABLE public.discord_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "discord_roles_admin_read" ON public.discord_roles;
CREATE POLICY "discord_roles_admin_read"
  ON public.discord_roles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "discord_roles_admin_write" ON public.discord_roles;
CREATE POLICY "discord_roles_admin_write"
  ON public.discord_roles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
