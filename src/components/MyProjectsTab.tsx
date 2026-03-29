import { useMemo } from "react";
import { useQuery } from "@/lib/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import {
  Loader2, Building2, ExternalLink, Briefcase, Users,
  FileText, Lightbulb, ClipboardList, Target, Clock,
  Link2, Trophy, Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { PROJECT_TYPES, PROJECT_PHASES, PROJECT_STATUSES } from "@/data/project-constants";
import { FolderKanban } from "lucide-react";
import { SectionEmptyState } from "@/components/SectionEmptyState";

/* ── Label helpers ───────────────────────────────────────── */
const typeLabel = (v: string) => PROJECT_TYPES.find((t) => t.value === v)?.label ?? v;
const phaseLabel = (v: string) => PROJECT_PHASES.find((p) => p.value === v)?.label ?? v;
const statusLabel = (v: string) => PROJECT_STATUSES.find((s) => s.value === v)?.label ?? v;

/* ── Pill list ───────────────────────────────────────────── */
function PillList({ items, variant = "outline" }: { items: string[]; variant?: "outline" | "secondary" }) {
  if (!items.length) return <p className="text-sm text-muted-foreground italic">None specified</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <Badge key={item} variant={variant} className="text-xs">{item}</Badge>
      ))}
    </div>
  );
}

/* ── Info Section ────────────────────────────────────────── */
function InfoSection({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-sm font-semibold text-foreground">{label}</p>
      <div className="text-sm text-muted-foreground">{value || <span className="italic">Not provided</span>}</div>
    </div>
  );
}

/* ── Types ───────────────────────────────────────────────── */
interface ProjectData {
  id: string;
  project_type: string;
  phase: string;
  project_status: string;
  team_hats: string[];
  current_phase_milestones: string[];
  timezone_range: string;
  anticipated_start_date: string | null;
  anticipated_end_date: string | null;
  client_intake_url: string;
  notion_repository_url: string;
  created_at: string;
  clients: {
    name: string;
    website: string;
    mission: string;
    project_summary: string;
    primary_contact: string;
  } | null;
}

interface MilestoneData {
  deliverables: string[];
  activities: string[];
  skills: string[];
}

/* ── Active Project Card ─────────────────────────────────── */
function ActiveProjectCard({ project }: { project: ProjectData }) {
  const client = project.clients;

  const { data: milestoneData } = useQuery({
    queryKey: ["milestone-data", project.current_phase_milestones],
    queryFn: async (): Promise<MilestoneData> => {
      if (!project.current_phase_milestones.length) {
        return { deliverables: [], activities: [], skills: [] };
      }
      const { data } = await supabase
        .from("milestone_reference")
        .select("deliverables, activities, skills")
        .in("milestone_name", project.current_phase_milestones);

      const deliverables = [...new Set((data ?? []).flatMap((m) => m.deliverables))];
      const activities = [...new Set((data ?? []).flatMap((m) => m.activities))];
      const skills = [...new Set((data ?? []).flatMap((m) => m.skills))];
      return { deliverables, activities, skills };
    },
    staleTime: 5 * 60 * 1000,
  });

  const hasDateRange = project.anticipated_start_date || project.anticipated_end_date;

  return (
    <div className="space-y-6">
      {/* Hero */}
      <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Trophy className="h-6 w-6 text-primary" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold text-foreground">{client?.name ?? "Project"}</h2>
                <Badge className="bg-success/10 text-success border-success/30 gap-1">
                  <Sparkles className="h-3 w-3" /> Active Teammate
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {typeLabel(project.project_type)} · {phaseLabel(project.phase)}
              </p>
            </div>
          </div>
          {client?.project_summary && (
            <p className="text-sm text-muted-foreground leading-relaxed">{client.project_summary}</p>
          )}
        </CardContent>
      </Card>

      {/* Client Info */}
      {client && (
        <InfoSection icon={Building2} title="About the Client">
          <DetailRow label="Organization" value={client.name} />
          {client.mission && (
            <DetailRow label="Mission" value={<p className="whitespace-pre-wrap leading-relaxed">{client.mission}</p>} />
          )}
          {client.website && (
            <DetailRow
              label="Website"
              value={
                <a
                  href={client.website.startsWith("http") ? client.website : `https://${client.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-1"
                >
                  {client.website}
                  <ExternalLink className="h-3 w-3" />
                </a>
              }
            />
          )}
          {client.primary_contact && <DetailRow label="Primary Contact" value={client.primary_contact} />}
        </InfoSection>
      )}

      {/* Project Details */}
      <InfoSection icon={Briefcase} title="Project Details">
        <div className="grid sm:grid-cols-2 gap-4">
          <DetailRow label="Project Type" value={typeLabel(project.project_type)} />
          <DetailRow label="Current Phase" value={phaseLabel(project.phase)} />
          <DetailRow label="Status" value={statusLabel(project.project_status)} />
          <DetailRow label="Posted" value={format(new Date(project.created_at), "MMMM d, yyyy")} />
        </div>
      </InfoSection>

      {/* Schedule */}
      {(project.timezone_range || hasDateRange) && (
        <InfoSection icon={Clock} title="Schedule & Timezone">
          <div className="grid sm:grid-cols-2 gap-4">
            {project.timezone_range && <DetailRow label="Timezone Range" value={project.timezone_range} />}
            {project.anticipated_start_date && (
              <DetailRow label="Anticipated Start" value={format(new Date(project.anticipated_start_date + "T00:00:00"), "MMMM d, yyyy")} />
            )}
            {project.anticipated_end_date && (
              <DetailRow label="Anticipated End" value={format(new Date(project.anticipated_end_date + "T00:00:00"), "MMMM d, yyyy")} />
            )}
          </div>
        </InfoSection>
      )}

      {/* External Links */}
      {(project.client_intake_url || project.notion_repository_url) && (
        <InfoSection icon={Link2} title="External Links">
          <div className="grid sm:grid-cols-2 gap-4">
            {project.client_intake_url && (
              <DetailRow
                label="Client Intake"
                value={
                  <a href={project.client_intake_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                    {(() => { try { return new URL(project.client_intake_url).hostname; } catch { return project.client_intake_url; } })()}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                }
              />
            )}
            {project.notion_repository_url && (
              <DetailRow
                label="Project Repository (Notion)"
                value={
                  <a href={project.notion_repository_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                    {(() => { try { return new URL(project.notion_repository_url).hostname; } catch { return project.notion_repository_url; } })()}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                }
              />
            )}
          </div>
        </InfoSection>
      )}

      {/* Team Hats */}
      <InfoSection icon={Users} title="Team Hats (Roles)">
        <PillList items={project.team_hats} variant="secondary" />
      </InfoSection>

      {/* Milestones */}
      {project.current_phase_milestones.length > 0 && (
        <InfoSection icon={Target} title="Current Phase Milestones">
          <PillList items={project.current_phase_milestones} variant="secondary" />
        </InfoSection>
      )}

      {/* Deliverables */}
      {(milestoneData?.deliverables?.length ?? 0) > 0 && (
        <InfoSection icon={FileText} title="Deliverables">
          <p className="text-sm text-muted-foreground">Key outputs your team will produce during this phase.</p>
          <PillList items={milestoneData!.deliverables} />
        </InfoSection>
      )}

      {/* Activities */}
      {(milestoneData?.activities?.length ?? 0) > 0 && (
        <InfoSection icon={ClipboardList} title="Activities">
          <p className="text-sm text-muted-foreground">Core activities your team engages in during this phase.</p>
          <PillList items={milestoneData!.activities} />
        </InfoSection>
      )}

      {/* Skills */}
      {(milestoneData?.skills?.length ?? 0) > 0 && (
        <InfoSection icon={Lightbulb} title="Skills You're Developing">
          <p className="text-sm text-muted-foreground">Skills and competencies you're building on this project.</p>
          <PillList items={milestoneData!.skills} />
        </InfoSection>
      )}
    </div>
  );
}

/* ── Main Tab Component ──────────────────────────────────── */
export function MyProjectsTab() {
  const { user } = useAuth();

  // Fetch applications where user is an active participant
  const { data: activeApps, isLoading } = useQuery({
    queryKey: ["my-active-projects", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_applications")
        .select("project_id")
        .eq("user_id", user!.id)
        .eq("applicant_status", "active_participant");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const projectIds = useMemo(() => (activeApps ?? []).map((a) => a.project_id), [activeApps]);

  // Fetch full project details with client info
  const { data: projects, isLoading: projectsLoading } = useQuery({
    queryKey: ["my-active-project-details", projectIds],
    queryFn: async () => {
      if (!projectIds.length) return [];
      const { data, error } = await supabase
        .from("projects")
        .select(`
          id, project_type, phase, project_status, team_hats,
          current_phase_milestones, timezone_range,
          anticipated_start_date, anticipated_end_date,
          client_intake_url, notion_repository_url, created_at,
          clients!projects_client_id_fkey ( name, website, mission, project_summary, primary_contact )
        `)
        .in("id", projectIds);
      if (error) throw error;
      return (data ?? []) as unknown as ProjectData[];
    },
    enabled: projectIds.length > 0,
  });

  const loading = isLoading || projectsLoading;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!projects?.length) {
    return (
      <SectionEmptyState
        title="No Active Projects"
        description="Once you're selected as an active teammate on a project, it will appear here with full project details."
        icon={FolderKanban}
      />
    );
  }

  return (
    <div className="space-y-10">
      {projects.map((project) => (
        <div key={project.id}>
          <ActiveProjectCard project={project} />
          {projects.length > 1 && <Separator className="mt-10" />}
        </div>
      ))}
    </div>
  );
}
