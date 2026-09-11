#!/usr/bin/env node
/**
 * Generates scripts/ci/db-dynamic-objects.json — the reviewed sidecar of objects declared
 * DYNAMICALLY by `EXECUTE format('... %I ...')` fan-out loops, which the schema gate
 * (check-db-schema-present.mjs, ADR-0036) cannot read statically. Run after changing the
 * reference-table set or a dynamic category:  node scripts/ci/gen-db-dynamic-objects.mjs
 *
 * table:: names are AS-CREATED (the gate's event stream then applies the 20260503180621
 * reference_team_functions->reference_job_functions rename + reference_roles drop). All other kinds
 * list FINAL names (post rename/drop), keyed by the CREATE file — the gate injects them at that file's
 * position and does not model the dynamic-object rename, so listing finals is correct.
 *
 * The reference_* %I fan-outs, per source file:
 *   creators 20260502180318 (14 tables) + 20260502184658 (5 tables): per table — the table, RLS, 4
 *     indexes (_search_idx/_name_trgm_idx/_data_idx/_category_idx), 2 triggers (trg_<t>_updated_at/
 *     trg_<t>_search), 2 policies ("Authenticated users can read active <t>"/"Admins can manage <t>"),
 *     and 12 columns.
 *   20260503223414: per content ref table — column is_placeholder + index <t>_is_placeholder_idx.
 *   20260511104727: per 19 listed tables — columns description_source + description_generated_at +
 *     index <t>_desc_source_idx.
 * Identity formats MATCH the gate's derive/prodSelect: index = bare name; trigger = public.<table>.<trg>;
 * policy = public.<table> :: <policyname> (policy name CASE-PRESERVED); column = public.<table>.<col>.
 */
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "db-dynamic-objects.json");
const file1 = "20260502180318_fec583fa-d798-4d04-a97b-6d0c68a508bc.sql";
const file2 = "20260502184658_eefb3bbe-1e17-4b20-aaed-a3c5da3df357.sql";
const filePlaceholder = "20260503223414_fb4b92fe-c7eb-43fa-9e57-de02a7165926.sql";
const fileDescSource = "20260511104727_4320855b-5b7b-4c0c-b519-340c65b4ea3d.sql";
// Non-reference dynamic TRIGGER fan-outs (found by the %I tripwire):
const fileAuditTrig = "20260426220658_02cf4817-e5e0-4bdb-a5dc-6b0a0fa50afb.sql"; // trg_audit_<t>_change
const auditWatchedTables = [
  "profiles",
  "user_roles",
  "admin_promotions",
  "clients",
  "projects",
  "project_applications",
  "general_applications",
  "announcements",
  "admin_banners",
  "announcement_reads",
  "announcement_views",
  "banner_dismissals",
  "feedback",
  "journey_progress",
  "user_quest_selections",
  "passkey_credentials",
  "push_subscriptions",
  "chat_conversations",
  "chat_messages",
  "notifications",
  "grid_view_states",
  "dashboard_preferences",
];
const fileUgcTrig = "20260527161857_3f99d3df-90cf-48a8-b272-1c21d2a1d7d3.sql"; // trg_ugc_translate_<t>
// DISTINCT table_name from the ugc_translatable_columns rows this migration inserts (data-driven loop;
// validate against prod — later inserts could add tables).
const ugcTables = [
  "clients",
  "projects",
  "profiles",
  "project_applications",
  "general_applications",
  "course_catalog",
];

const f1create = [
  "reference_skills",
  "reference_practices",
  "reference_activities",
  "reference_duties",
  "reference_deliverables",
  "reference_workshops",
  "reference_agile_methods",
  "reference_project_milestones",
  "reference_team_functions",
  "reference_tools",
  "reference_tech_job_categories",
  "reference_job_industries",
  "reference_job_specializations",
  "reference_company_types",
];
const f1final = f1create.map((t) =>
  t === "reference_team_functions" ? "reference_job_functions" : t
);
const f2create = [
  "reference_projects",
  "reference_stakeholders",
  "reference_job_titles",
  "reference_resources",
  "reference_roles",
];
const f2final = f2create.filter((t) => t !== "reference_roles");

// The 18 content reference tables that carry a `description` column (target of 20260503223414's loop).
const contentRefTables = [...f1final, ...f2final];
// The 19 tables explicitly listed by 20260511104727 (the 18 content tables + reference_relationships).
const descSourceTables = [
  "reference_workshops",
  "reference_stakeholders",
  "reference_skills",
  "reference_tools",
  "reference_practices",
  "reference_activities",
  "reference_deliverables",
  "reference_duties",
  "reference_resources",
  "reference_projects",
  "reference_project_milestones",
  "reference_relationships",
  "reference_company_types",
  "reference_agile_methods",
  "reference_job_functions",
  "reference_job_industries",
  "reference_job_specializations",
  "reference_job_titles",
  "reference_tech_job_categories",
];

const CREATOR_COLUMNS = [
  "id",
  "slug",
  "name",
  "description",
  "category",
  "data",
  "search_tsv",
  "is_active",
  "source",
  "source_row_id",
  "created_at",
  "updated_at",
];
const creatorIndexes = (t) => [
  `${t}_search_idx`,
  `${t}_name_trgm_idx`,
  `${t}_data_idx`,
  `${t}_category_idx`,
];
const creatorTriggers = (t) => [`public.${t}.trg_${t}_updated_at`, `public.${t}.trg_${t}_search`];
const creatorPolicies = (t) => [
  `public.${t} :: Authenticated users can read active ${t}`,
  `public.${t} :: Admins can manage ${t}`,
];
const creatorColumns = (t) => CREATOR_COLUMNS.map((c) => `public.${t}.${c}`);

const objects = {
  // table:: = AS-CREATED (stream applies the rename + roles drop).
  [`table::${file1}`]: f1create,
  [`table::${file2}`]: f2create,
  // Everything else = FINAL names.
  [`rls_enabled::${file1}`]: f1final.map((t) => `public.${t}`),
  [`rls_enabled::${file2}`]: f2final.map((t) => `public.${t}`),
  [`index::${file1}`]: f1final.flatMap(creatorIndexes),
  [`index::${file2}`]: f2final.flatMap(creatorIndexes),
  [`index::${filePlaceholder}`]: contentRefTables.map((t) => `${t}_is_placeholder_idx`),
  [`index::${fileDescSource}`]: descSourceTables.map((t) => `${t}_desc_source_idx`),
  [`trigger::${file1}`]: f1final.flatMap(creatorTriggers),
  [`trigger::${file2}`]: f2final.flatMap(creatorTriggers),
  [`trigger::${fileAuditTrig}`]: auditWatchedTables.map((t) => `public.${t}.trg_audit_${t}_change`),
  [`trigger::${fileUgcTrig}`]: ugcTables.map((t) => `public.${t}.trg_ugc_translate_${t}`),
  [`policy::${file1}`]: f1final.flatMap(creatorPolicies),
  [`policy::${file2}`]: f2final.flatMap(creatorPolicies),
  [`column::${file1}`]: f1final.flatMap(creatorColumns),
  [`column::${file2}`]: f2final.flatMap(creatorColumns),
  [`column::${filePlaceholder}`]: contentRefTables.map((t) => `public.${t}.is_placeholder`),
  [`column::${fileDescSource}`]: descSourceTables.flatMap((t) => [
    `public.${t}.description_source`,
    `public.${t}.description_generated_at`,
  ]),
};

const out = {
  _comment:
    "ADR-0036. GENERATED by scripts/ci/gen-db-dynamic-objects.mjs — do not hand-edit. Objects declared via reference_* EXECUTE format('... %I ...') fan-outs. table:: = AS-CREATED (stream applies the 20260503180621 team->job rename + reference_roles drop); other kinds = FINAL names. A %I fan-out file with no entry for its kind fails the gate closed.",
  objects,
};
writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
const total = Object.values(objects).reduce((n, a) => n + a.length, 0);
console.log(`wrote ${OUT}: ${Object.keys(objects).length} keys, ${total} names`);
