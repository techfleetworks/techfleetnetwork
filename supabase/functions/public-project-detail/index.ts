// @edge-cron
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { applyWaf } from "../_shared/waf.ts";
import { scrubTree } from "../_shared/dlp.ts";
import { getAdminClient } from "../_shared/admin-client.ts";
import { fieldsFor, resolveAuthState } from "../_shared/public-visibility.ts";

import { withAuditWrapper } from "../_shared/audit.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(withAuditWrapper("public-project-detail", async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // WAF: rate-limit / size / scanner / SQLi / path-traversal protection.
  // This is a public unauthenticated endpoint, so it's the prime target
  // for enumeration and abuse — WAF is mandatory here.
  const blocked = await applyWaf(req, "public-project-detail");
  if (blocked) return blocked;

  try {
    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId");

    if (!projectId || !/^[0-9a-f-]{36}$/i.test(projectId)) {
      return new Response(
        JSON.stringify({ error: "Invalid or missing projectId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use the centralized admin client (rotation-aware).
    const supabase = getAdminClient();

    // Auth-aware visibility (A5): anon gets the strict §6 set; a valid signed-in
    // session gets the authed extras (project phase/requires_interview, client
    // status/kind). Fail-safe to "anon" for any missing/invalid/expired token.
    const authState = await resolveAuthState(req);

    // Fetch project. discord_role_id, discord_role_name, notion_repository_url,
    // client_intake_url are never in the allowlist (members/admins only). The
    // select is the §6 Strategy for this auth state (see _shared/public-visibility).
    const { data: projectRaw, error: projErr } = await supabase
      .from("projects")
      .select(fieldsFor("project", authState))
      .eq("id", projectId)
      .neq("project_status", "project_complete")
      .maybeSingle();

    if (projErr) throw projErr;
    // A dynamic (non-literal) select yields supabase-js's GenericStringError type;
    // cast to the shape we read. The response still only contains the selected cols.
    const project = projectRaw as unknown as
      | (Record<string, unknown> & {
          id: string;
          client_id: string;
          coordinator_id: string | null;
          current_phase_milestones: string[] | null;
        })
      | null;
    if (!project) {
      return new Response(
        JSON.stringify({ error: "Project not found or not accepting applications" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch client. primary_contact (a person's NAME, PII) is never in the
    // allowlist — anon or authed. status/kind are authed-only extras (A5).
    const { data: clientRaw, error: clientErr } = await supabase
      .from("clients")
      .select(fieldsFor("client", authState))
      .eq("id", project.client_id)
      .eq("status", "active")
      .maybeSingle();

    if (clientErr) throw clientErr;
    const client = clientRaw as unknown as (Record<string, unknown> & { id: string }) | null;

    // Fetch milestone reference data for the selected milestones
    let milestoneData: { deliverables: string[]; activities: string[]; skills: string[] } = {
      deliverables: [],
      activities: [],
      skills: [],
    };

    if (project.current_phase_milestones && project.current_phase_milestones.length > 0) {
      const { data: refs } = await supabase
        .from("milestone_reference")
        .select("milestone_name, deliverables, activities, skills")
        .in("milestone_name", project.current_phase_milestones);

      if (refs) {
        const deliverables = new Set<string>();
        const activities = new Set<string>();
        const skills = new Set<string>();

        for (const ref of refs) {
          (ref.deliverables ?? []).forEach((d: string) => deliverables.add(d));
          (ref.activities ?? []).forEach((a: string) => activities.add(a));
          (ref.skills ?? []).forEach((s: string) => skills.add(s));
        }

        milestoneData = {
          deliverables: [...deliverables].sort(),
          activities: [...activities].sort(),
          skills: [...skills].sort(),
        };
      }
    }

    // Application count is an authed-only signal (§6 hides applicationCount from
    // anon). Anon gets null, not a count.
    let appCount: number | null = null;
    if (authState === "authenticated") {
      const { count } = await supabase
        .from("project_applications")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId)
        .eq("status", "completed");
      appCount = count ?? 0;
    }

    // Fetch coordinator name if set
    let coordinatorName: string | null = null;
    if (project.coordinator_id) {
      const { data: coordProfile } = await supabase
        .from("profiles")
        .select("display_name, first_name, last_name")
        .eq("user_id", project.coordinator_id)
        .single();
      if (coordProfile) {
        coordinatorName = coordProfile.display_name ||
          [coordProfile.first_name, coordProfile.last_name].filter(Boolean).join(" ") ||
          null;
      }
    }

    const payload = {
      project,
      client,
      milestoneData,
      applicationCount: appCount,
      coordinatorName,
    };

    // DLP: this is an UNAUTHENTICATED public endpoint. Strip any email,
    // token, JWT, or internal UUID that should not leak. The legitimate
    // UUIDs (project.id, client.id) are added to the allow-list so they
    // pass through.
    const allowedUuids = [
      project.id,
      client?.id,
      project.coordinator_id,
    ].filter((v): v is string => typeof v === "string");

    // DLP: scrub free-text leaves; URL/path leaves (logo_url, website) preserved
    // by key so storage hashes aren't corrupted; legit ids pass via the allowlist.
    const scrubbed = JSON.stringify(scrubTree(payload, { uuids: allowedUuids }));

    return new Response(scrubbed, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("public-project-detail error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}));
