import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";

/**
 * Admin CRUD for Fleety practical-mode content.
 *
 * Two collections live here:
 *   • Playbooks — admin-authored "what to do" guides (the spine of every
 *     practical answer). Steps stored as JSONB to preserve ordering and
 *     per-step time estimates.
 *   • Worked examples — anonymized excerpts from past Tech Fleet
 *     deliverables, retrieved alongside playbooks to show "what good
 *     looks like".
 *
 * RLS already restricts insert/update/delete to admins; we depend on it
 * server-side rather than gating in the client.
 */

type StepInput = { title: string; detail: string; estimate: string };
type ChipInput = { label: string; action_type: string; target_url: string };

type Playbook = {
  id: string;
  slug: string;
  title: string;
  intent: string;
  audience: string;
  trigger_phrases: string[];
  when_to_use: string;
  direct_answer: string;
  steps: StepInput[];
  done_criteria: string[];
  common_pitfalls: string[];
  ask_for_help: string | null;
  example_artifact_url: string | null;
  action_chips: ChipInput[];
  tags: string[];
  is_active: boolean;
};

type Example = {
  id: string;
  slug: string;
  title: string;
  deliverable_type: string;
  audience: string;
  summary: string;
  excerpt: string;
  source_url: string | null;
  related_playbook_slug: string | null;
  tags: string[];
  is_active: boolean;
};

const blankPlaybook: Playbook = {
  id: "",
  slug: "",
  title: "",
  intent: "how_to",
  audience: "all",
  trigger_phrases: [],
  when_to_use: "",
  direct_answer: "",
  steps: [{ title: "", detail: "", estimate: "" }],
  done_criteria: [],
  common_pitfalls: [],
  ask_for_help: "",
  example_artifact_url: "",
  action_chips: [],
  tags: [],
  is_active: true,
};

const blankExample: Example = {
  id: "",
  slug: "",
  title: "",
  deliverable_type: "",
  audience: "all",
  summary: "",
  excerpt: "",
  source_url: "",
  related_playbook_slug: "",
  tags: [],
  is_active: true,
};

function csv(arr: string[] | null | undefined) { return (arr ?? []).join(", "); }
function fromCsv(s: string): string[] {
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}

export function FleetyPlaybooksManager() {
  const [tab, setTab] = useState("playbooks");
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [examples, setExamples] = useState<Example[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPb, setEditingPb] = useState<Playbook | null>(null);
  const [editingEx, setEditingEx] = useState<Example | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [pbRes, exRes] = await Promise.all([
      supabase.from("fleety_playbooks").select("*").order("title"),
      supabase.from("fleety_examples").select("*").order("title"),
    ]);
    setPlaybooks((pbRes.data ?? []) as unknown as Playbook[]);
    setExamples((exRes.data ?? []) as unknown as Example[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const savePlaybook = async () => {
    if (!editingPb) return;
    if (!editingPb.slug.trim() || !editingPb.title.trim() || !editingPb.direct_answer.trim()) {
      toast.error("Slug, title, and direct answer are required.");
      return;
    }
    setSaving(true);
    const payload = {
      slug: editingPb.slug.trim(),
      title: editingPb.title.trim(),
      intent: editingPb.intent,
      audience: editingPb.audience,
      trigger_phrases: editingPb.trigger_phrases,
      when_to_use: editingPb.when_to_use,
      direct_answer: editingPb.direct_answer,
      steps: editingPb.steps.filter((s) => s.title.trim().length > 0),
      done_criteria: editingPb.done_criteria,
      common_pitfalls: editingPb.common_pitfalls,
      ask_for_help: editingPb.ask_for_help || null,
      example_artifact_url: editingPb.example_artifact_url || null,
      action_chips: editingPb.action_chips.filter((c) => c.label.trim() && c.action_type.trim()),
      tags: editingPb.tags,
      is_active: editingPb.is_active,
    };
    const { error } = editingPb.id
      ? await supabase.from("fleety_playbooks").update(payload).eq("id", editingPb.id)
      : await supabase.from("fleety_playbooks").insert(payload);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Playbook saved.");
    setEditingPb(null);
    await load();
  };

  const deletePlaybook = async (id: string) => {
    if (!confirm("Delete this playbook? This cannot be undone.")) return;
    const { error } = await supabase.from("fleety_playbooks").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Deleted."); load(); }
  };

  const saveExample = async () => {
    if (!editingEx) return;
    if (!editingEx.slug.trim() || !editingEx.title.trim() || !editingEx.excerpt.trim()) {
      toast.error("Slug, title, and excerpt are required.");
      return;
    }
    setSaving(true);
    const payload = {
      slug: editingEx.slug.trim(),
      title: editingEx.title.trim(),
      deliverable_type: editingEx.deliverable_type,
      audience: editingEx.audience,
      summary: editingEx.summary,
      excerpt: editingEx.excerpt,
      source_url: editingEx.source_url || null,
      related_playbook_slug: editingEx.related_playbook_slug || null,
      tags: editingEx.tags,
      is_active: editingEx.is_active,
    };
    const { error } = editingEx.id
      ? await supabase.from("fleety_examples").update(payload).eq("id", editingEx.id)
      : await supabase.from("fleety_examples").insert(payload);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Example saved.");
    setEditingEx(null);
    await load();
  };

  const deleteExample = async (id: string) => {
    if (!confirm("Delete this example?")) return;
    const { error } = await supabase.from("fleety_examples").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Deleted."); load(); }
  };

  if (loading) {
    return (
      <Card><CardContent className="py-10 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading practical content…
      </CardContent></Card>
    );
  }

  return (
    <Tabs value={tab} onValueChange={setTab} className="space-y-3">
      <TabsList aria-label="Practical content sections">
        <TabsTrigger value="playbooks">Playbooks ({playbooks.length})</TabsTrigger>
        <TabsTrigger value="examples">Examples ({examples.length})</TabsTrigger>
      </TabsList>

      <TabsContent value="playbooks" className="space-y-3">
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setEditingPb({ ...blankPlaybook })}>
            <Plus className="h-4 w-4 mr-1" /> New playbook
          </Button>
        </div>
        {editingPb && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{editingPb.id ? "Edit playbook" : "New playbook"}</CardTitle>
              <CardDescription>Use plain language. Each step starts with a verb. Time estimates help users budget.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="pb-slug">Slug (kebab-case, unique)</Label>
                  <Input id="pb-slug" value={editingPb.slug} onChange={(e) => setEditingPb({ ...editingPb, slug: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="pb-title">Title</Label>
                  <Input id="pb-title" value={editingPb.title} onChange={(e) => setEditingPb({ ...editingPb, title: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="pb-intent">Intent</Label>
                  <select id="pb-intent" value={editingPb.intent} onChange={(e) => setEditingPb({ ...editingPb, intent: e.target.value })} className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm">
                    <option value="how_to">how_to</option>
                    <option value="troubleshoot">troubleshoot</option>
                    <option value="decision">decision</option>
                    <option value="reference">reference</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="pb-aud">Audience</Label>
                  <select id="pb-aud" value={editingPb.audience} onChange={(e) => setEditingPb({ ...editingPb, audience: e.target.value })} className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm">
                    <option value="all">All</option>
                    <option value="member">Member</option>
                    <option value="teacher">Teacher</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>
              <div>
                <Label htmlFor="pb-triggers">Trigger phrases (comma-separated)</Label>
                <Input id="pb-triggers" value={csv(editingPb.trigger_phrases)} onChange={(e) => setEditingPb({ ...editingPb, trigger_phrases: fromCsv(e.target.value) })} placeholder="e.g. stakeholder interview, run interview, interview notes" />
              </div>
              <div>
                <Label htmlFor="pb-when">When to use</Label>
                <Textarea id="pb-when" rows={2} value={editingPb.when_to_use} onChange={(e) => setEditingPb({ ...editingPb, when_to_use: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="pb-direct">Direct answer (1–2 sentences)</Label>
                <Textarea id="pb-direct" rows={2} value={editingPb.direct_answer} onChange={(e) => setEditingPb({ ...editingPb, direct_answer: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Steps</Label>
                {editingPb.steps.map((s, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-start">
                    <Input className="col-span-4" placeholder="Title (verb-led)" value={s.title} onChange={(e) => {
                      const next = [...editingPb.steps]; next[idx] = { ...s, title: e.target.value }; setEditingPb({ ...editingPb, steps: next });
                    }} />
                    <Input className="col-span-6" placeholder="Detail (specific)" value={s.detail} onChange={(e) => {
                      const next = [...editingPb.steps]; next[idx] = { ...s, detail: e.target.value }; setEditingPb({ ...editingPb, steps: next });
                    }} />
                    <Input className="col-span-1" placeholder="time" value={s.estimate} onChange={(e) => {
                      const next = [...editingPb.steps]; next[idx] = { ...s, estimate: e.target.value }; setEditingPb({ ...editingPb, steps: next });
                    }} />
                    <Button size="icon" variant="ghost" className="col-span-1" onClick={() => {
                      const next = editingPb.steps.filter((_, i) => i !== idx); setEditingPb({ ...editingPb, steps: next.length ? next : [{ title: "", detail: "", estimate: "" }] });
                    }} aria-label="Remove step"><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
                <Button size="sm" variant="outline" onClick={() => setEditingPb({ ...editingPb, steps: [...editingPb.steps, { title: "", detail: "", estimate: "" }] })}>
                  <Plus className="h-3 w-3 mr-1" /> Add step
                </Button>
              </div>
              <div>
                <Label>Done criteria (comma-separated)</Label>
                <Input value={csv(editingPb.done_criteria)} onChange={(e) => setEditingPb({ ...editingPb, done_criteria: fromCsv(e.target.value) })} />
              </div>
              <div>
                <Label>Common pitfalls (comma-separated)</Label>
                <Input value={csv(editingPb.common_pitfalls)} onChange={(e) => setEditingPb({ ...editingPb, common_pitfalls: fromCsv(e.target.value) })} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="pb-ask">If stuck (where to ask)</Label>
                  <Input id="pb-ask" value={editingPb.ask_for_help ?? ""} onChange={(e) => setEditingPb({ ...editingPb, ask_for_help: e.target.value })} placeholder="e.g. Post in #ux-research and tag your project lead" />
                </div>
                <div>
                  <Label htmlFor="pb-eg">Example artifact URL</Label>
                  <Input id="pb-eg" value={editingPb.example_artifact_url ?? ""} onChange={(e) => setEditingPb({ ...editingPb, example_artifact_url: e.target.value })} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Action chips (rendered under the answer)</Label>
                {editingPb.action_chips.map((c, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2">
                    <Input className="col-span-4" placeholder="Label" value={c.label} onChange={(e) => {
                      const next = [...editingPb.action_chips]; next[idx] = { ...c, label: e.target.value }; setEditingPb({ ...editingPb, action_chips: next });
                    }} />
                    <select className="col-span-3 h-9 rounded-md border border-input bg-background px-2 text-sm" value={c.action_type} onChange={(e) => {
                      const next = [...editingPb.action_chips]; next[idx] = { ...c, action_type: e.target.value }; setEditingPb({ ...editingPb, action_chips: next });
                    }}>
                      <option value="link_open">link_open</option>
                      <option value="step_done">step_done</option>
                      <option value="discord_post">discord_post</option>
                      <option value="example_view">example_view</option>
                      <option value="playbook_open">playbook_open</option>
                    </select>
                    <Input className="col-span-4" placeholder="target_url (optional)" value={c.target_url} onChange={(e) => {
                      const next = [...editingPb.action_chips]; next[idx] = { ...c, target_url: e.target.value }; setEditingPb({ ...editingPb, action_chips: next });
                    }} />
                    <Button size="icon" variant="ghost" className="col-span-1" onClick={() => {
                      setEditingPb({ ...editingPb, action_chips: editingPb.action_chips.filter((_, i) => i !== idx) });
                    }} aria-label="Remove chip"><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
                <Button size="sm" variant="outline" onClick={() => setEditingPb({ ...editingPb, action_chips: [...editingPb.action_chips, { label: "", action_type: "link_open", target_url: "" }] })}>
                  <Plus className="h-3 w-3 mr-1" /> Add chip
                </Button>
              </div>

              <div>
                <Label>Tags (comma-separated)</Label>
                <Input value={csv(editingPb.tags)} onChange={(e) => setEditingPb({ ...editingPb, tags: fromCsv(e.target.value) })} />
              </div>
              <div className="flex items-center gap-2">
                <input id="pb-active" type="checkbox" checked={editingPb.is_active} onChange={(e) => setEditingPb({ ...editingPb, is_active: e.target.checked })} />
                <Label htmlFor="pb-active">Active</Label>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setEditingPb(null)}>Cancel</Button>
                <Button onClick={savePlaybook} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                  Save
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {playbooks.map((p) => (
          <Card key={p.id} className={p.is_active ? "" : "opacity-60"}>
            <CardContent className="pt-4 flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">{p.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{p.slug}</p>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{p.direct_answer}</p>
                <div className="flex flex-wrap gap-1 mt-2">
                  <Badge variant="outline">{p.intent}</Badge>
                  <Badge variant="outline">{p.audience}</Badge>
                  <Badge variant="outline">{Array.isArray(p.steps) ? p.steps.length : 0} steps</Badge>
                  {!p.is_active && <Badge variant="secondary">disabled</Badge>}
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <Button size="sm" variant="outline" onClick={() => setEditingPb({
                  ...p,
                  steps: Array.isArray(p.steps) ? p.steps : [],
                  action_chips: Array.isArray(p.action_chips) ? p.action_chips : [],
                  trigger_phrases: p.trigger_phrases ?? [],
                  done_criteria: p.done_criteria ?? [],
                  common_pitfalls: p.common_pitfalls ?? [],
                  tags: p.tags ?? [],
                  ask_for_help: p.ask_for_help ?? "",
                  example_artifact_url: p.example_artifact_url ?? "",
                })}>Edit</Button>
                <Button size="sm" variant="ghost" onClick={() => deletePlaybook(p.id)} aria-label="Delete playbook">
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {playbooks.length === 0 && <p className="text-sm text-muted-foreground">No playbooks yet — add one to start making Fleety practical.</p>}
      </TabsContent>

      <TabsContent value="examples" className="space-y-3">
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setEditingEx({ ...blankExample })}>
            <Plus className="h-4 w-4 mr-1" /> New example
          </Button>
        </div>
        {editingEx && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{editingEx.id ? "Edit example" : "New example"}</CardTitle>
              <CardDescription>Anonymize names, clients, and any private data before saving.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="ex-slug">Slug</Label>
                  <Input id="ex-slug" value={editingEx.slug} onChange={(e) => setEditingEx({ ...editingEx, slug: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="ex-title">Title</Label>
                  <Input id="ex-title" value={editingEx.title} onChange={(e) => setEditingEx({ ...editingEx, title: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="ex-deliv">Deliverable type</Label>
                  <Input id="ex-deliv" value={editingEx.deliverable_type} onChange={(e) => setEditingEx({ ...editingEx, deliverable_type: e.target.value })} placeholder="e.g. project brief, stakeholder map" />
                </div>
                <div>
                  <Label htmlFor="ex-aud">Audience</Label>
                  <select id="ex-aud" value={editingEx.audience} onChange={(e) => setEditingEx({ ...editingEx, audience: e.target.value })} className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm">
                    <option value="all">All</option>
                    <option value="member">Member</option>
                    <option value="teacher">Teacher</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="ex-pb">Related playbook slug</Label>
                  <Input id="ex-pb" value={editingEx.related_playbook_slug ?? ""} onChange={(e) => setEditingEx({ ...editingEx, related_playbook_slug: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="ex-url">Source URL</Label>
                  <Input id="ex-url" value={editingEx.source_url ?? ""} onChange={(e) => setEditingEx({ ...editingEx, source_url: e.target.value })} />
                </div>
              </div>
              <div>
                <Label htmlFor="ex-summary">Summary</Label>
                <Textarea id="ex-summary" rows={2} value={editingEx.summary} onChange={(e) => setEditingEx({ ...editingEx, summary: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="ex-excerpt">Excerpt (anonymized)</Label>
                <Textarea id="ex-excerpt" rows={6} value={editingEx.excerpt} onChange={(e) => setEditingEx({ ...editingEx, excerpt: e.target.value })} />
              </div>
              <div>
                <Label>Tags (comma-separated)</Label>
                <Input value={csv(editingEx.tags)} onChange={(e) => setEditingEx({ ...editingEx, tags: fromCsv(e.target.value) })} />
              </div>
              <div className="flex items-center gap-2">
                <input id="ex-active" type="checkbox" checked={editingEx.is_active} onChange={(e) => setEditingEx({ ...editingEx, is_active: e.target.checked })} />
                <Label htmlFor="ex-active">Active</Label>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setEditingEx(null)}>Cancel</Button>
                <Button onClick={saveExample} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                  Save
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {examples.map((e) => (
          <Card key={e.id} className={e.is_active ? "" : "opacity-60"}>
            <CardContent className="pt-4 flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">{e.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{e.slug} · {e.deliverable_type}</p>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{e.summary}</p>
                <div className="flex flex-wrap gap-1 mt-2">
                  <Badge variant="outline">{e.audience}</Badge>
                  {e.related_playbook_slug && <Badge variant="outline">↦ {e.related_playbook_slug}</Badge>}
                  {!e.is_active && <Badge variant="secondary">disabled</Badge>}
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <Button size="sm" variant="outline" onClick={() => setEditingEx({
                  ...e,
                  tags: e.tags ?? [],
                  source_url: e.source_url ?? "",
                  related_playbook_slug: e.related_playbook_slug ?? "",
                })}>Edit</Button>
                <Button size="sm" variant="ghost" onClick={() => deleteExample(e.id)} aria-label="Delete example">
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {examples.length === 0 && <p className="text-sm text-muted-foreground">No examples yet — adding 1–2 per playbook makes Fleety dramatically more concrete.</p>}
      </TabsContent>
    </Tabs>
  );
}
