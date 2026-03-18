import { useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@/lib/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import {
  ArrowLeft, Share2, CheckCircle2, XCircle, User, Globe,
  Briefcase, GraduationCap, MessageCircle, Loader2, Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList,
  BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { PROJECT_TYPES, PROJECT_PHASES, PROJECT_STATUSES } from "@/data/project-constants";
import { toast } from "sonner";

const typeLabel = (v: string) => PROJECT_TYPES.find((t) => t.value === v)?.label ?? v;
const phaseLabel = (v: string) => PROJECT_PHASES.find((p) => p.value === v)?.label ?? v;
const statusLabel = (v: string) => PROJECT_STATUSES.find((s) => s.value === v)?.label ?? v;

interface AnswerBlockProps {
  question: string;
  answer: string;
}

function AnswerBlock({ question, answer }: AnswerBlockProps) {
  if (!answer?.trim()) return null;
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium text-foreground">{question}</p>
      <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{answer}</p>
    </div>
  );
}

function ArrayAnswerBlock({ question, items }: { question: string; items: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium text-foreground">{question}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <Badge key={item} variant="outline" className="text-xs">{item}</Badge>
        ))}
      </div>
    </div>
  );
}

export default function ApplicationSubmissionDetailPage() {
  const { applicationId } = useParams<{ applicationId: string }>();
  const navigate = useNavigate();

  /* Fetch project application */
  const { data: projApp, isLoading: projAppLoading } = useQuery({
    queryKey: ["admin-proj-app-detail", applicationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_applications")
        .select("*")
        .eq("id", applicationId!)
        .single();
      if (error) throw error;
      return data as Record<string, unknown>;
    },
    enabled: !!applicationId,
  });

  /* Fetch project */
  const { data: project } = useQuery({
    queryKey: ["admin-proj-detail-for-app", projApp?.project_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects").select("*").eq("id", projApp!.project_id as string).single();
      if (error) throw error;
      return data as Record<string, unknown>;
    },
    enabled: !!projApp?.project_id,
  });

  /* Fetch client */
  const { data: client } = useQuery({
    queryKey: ["admin-client-detail-for-app", project?.client_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients").select("*").eq("id", project!.client_id as string).single();
      if (error) throw error;
      return data as Record<string, unknown>;
    },
    enabled: !!project?.client_id,
  });

  /* Fetch applicant profile */
  const { data: profile } = useQuery({
    queryKey: ["admin-profile-for-app", projApp?.user_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles").select("*").eq("user_id", projApp!.user_id as string).single();
      if (error) throw error;
      return data as Record<string, unknown>;
    },
    enabled: !!projApp?.user_id,
  });

  /* Fetch general application */
  const { data: genApp } = useQuery({
    queryKey: ["admin-gen-app-for-submission", projApp?.user_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("general_applications")
        .select("*")
        .eq("user_id", projApp!.user_id as string)
        .eq("status", "completed")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as Record<string, unknown> | null;
    },
    enabled: !!projApp?.user_id,
  });

  const applicantName = useMemo(() => {
    if (!profile) return "Applicant";
    const dn = profile.display_name as string;
    if (dn) return dn;
    return `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() || "Applicant";
  }, [profile]);

  const handleShare = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied to clipboard");
    } catch {
      toast.info(url);
    }
  };

  if (projAppLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!projApp) {
    return (
      <div className="container-app py-12 text-center">
        <p className="text-muted-foreground">Application not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/applications")}>Back</Button>
      </div>
    );
  }

  const participatedPrev = projApp.participated_previous_phase as boolean;

  return (
    <div className="container-app py-8 sm:py-12 max-w-4xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/applications">Applications</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Application Submission Details</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/applications")} aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Application Submission Details</h1>
            <p className="text-sm text-muted-foreground">{applicantName} — {(client?.name as string) ?? "Project"}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 self-start" onClick={handleShare}>
          <Share2 className="h-4 w-4" />
          Share
        </Button>
      </div>

      {/* Submission meta */}
      <div className="flex flex-wrap gap-3">
        {projApp.completed_at && (
          <Badge className="bg-success/10 text-success border-success/30 gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Submitted {format(new Date(projApp.completed_at as string), "MMMM d, yyyy")}
          </Badge>
        )}
        <Badge variant="secondary">{typeLabel((project?.project_type as string) ?? "")}</Badge>
        <Badge variant="outline">{phaseLabel((project?.phase as string) ?? "")}</Badge>
        <Badge variant="outline">{statusLabel((project?.project_status as string) ?? "")}</Badge>
        {participatedPrev
          ? <Badge className="bg-success/10 text-success border-success/30 gap-1"><CheckCircle2 className="h-3 w-3" />Previous Participant</Badge>
          : <Badge variant="outline" className="gap-1"><XCircle className="h-3 w-3" />New Participant</Badge>}
      </div>

      <Separator />

      {/* ── SECTION 1: Applicant Profile ────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <User className="h-5 w-5 text-primary" />
            Applicant Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
            <div>
              <span className="font-medium text-foreground">Name:</span>{" "}
              <span className="text-muted-foreground">{applicantName}</span>
            </div>
            <div>
              <span className="font-medium text-foreground">Email:</span>{" "}
              <span className="text-muted-foreground">{(profile?.email as string) ?? "—"}</span>
            </div>
            <div>
              <span className="font-medium text-foreground">Country:</span>{" "}
              <span className="text-muted-foreground">{(profile?.country as string) || "—"}</span>
            </div>
            <div>
              <span className="font-medium text-foreground">Timezone:</span>{" "}
              <span className="text-muted-foreground">{(profile?.timezone as string) || "—"}</span>
            </div>
            {(profile?.discord_username as string) && (
              <div>
                <span className="font-medium text-foreground">Discord:</span>{" "}
                <span className="text-muted-foreground">{profile.discord_username as string}</span>
              </div>
            )}
            {(profile?.linkedin_url as string) && (
              <div>
                <span className="font-medium text-foreground">LinkedIn:</span>{" "}
                <a href={profile.linkedin_url as string} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline ml-1">Profile</a>
              </div>
            )}
            {(profile?.portfolio_url as string) && (
              <div>
                <span className="font-medium text-foreground">Portfolio:</span>{" "}
                <a href={profile.portfolio_url as string} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline ml-1">View</a>
              </div>
            )}
          </div>
          <ArrayAnswerBlock question="Experience Areas" items={(profile?.experience_areas as string[]) ?? []} />
          <ArrayAnswerBlock question="Education Background" items={(profile?.education_background as string[]) ?? []} />
          <ArrayAnswerBlock question="Interests" items={(profile?.interests as string[]) ?? []} />
          <AnswerBlock question="Professional Background" answer={(profile?.professional_background as string) ?? ""} />
          <AnswerBlock question="Professional Goals" answer={(profile?.professional_goals as string) ?? ""} />
          <AnswerBlock question="Bio" answer={(profile?.bio as string) ?? ""} />
        </CardContent>
      </Card>

      {/* ── SECTION 2: General Application Responses ───── */}
      {genApp && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Briefcase className="h-5 w-5 text-primary" />
              General Application
            </CardTitle>
            {genApp.completed_at && (
              <p className="text-xs text-muted-foreground">
                Completed {format(new Date(genApp.completed_at as string), "MMMM d, yyyy")}
              </p>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <AnswerBlock question="Tell us about yourself" answer={(genApp.about_yourself as string) ?? ""} />
            <AnswerBlock question="Hours commitment" answer={(genApp.hours_commitment as string) ?? ""} />

            <Separator className="my-2" />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Engagement History</p>
            <AnswerBlock question="Previous engagement with Tech Fleet" answer={(genApp.previous_engagement as string) ?? ""} />
            <ArrayAnswerBlock question="Previous engagement ways" items={(genApp.previous_engagement_ways as string[]) ?? []} />
            <AnswerBlock question="What have you learned from teammates?" answer={(genApp.teammate_learnings as string) ?? ""} />

            <Separator className="my-2" />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Agile Mindset</p>
            <AnswerBlock question="Agile vs Waterfall" answer={(genApp.agile_vs_waterfall as string) ?? ""} />
            <AnswerBlock question="Psychological Safety" answer={(genApp.psychological_safety as string) ?? ""} />
            <AnswerBlock question="Agile Philosophies" answer={(genApp.agile_philosophies as string) ?? ""} />
            <AnswerBlock question="Collaboration Challenges" answer={(genApp.collaboration_challenges as string) ?? ""} />

            <Separator className="my-2" />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Service Leadership</p>
            <AnswerBlock question="Servant Leadership Definition" answer={(genApp.servant_leadership_definition as string) ?? ""} />
            <AnswerBlock question="Servant Leadership Actions" answer={(genApp.servant_leadership_actions as string) ?? ""} />
            <AnswerBlock question="Servant Leadership Challenges" answer={(genApp.servant_leadership_challenges as string) ?? ""} />
            <AnswerBlock question="Servant Leadership Situation" answer={(genApp.servant_leadership_situation as string) ?? ""} />
          </CardContent>
        </Card>
      )}

      {/* ── SECTION 3: Project Application Responses ──── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <GraduationCap className="h-5 w-5 text-primary" />
            Project Application — {(client?.name as string) ?? "Project"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ArrayAnswerBlock question="Team Hats of Interest" items={(projApp.team_hats_interest as string[]) ?? []} />

          <Separator className="my-2" />
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {participatedPrev ? "Previous Phase Experience" : "Prior Engagement"}
          </p>

          {participatedPrev ? (
            <>
              <AnswerBlock question="What team position did you join in the previous phase?" answer={(projApp.previous_phase_position as string) ?? ""} />
              <AnswerBlock question="What did you learn in the previous phase?" answer={(projApp.previous_phase_learnings as string) ?? ""} />
              <AnswerBlock question="How will you help your teammates succeed in this upcoming phase?" answer={(projApp.previous_phase_help_teammates as string) ?? ""} />
            </>
          ) : (
            <AnswerBlock
              question="How has your prior engagement in Tech Fleet prepared you for this team role?"
              answer={(projApp.prior_engagement_preparation as string) ?? ""}
            />
          )}

          <Separator className="my-2" />
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Client Questions</p>
          <AnswerBlock question="Why are you passionate about being on this project?" answer={(projApp.passion_for_project as string) ?? ""} />
          <AnswerBlock question="What do you know about the client and the project?" answer={(projApp.client_project_knowledge as string) ?? ""} />
          <AnswerBlock question="How would you like to contribute to cross-functional teamwork?" answer={(projApp.cross_functional_contribution as string) ?? ""} />
          <AnswerBlock question="How will you contribute to this project's successful outcomes?" answer={(projApp.project_success_contribution as string) ?? ""} />
        </CardContent>
      </Card>

      {/* Bottom nav */}
      <div className="flex justify-between pb-8">
        <Button variant="outline" onClick={() => navigate("/applications")} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" /> Back to Applications
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={handleShare}>
          <Copy className="h-4 w-4" /> Copy Link
        </Button>
      </div>
    </div>
  );
}
