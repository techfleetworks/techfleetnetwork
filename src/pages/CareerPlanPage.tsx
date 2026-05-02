// Career Plan page — pick a target, generate a personalized checklist
// derived from the Skills & Practices Framework relationship graph.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Compass, Sparkles, CheckCircle2, Circle, PlayCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { listReference } from "@/services/reference.service";
import { useCareerPlan, useGenerateCareerPlan, useUpdatePlanItemStatus } from "@/hooks/use-career-plan";
import {
  ITEM_TYPE_TO_ENTITY,
  type PlanItemStatus,
  type CareerPlanItem,
} from "@/services/career-plan.service";
import { FRAMEWORK_LABELS } from "@/services/framework.service";

const STATUS_LABEL: Record<PlanItemStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  done: "Done",
};

const NEXT_STATUS: Record<PlanItemStatus, PlanItemStatus> = {
  not_started: "in_progress",
  in_progress: "done",
  done: "not_started",
};

export default function CareerPlanPage() {
  const { toast } = useToast();
  const planQ = useCareerPlan();
  const genM = useGenerateCareerPlan();
  const statusM = useUpdatePlanItemStatus();

  const jobTitlesQ = useQuery({ queryKey: ["ref", "job_titles"], queryFn: () => listReference("job_titles"), staleTime: 1000 * 60 * 60 });
  const specsQ = useQuery({ queryKey: ["ref", "job_specializations"], queryFn: () => listReference("job_specializations"), staleTime: 1000 * 60 * 60 });
  const rolesQ = useQuery({ queryKey: ["ref", "roles"], queryFn: () => listReference("roles"), staleTime: 1000 * 60 * 60 });

  const [jobTitleId, setJobTitleId] = useState<string>("");
  const [specId, setSpecId] = useState<string>("");
  const [roleId, setRoleId] = useState<string>("");
  const [notes, setNotes] = useState("");

  // Hydrate selectors from existing plan.
  useMemo(() => {
    const p = planQ.data?.plan;
    if (!p) return;
    if (p.target_job_title_id) setJobTitleId(p.target_job_title_id);
    if (p.target_specialization_id) setSpecId(p.target_specialization_id);
    if (p.target_role_id) setRoleId(p.target_role_id);
    if (p.notes) setNotes(p.notes);
  }, [planQ.data?.plan?.id]);

  const handleGenerate = async () => {
    if (!jobTitleId && !specId && !roleId) {
      toast({ title: "Pick a target", description: "Choose a job title, specialization, or role first.", variant: "destructive" });
      return;
    }
    try {
      const res = await genM.mutateAsync({
        target_job_title_id: jobTitleId || null,
        target_specialization_id: specId || null,
        target_role_id: roleId || null,
        notes,
      });
      toast({ title: "Career plan generated", description: `${res.generated} new item${res.generated === 1 ? "" : "s"} added to your plan.` });
    } catch (e) {
      toast({ title: "Could not generate plan", description: String((e as Error).message ?? e), variant: "destructive" });
    }
  };

  const handleToggleStatus = async (item: CareerPlanItem) => {
    try {
      await statusM.mutateAsync({ id: item.id, status: NEXT_STATUS[item.status] });
    } catch (e) {
      toast({ title: "Could not update status", description: String((e as Error).message ?? e), variant: "destructive" });
    }
  };

  if (planQ.isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const plan = planQ.data?.plan ?? null;
  const items = planQ.data?.items ?? [];

  // Group items by type.
  const grouped = items.reduce<Record<string, CareerPlanItem[]>>((acc, i) => {
    (acc[i.item_type] ??= []).push(i);
    return acc;
  }, {});
  const groupOrder = ["skill", "practice", "duty", "activity", "deliverable", "milestone", "resource"];
  const groups = groupOrder.filter((k) => grouped[k]?.length);

  const doneCount = items.filter((i) => i.status === "done").length;

  return (
    <div className="container mx-auto px-4 py-8 space-y-6 max-w-5xl">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <Compass className="h-6 w-6 text-primary" aria-hidden="true" />
          <h1 className="text-2xl font-semibold text-foreground">My Career Plan</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Pick a target job title, specialization, or role. We generate a checklist of skills, team practices,
          activities, and deliverables drawn from the <strong className="text-foreground">Skills &amp; Practices Framework</strong>{" "}
          — each item shows the relationship sentence that explains why it's there.
        </p>
        {plan && items.length > 0 && (
          <Badge variant="outline" className="mt-1">
            {doneCount} / {items.length} complete
          </Badge>
        )}
      </header>

      <Card className="p-5 space-y-4">
        <h2 className="text-base font-semibold text-foreground">1. Choose your target</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="jt" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Job title</label>
            <Select value={jobTitleId} onValueChange={setJobTitleId}>
              <SelectTrigger id="jt"><SelectValue placeholder={jobTitlesQ.isLoading ? "Loading…" : "Pick a job title"} /></SelectTrigger>
              <SelectContent>
                {(jobTitlesQ.data ?? []).map((j) => <SelectItem key={j.id} value={j.id}>{j.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="sp" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Specialization</label>
            <Select value={specId} onValueChange={setSpecId}>
              <SelectTrigger id="sp"><SelectValue placeholder={specsQ.isLoading ? "Loading…" : "Optional"} /></SelectTrigger>
              <SelectContent>
                {(specsQ.data ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="rl" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Role</label>
            <Select value={roleId} onValueChange={setRoleId}>
              <SelectTrigger id="rl"><SelectValue placeholder={rolesQ.isLoading ? "Loading…" : "Optional"} /></SelectTrigger>
              <SelectContent>
                {(rolesQ.data ?? []).map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="notes" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notes (optional)</label>
          <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value.slice(0, 5000))} rows={2} placeholder="What you're aiming for, by when, etc." />
        </div>
        <div className="flex justify-end">
          <Button onClick={handleGenerate} disabled={genM.isPending} className="gap-2">
            {genM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {plan ? "Regenerate plan" : "Generate plan"}
          </Button>
        </div>
        {(jobTitlesQ.data?.length === 0 && !jobTitlesQ.isLoading) && (
          <p className="text-xs text-muted-foreground">
            No targets are available yet. Please check back soon.
          </p>
        )}
      </Card>

      {plan && items.length > 0 && (
        <section className="space-y-6" aria-label="Generated career plan">
          <h2 className="text-base font-semibold text-foreground">2. Your plan</h2>
          {groups.map((g) => {
            const list = grouped[g];
            const entity = ITEM_TYPE_TO_ENTITY[g as keyof typeof ITEM_TYPE_TO_ENTITY];
            return (
              <Card key={g} className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-foreground">{FRAMEWORK_LABELS[entity]}</h3>
                  <Badge variant="outline" className="text-xs">{list.length}</Badge>
                </div>
                <ul className="space-y-2">
                  {list.map((item) => <PlanRow key={item.id} item={item} onToggle={handleToggleStatus} />)}
                </ul>
              </Card>
            );
          })}
        </section>
      )}

      {plan && items.length === 0 && (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          No plan items yet. Click "Generate plan" once you've picked a target.
        </Card>
      )}
    </div>
  );
}

function PlanRow({ item, onToggle }: { item: CareerPlanItem; onToggle: (i: CareerPlanItem) => void }) {
  const Icon = item.status === "done" ? CheckCircle2 : item.status === "in_progress" ? PlayCircle : Circle;
  const colorClass =
    item.status === "done" ? "text-emerald-500" :
    item.status === "in_progress" ? "text-primary" : "text-muted-foreground";
  return (
    <li className="flex items-start gap-3 p-2 rounded-md hover:bg-muted/40 transition-colors">
      <button
        type="button"
        onClick={() => onToggle(item)}
        aria-label={`Mark item as ${STATUS_LABEL[NEXT_STATUS[item.status]]}`}
        className="mt-0.5 shrink-0 focus:outline-none focus:ring-2 focus:ring-primary rounded-full"
      >
        <Icon className={`h-5 w-5 ${colorClass}`} aria-hidden="true" />
      </button>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{STATUS_LABEL[item.status]}</span>
        </div>
        <p className="text-xs text-muted-foreground italic line-clamp-2" title={item.rationale}>
          Why: {item.rationale}
        </p>
      </div>
    </li>
  );
}
