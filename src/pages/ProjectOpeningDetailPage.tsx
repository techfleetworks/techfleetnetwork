import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  Loader2, Send, Building2, ExternalLink, Briefcase,
  Users, Share2, CheckCircle2, FileText,
  Lightbulb, ClipboardList, Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  PROJECT_TYPES, PROJECT_PHASES, PROJECT_STATUSES,
} from "@/data/project-constants";
import { format } from "date-fns";
import { toast } from "sonner";

/* ── Label helpers ───────────────────────────────────────── */
const typeLabel = (v: string) => PROJECT_TYPES.find((t) => t.value === v)?.label ?? v;
const phaseLabel = (v: string) => PROJECT_PHASES.find((p) => p.value === v)?.label ?? v;
const statusLabel = (v: string) => PROJECT_STATUSES.find((s) => s.value === v)?.label ?? v;

/* ── Types ───────────────────────────────────────────────── */
interface ProjectDetail {
  id: string;
  client_id: string;
  project_type: string;
  phase: string;
  project_status: string;
  team_hats: string[];
  current_phase_milestones: string[];
  created_at: string;
}

interface ClientDetail {
  id: string;
  name: string;
  website: string;
  mission: string;
  project_summary: string;
  primary_contact: string;
  status: string;
}

interface MilestoneData {
  deliverables: string[];
  activities: string[];
  skills: string[];
}

interface ApiResponse {
  project: ProjectDetail;
  client: ClientDetail | null;
  milestoneData: MilestoneData;
  applicationCount: number;
}

/* ── Pill list component ─────────────────────────────────── */
function PillList({ items, variant = "outline" }: { items: string[]; variant?: "outline" | "secondary" }) {
  if (!items.length) return <p className="text-sm text-muted-foreground italic">None specified</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <Badge key={item} variant={variant} className="text-xs">
          {item}
        </Badge>
      ))}
    </div>
  );
}

/* ── Section component ───────────────────────────────────── */
function InfoSection({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {children}
      </CardContent>
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

/* ── Main Page ───────────────────────────────────────────── */
export default function ProjectOpeningDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    fetch(
      `${supabaseUrl}/functions/v1/public-project-detail?projectId=${encodeURIComponent(projectId)}`,
      {
        headers: {
          "apikey": anonKey,
          "Content-Type": "application/json",
        },
      }
    )
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "Failed to load project");
        }
        return res.json();
      })
      .then((d) => setData(d as ApiResponse))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [projectId]);

  const shareUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/project-openings/${projectId}`;
  }, [projectId]);

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Link copied to clipboard!");
    } catch {
      toast.error("Failed to copy link");
    }
  };

  const handleApply = () => {
    if (user) {
      navigate(`/project-openings/${projectId}/apply`);
    } else {
      navigate("/login", { state: { from: { pathname: `/project-openings/${projectId}/apply` } } });
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="container-app py-12 text-center space-y-4">
        <p className="text-lg font-medium text-foreground">{error || "Project not found"}</p>
        <p className="text-sm text-muted-foreground">
          This project may no longer be accepting applications.
        </p>
        <Button variant="outline" onClick={() => navigate(user ? "/project-openings" : "/login")}>
          {user ? "Back to Openings" : "Sign In"}
        </Button>
      </div>
    );
  }

  const { project, client, milestoneData, applicationCount } = data;

  const pageTitle = `${client?.name ?? "Project Opening"} — ${typeLabel(project.project_type)} | Tech Fleet`;

  // Update document title for SEO / sharing
  useEffect(() => {
    document.title = pageTitle;
    return () => { document.title = "Tech Fleet Network"; };
  }, [pageTitle]);

  return (
    <div className="container-app py-8 sm:py-12 max-w-4xl mx-auto space-y-8">
      {/* ── Hero Header ───────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-success/10 text-success border-success/30 gap-1">
              <CheckCircle2 className="h-3 w-3" /> Accepting Applications
            </Badge>
            <Badge variant="secondary">{typeLabel(project.project_type)}</Badge>
            <Badge variant="outline">{phaseLabel(project.phase)}</Badge>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
            {client?.name ?? "Project Opening"}
          </h1>
          <p className="text-muted-foreground">
            {client?.project_summary || `${typeLabel(project.project_type)} project — ${phaseLabel(project.phase)}`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleShare}>
            <Share2 className="h-4 w-4" /> Share
          </Button>
          <Button className="gap-1.5" onClick={handleApply}>
            <Send className="h-4 w-4" /> Apply
          </Button>
        </div>
      </div>

      <Separator />

      {/* ── Client Information ────────────────────────────── */}
      {client && (
        <InfoSection icon={Building2} title="About the Client">
          <DetailRow label="Organization" value={client.name} />
          {client.mission && (
            <DetailRow label="Mission" value={<p className="whitespace-pre-wrap leading-relaxed">{client.mission}</p>} />
          )}
          {client.project_summary && (
            <DetailRow label="Project Summary" value={<p className="whitespace-pre-wrap leading-relaxed">{client.project_summary}</p>} />
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
          {client.primary_contact && (
            <DetailRow label="Primary Contact" value={client.primary_contact} />
          )}
        </InfoSection>
      )}

      {/* ── Project Details ───────────────────────────────── */}
      <InfoSection icon={Briefcase} title="Project Details">
        <div className="grid sm:grid-cols-2 gap-4">
          <DetailRow label="Project Type" value={typeLabel(project.project_type)} />
          <DetailRow label="Current Phase" value={phaseLabel(project.phase)} />
          <DetailRow label="Status" value={statusLabel(project.project_status)} />
          <DetailRow
            label="Applications Submitted"
            value={
              <span className="font-medium text-foreground">
                {applicationCount} application{applicationCount !== 1 ? "s" : ""}
              </span>
            }
          />
          <DetailRow
            label="Posted"
            value={format(new Date(project.created_at), "MMMM d, yyyy")}
          />
        </div>
      </InfoSection>

      {/* ── Team Hats ─────────────────────────────────────── */}
      <InfoSection icon={Users} title="Team Hats (Roles)">
        <p className="text-sm text-muted-foreground">
          These are the roles available for this project. Select the ones you're interested in when you apply.
        </p>
        <PillList items={project.team_hats} variant="secondary" />
      </InfoSection>

      {/* ── Milestones ────────────────────────────────────── */}
      {project.current_phase_milestones.length > 0 && (
        <InfoSection icon={Target} title="Current Phase Milestones">
          <PillList items={project.current_phase_milestones} variant="secondary" />
        </InfoSection>
      )}

      {/* ── Deliverables ──────────────────────────────────── */}
      {milestoneData.deliverables.length > 0 && (
        <InfoSection icon={FileText} title="Deliverables">
          <p className="text-sm text-muted-foreground">
            Key outputs the team will produce during this phase.
          </p>
          <PillList items={milestoneData.deliverables} />
        </InfoSection>
      )}

      {/* ── Activities ────────────────────────────────────── */}
      {milestoneData.activities.length > 0 && (
        <InfoSection icon={ClipboardList} title="Activities">
          <p className="text-sm text-muted-foreground">
            Core activities the team will engage in during this phase.
          </p>
          <PillList items={milestoneData.activities} />
        </InfoSection>
      )}

      {/* ── Skills ────────────────────────────────────────── */}
      {milestoneData.skills.length > 0 && (
        <InfoSection icon={Lightbulb} title="Skills You'll Develop">
          <p className="text-sm text-muted-foreground">
            Skills and competencies you'll practice and build on this project.
          </p>
          <PillList items={milestoneData.skills} />
        </InfoSection>
      )}

      {/* ── Bottom CTA ────────────────────────────────────── */}
      <div className="rounded-lg border bg-card p-6 sm:p-8 text-center space-y-4">
        <h2 className="text-xl font-bold text-foreground">Ready to Join This Project?</h2>
        <p className="text-muted-foreground max-w-lg mx-auto">
          Submit your application to be considered for this project team. You'll need to complete a General Application first if you haven't already.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" className="gap-1.5" onClick={handleShare}>
            <Share2 className="h-4 w-4" /> Share This Opening
          </Button>
          <Button size="lg" className="gap-2" onClick={handleApply}>
            <Send className="h-5 w-5" /> Apply Now
          </Button>
        </div>
      </div>
    </div>
  );
}
