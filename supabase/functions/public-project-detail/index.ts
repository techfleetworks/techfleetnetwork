import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId");

    if (!projectId || !/^[0-9a-f-]{36}$/i.test(projectId)) {
      return new Response(
        JSON.stringify({ error: "Invalid or missing projectId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch project
    const { data: project, error: projErr } = await supabase
      .from("projects")
      .select("id, client_id, project_type, phase, project_status, team_hats, current_phase_milestones, created_at, timezone_range, anticipated_start_date, anticipated_end_date, client_intake_url, notion_repository_url")
      .eq("id", projectId)
      .neq("project_status", "project_complete")
      .maybeSingle();

    if (projErr) throw projErr;
    if (!project) {
      return new Response(
        JSON.stringify({ error: "Project not found or not accepting applications" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch client
    const { data: client, error: clientErr } = await supabase
      .from("clients")
      .select("id, name, website, mission, project_summary, primary_contact, status")
      .eq("id", project.client_id)
      .eq("status", "active")
      .maybeSingle();

    if (clientErr) throw clientErr;

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

    // Fetch application stats (count only, no PII)
    const { count: appCount } = await supabase
      .from("project_applications")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .eq("status", "completed");

    return new Response(
      JSON.stringify({
        project,
        client,
        milestoneData,
        applicationCount: appCount ?? 0,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("public-project-detail error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
