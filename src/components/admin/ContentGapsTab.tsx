import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

/**
 * Content Gaps tab — surfaces every reference_* row whose description is
 * missing, blank, or still says "placeholder". Lets admins edit copy in
 * place. After save we call fleety-embed to refresh the matching
 * framework://<slug> knowledge_base row so Fleety picks up the new copy.
 *
 * BDD: docs/bdd/content-gaps.feature
 */

// All reference_* tables that carry free-text descriptions. Kept in sync
// with the migration that added is_placeholder.
const TABLES = [
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
] as const;

type TableName = typeof TABLES[number];

const PRETTY: Record<TableName, string> = {
  reference_workshops: "Workshop",
  reference_stakeholders: "Stakeholder",
  reference_skills: "Skill",
  reference_tools: "Tool",
  reference_practices: "Practice",
  reference_activities: "Activity",
  reference_deliverables: "Deliverable",
  reference_duties: "Duty",
  reference_resources: "Resource",
  reference_projects: "Project",
  reference_project_milestones: "Milestone",
  reference_relationships: "Relationship",
  reference_company_types: "Company Type",
  reference_agile_methods: "Agile Method",
  reference_job_functions: "Job Function",
  reference_job_industries: "Job Industry",
  reference_job_specializations: "Specialization",
  reference_job_titles: "Job Title",
  reference_tech_job_categories: "Tech Category",
};

interface Gap {
  table: TableName;
  id: string;
  slug: string;
  name: string;
  description: string | null;
  updated_at: string;
}

export function ContentGapsTab() {
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<TableName | "all">("all");
  const [editing, setEditing] = useState<Gap | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const all: Gap[] = [];
    // Run all reads in parallel.
    const results = await Promise.all(
      TABLES.map(async (t) => {
        const { data, error } = await (supabase as any)
          .from(t)
          .select("id, slug, name, description, updated_at")
          .eq("is_placeholder", true)
          .order("name", { ascending: true });
        if (error) return [];
        return ((data ?? []) as unknown as Array<Omit<Gap, "table">>).map((r) => ({ ...r, table: t }));
      })
    );
    for (const r of results) all.push(...r);
    all.sort((a, b) => a.name.localeCompare(b.name));
    setGaps(all);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(
    () => (filter === "all" ? gaps : gaps.filter((g) => g.table === filter)),
    [gaps, filter]
  );

  const counts = useMemo(() => {
    const m = new Map<TableName, number>();
    for (const g of gaps) m.set(g.table, (m.get(g.table) ?? 0) + 1);
    return m;
  }, [gaps]);

  const openEdit = (g: Gap) => {
    setEditing(g);
    setDraft(g.description ?? "");
  };

  const save = async () => {
    if (!editing) return;
    const text = draft.trim();
    if (!text || /placeholder/i.test(text)) {
      toast({
        title: "Still a placeholder",
        description: "Description must be real prose — not blank, and not contain the word \"placeholder\".",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    const { error } = await supabase
      // @ts-expect-error dynamic table name
      .from(editing.table)
      .update({ description: text })
      .eq("id", editing.id);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      setSaving(false);
      return;
    }
    // Refresh the matching framework://<slug> KB row (single-slug mode).
    // Non-fatal if the embed function isn't reachable.
    try {
      await supabase.functions.invoke("fleety-embed", {
        body: { slugs: [editing.slug], table: editing.table },
      });
    } catch {
      /* non-fatal; daily backfill cron will catch it */
    }
    toast({ title: "Saved", description: `${editing.name} updated.` });
    setEditing(null);
    setSaving(false);
    load();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Content gaps</CardTitle>
        <p className="text-sm text-muted-foreground">
          Reference rows with missing or placeholder descriptions. Real edits
          made here are protected from CSV re-ingest.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <ToggleGroup
          type="single"
          value={filter}
          onValueChange={(v) => v && setFilter(v as TableName | "all")}
          variant="outline"
          size="sm"
          className="flex flex-wrap justify-start"
          aria-label="Filter by content type"
        >
          <ToggleGroupItem value="all">All ({gaps.length})</ToggleGroupItem>
          {TABLES.filter((t) => (counts.get(t) ?? 0) > 0).map((t) => (
            <ToggleGroupItem key={t} value={t}>
              {PRETTY[t]} ({counts.get(t)})
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading gaps…
          </div>
        ) : visible.length === 0 ? (
          <div className="rounded-md border border-dashed p-8 text-center">
            <p className="font-medium">All content has real descriptions. 🎯</p>
            <p className="text-sm text-muted-foreground">
              Nothing left to fill in for this filter.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((g) => (
              <Card key={`${g.table}:${g.id}`} className="bg-card/50">
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <Badge variant="secondary">{PRETTY[g.table]}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(g.updated_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div>
                    <p className="font-medium leading-snug">{g.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">{g.slug}</p>
                  </div>
                  <p className="line-clamp-2 text-sm italic text-muted-foreground">
                    {g.description?.trim() || "(no description)"}
                  </p>
                  <Button size="sm" className="w-full" onClick={() => openEdit(g)}>
                    Write description
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>

      <Sheet open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <SheetContent side="right" className="flex w-full flex-col sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{editing?.name}</SheetTitle>
            <p className="text-sm text-muted-foreground">
              {editing && PRETTY[editing.table]} · <span className="font-mono">{editing?.slug}</span>
            </p>
          </SheetHeader>
          <div className="flex-1 py-4">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={14}
              placeholder="Write a clear, real description for this item…"
              aria-label="Description"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              {draft.length} characters · saving will re-embed Fleety's knowledge
              base for this slug.
            </p>
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save description
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </Card>
  );
}
