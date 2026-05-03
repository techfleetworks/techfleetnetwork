import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ThumbsUp, ThumbsDown, Sparkles, AlertTriangle, Check, X, Loader2, Clock,
} from "lucide-react";
import { FleetyPlaybooksManager } from "@/components/admin/FleetyPlaybooksManager";

type Signal = {
  id: string;
  user_query: string;
  audience: string;
  kb_hit_count: number;
  framework_hit_count: number;
  web_hit_count: number;
  canned_answer_id: string | null;
  created_at: string;
  conversation_id: string | null;
};

type Canned = {
  id: string;
  question_pattern: string;
  answer_md: string;
  audience: string;
  enabled: boolean;
  created_at: string;
};

type Proposed = {
  id: string;
  from_entity: string;
  to_entity: string;
  description: string;
  inverse_description: string | null;
  status: string;
  created_at: string;
};

/**
 * Fleety Coach panel — embedded in System Health.
 *
 * Surfaces last-7-days chat signals (turn count, knowledge gaps, thumbs),
 * lets admins one-click promote a turn to a canned answer, toggle existing
 * canned answers, and approve/reject Fleety's auto-proposed framework
 * relationships. RLS guarantees only admins see/manage these rows.
 */
export function FleetyHealthTab() {
  const [loading, setLoading] = useState(true);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [canned, setCanned] = useState<Canned[]>([]);
  const [proposed, setProposed] = useState<Proposed[]>([]);
  const [stats, setStats] = useState({ total: 0, gaps: 0, thumbsUp: 0, thumbsDown: 0 });
  const [draft, setDraft] = useState({ pattern: "", answer: "", audience: "all", sourceTurnId: "" });
  const [generatedAt, setGeneratedAt] = useState<string>(new Date().toISOString());

  const load = useCallback(async () => {
    setLoading(true);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [sigsRes, cansRes, propsRes, upRes, dnRes] = await Promise.all([
      supabase.from("fleety_turn_signals").select("*").gte("created_at", sevenDaysAgo).order("created_at", { ascending: false }).limit(200),
      supabase.from("fleety_canned_answers").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("fleety_proposed_relationships").select("*").eq("status", "pending").order("created_at", { ascending: false }),
      supabase.from("fleety_message_feedback").select("*", { count: "exact", head: true }).eq("rating", 1).gte("created_at", sevenDaysAgo),
      supabase.from("fleety_message_feedback").select("*", { count: "exact", head: true }).eq("rating", -1).gte("created_at", sevenDaysAgo),
    ]);
    const all = (sigsRes.data ?? []) as Signal[];
    setSignals(all);
    setCanned((cansRes.data ?? []) as Canned[]);
    setProposed((propsRes.data ?? []) as Proposed[]);
    setStats({
      total: all.length,
      gaps: all.filter((s) => s.kb_hit_count === 0 && s.framework_hit_count === 0).length,
      thumbsUp: upRes.count ?? 0,
      thumbsDown: dnRes.count ?? 0,
    });
    setGeneratedAt(new Date().toISOString());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const promoteFromTurn = (s: Signal) =>
    setDraft({ pattern: s.user_query, answer: "", audience: s.audience, sourceTurnId: s.id });

  const saveCanned = async () => {
    if (!draft.pattern.trim() || !draft.answer.trim()) {
      toast.error("Question pattern and answer are required.");
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("fleety_canned_answers").insert({
      question_pattern: draft.pattern.trim(),
      answer_md: draft.answer.trim(),
      audience: draft.audience,
      source_turn_id: draft.sourceTurnId || null,
      created_by: user?.id ?? null,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Canned answer saved. Fleety will use it on matching questions.");
      setDraft({ pattern: "", answer: "", audience: "all", sourceTurnId: "" });
      load();
    }
  };

  const toggleCanned = async (c: Canned) => {
    const { error } = await supabase.from("fleety_canned_answers").update({ enabled: !c.enabled }).eq("id", c.id);
    if (error) toast.error(error.message); else load();
  };

  const approveRel = async (id: string) => {
    const { error } = await supabase.rpc("fleety_approve_relationship", { p_id: id });
    if (error) toast.error(error.message);
    else { toast.success("Relationship approved and added to the framework."); load(); }
  };

  const rejectRel = async (id: string) => {
    const { error } = await supabase.from("fleety_proposed_relationships").update({ status: "rejected" }).eq("id", id);
    if (error) toast.error(error.message); else load();
  };

  const updatedRel = (() => {
    const ago = Math.round((Date.now() - new Date(generatedAt).getTime()) / 1000);
    if (ago < 60) return `${ago}s ago`;
    return `${Math.round(ago / 60)}m ago`;
  })();

  if (loading) {
    return (
      <Card>
        <CardContent className="py-10 flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading Fleety insights…
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" /> Fleety Learning
          </CardTitle>
          <CardDescription className="flex items-center gap-1 text-xs">
            <Clock className="h-3 w-3" aria-hidden /> Updated {updatedRel} · Last 7 days of Fleety chat signals.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Turns" value={stats.total} />
          <Stat label="Knowledge gaps" value={stats.gaps} icon={<AlertTriangle className="h-3.5 w-3.5 text-warning" />} tone={stats.gaps > 0 ? "warning" : "default"} />
          <Stat label="Thumbs up" value={stats.thumbsUp} icon={<ThumbsUp className="h-3.5 w-3.5 text-success" />} />
          <Stat label="Thumbs down" value={stats.thumbsDown} icon={<ThumbsDown className="h-3.5 w-3.5 text-destructive" />} tone={stats.thumbsDown > 0 ? "warning" : "default"} />
        </CardContent>
      </Card>

      <Tabs defaultValue="gaps" className="w-full">
        <TabsList aria-label="Fleety learning sections">
          <TabsTrigger value="gaps">Gaps ({stats.gaps})</TabsTrigger>
          <TabsTrigger value="recent">Recent</TabsTrigger>
          <TabsTrigger value="canned">Canned ({canned.length})</TabsTrigger>
          <TabsTrigger value="proposed">Proposed ({proposed.length})</TabsTrigger>
          <TabsTrigger value="compose">+ Canned Answer</TabsTrigger>
        </TabsList>

        <TabsContent value="gaps" className="space-y-2 mt-3">
          {signals.filter((s) => s.kb_hit_count === 0 && s.framework_hit_count === 0).map((s) => (
            <Card key={s.id}>
              <CardContent className="pt-4 flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium break-words">{s.user_query}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(s.created_at).toLocaleString()} · audience: {s.audience}
                  </p>
                </div>
                <Button size="sm" onClick={() => promoteFromTurn(s)}>Save as canned answer</Button>
              </CardContent>
            </Card>
          ))}
          {stats.gaps === 0 && <p className="text-sm text-muted-foreground">No knowledge gaps in the last 7 days. 🎉</p>}
        </TabsContent>

        <TabsContent value="recent" className="space-y-2 mt-3">
          {signals.slice(0, 50).map((s) => (
            <Card key={s.id}>
              <CardContent className="pt-4 flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm break-words">{s.user_query}</p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    <Badge variant="outline">KB: {s.kb_hit_count}</Badge>
                    <Badge variant="outline">Framework: {s.framework_hit_count}</Badge>
                    <Badge variant="outline">Web: {s.web_hit_count}</Badge>
                    <Badge variant="outline">{s.audience}</Badge>
                    {s.canned_answer_id && <Badge>canned</Badge>}
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => promoteFromTurn(s)}>Promote</Button>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="canned" className="space-y-2 mt-3">
          {canned.map((c) => (
            <Card key={c.id} className={c.enabled ? "" : "opacity-60"}>
              <CardContent className="pt-4 flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold break-words">{c.question_pattern}</p>
                  <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap line-clamp-3">{c.answer_md}</p>
                  <div className="flex gap-1 mt-2">
                    <Badge variant="outline">{c.audience}</Badge>
                    <Badge variant={c.enabled ? "default" : "secondary"}>{c.enabled ? "active" : "disabled"}</Badge>
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => toggleCanned(c)}>
                  {c.enabled ? "Disable" : "Enable"}
                </Button>
              </CardContent>
            </Card>
          ))}
          {canned.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No canned answers yet. Promote a great turn from Recent or Gaps to seed one.
            </p>
          )}
        </TabsContent>

        <TabsContent value="proposed" className="space-y-2 mt-3">
          {proposed.map((p) => (
            <Card key={p.id}>
              <CardContent className="pt-4 flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium break-words">{p.from_entity} → {p.to_entity}</p>
                  <p className="text-xs text-muted-foreground mt-1">{p.description}</p>
                  {p.inverse_description && (
                    <p className="text-xs text-muted-foreground mt-1 italic">↩ {p.inverse_description}</p>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button size="sm" onClick={() => approveRel(p.id)}>
                    <Check className="h-3 w-3 mr-1" /> Approve
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => rejectRel(p.id)}>
                    <X className="h-3 w-3 mr-1" /> Reject
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {proposed.length === 0 && <p className="text-sm text-muted-foreground">No pending relationship proposals.</p>}
        </TabsContent>

        <TabsContent value="compose" className="mt-3">
          <Card>
            <CardHeader>
              <CardTitle>Compose canned answer</CardTitle>
              <CardDescription>Saved answers take retrieval priority over the LLM's own writing.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label htmlFor="fleety-pattern">Question pattern (canonical phrasing)</Label>
                <Input
                  id="fleety-pattern"
                  value={draft.pattern}
                  onChange={(e) => setDraft({ ...draft, pattern: e.target.value })}
                  placeholder="e.g. how do I start my first Tech Fleet project"
                />
              </div>
              <div>
                <Label htmlFor="fleety-answer">Answer (markdown)</Label>
                <Textarea
                  id="fleety-answer"
                  value={draft.answer}
                  onChange={(e) => setDraft({ ...draft, answer: e.target.value })}
                  rows={10}
                  placeholder="The exact phrasing Fleety should start from. Include sources and links."
                />
              </div>
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <Label htmlFor="fleety-audience">Audience</Label>
                  <select
                    id="fleety-audience"
                    value={draft.audience}
                    onChange={(e) => setDraft({ ...draft, audience: e.target.value })}
                    className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    <option value="all">All</option>
                    <option value="member">Trainee/Member</option>
                    <option value="teacher">Teacher</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <Button onClick={saveCanned}>Save canned answer</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, value, icon, tone = "default" }: { label: string; value: number; icon?: React.ReactNode; tone?: "default" | "warning" }) {
  const toneClass = tone === "warning" ? "border-warning/40" : "";
  return (
    <Card className={toneClass}>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground flex items-center gap-1">{icon}{label}</p>
        <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
      </CardContent>
    </Card>
  );
}
