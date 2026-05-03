import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ThumbsUp, ThumbsDown, Sparkles, AlertTriangle, Check, X, Loader2 } from "lucide-react";

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
 * Fleety Coach — admin tools to review chat signals and curate Fleety's
 * knowledge: promote great answers to canned answers, approve/reject
 * proposed framework relationships, and spot knowledge gaps where Fleety
 * had no KB or framework hit.
 */
export default function AdminFleetyCoachPage() {
  const [loading, setLoading] = useState(true);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [canned, setCanned] = useState<Canned[]>([]);
  const [proposed, setProposed] = useState<Proposed[]>([]);
  const [stats, setStats] = useState({ total: 0, gaps: 0, thumbsUp: 0, thumbsDown: 0 });
  const [draft, setDraft] = useState({ pattern: "", answer: "", audience: "all", sourceTurnId: "" });

  const load = useCallback(async () => {
    setLoading(true);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [{ data: sigs }, { data: cans }, { data: props }, { count: thumbsUp }, { count: thumbsDown }] = await Promise.all([
      supabase.from("fleety_turn_signals").select("*").gte("created_at", sevenDaysAgo).order("created_at", { ascending: false }).limit(200),
      supabase.from("fleety_canned_answers").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("fleety_proposed_relationships").select("*").eq("status", "pending").order("created_at", { ascending: false }),
      supabase.from("fleety_message_feedback").select("*", { count: "exact", head: true }).eq("rating", 1).gte("created_at", sevenDaysAgo),
      supabase.from("fleety_message_feedback").select("*", { count: "exact", head: true }).eq("rating", -1).gte("created_at", sevenDaysAgo),
    ]);
    const all = (sigs ?? []) as Signal[];
    setSignals(all);
    setCanned((cans ?? []) as Canned[]);
    setProposed((props ?? []) as Proposed[]);
    setStats({
      total: all.length,
      gaps: all.filter((s) => s.kb_hit_count === 0 && s.framework_hit_count === 0).length,
      thumbsUp: thumbsUp ?? 0,
      thumbsDown: thumbsDown ?? 0,
    });
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const promoteFromTurn = (s: Signal) => {
    setDraft({ pattern: s.user_query, answer: "", audience: s.audience, sourceTurnId: s.id });
  };

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
    if (error) toast.error(error.message);
    else load();
  };

  const approveRel = async (id: string) => {
    const { error } = await supabase.rpc("fleety_approve_relationship", { p_id: id });
    if (error) toast.error(error.message);
    else { toast.success("Relationship approved and added to the framework."); load(); }
  };

  const rejectRel = async (id: string) => {
    const { error } = await supabase.from("fleety_proposed_relationships").update({ status: "rejected" }).eq("id", id);
    if (error) toast.error(error.message);
    else load();
  };

  if (loading) return <div className="p-8 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading Fleety insights…</div>;

  return (
    <div className="container max-w-6xl py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2"><Sparkles className="h-7 w-7 text-primary" /> Fleety Coach</h1>
        <p className="text-muted-foreground mt-1">Review the past 7 days of Fleety conversations. Promote great answers, fix knowledge gaps, and approve new framework relationships.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Turns (7d)</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{stats.total}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-1"><AlertTriangle className="h-4 w-4 text-amber-500" /> Knowledge gaps</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{stats.gaps}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-1"><ThumbsUp className="h-4 w-4 text-emerald-500" /> Thumbs up</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{stats.thumbsUp}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-1"><ThumbsDown className="h-4 w-4 text-red-500" /> Thumbs down</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{stats.thumbsDown}</CardContent></Card>
      </div>

      <Tabs defaultValue="gaps" className="w-full">
        <TabsList>
          <TabsTrigger value="gaps">Knowledge Gaps</TabsTrigger>
          <TabsTrigger value="recent">Recent Turns</TabsTrigger>
          <TabsTrigger value="canned">Canned Answers ({canned.length})</TabsTrigger>
          <TabsTrigger value="proposed">Proposed Relationships ({proposed.length})</TabsTrigger>
          <TabsTrigger value="compose">+ New Canned Answer</TabsTrigger>
        </TabsList>

        <TabsContent value="gaps" className="space-y-2 mt-4">
          {signals.filter((s) => s.kb_hit_count === 0 && s.framework_hit_count === 0).map((s) => (
            <Card key={s.id}>
              <CardContent className="pt-4 flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium break-words">{s.user_query}</p>
                  <p className="text-xs text-muted-foreground mt-1">{new Date(s.created_at).toLocaleString()} · audience: {s.audience}</p>
                </div>
                <Button size="sm" onClick={() => promoteFromTurn(s)}>Write canned answer</Button>
              </CardContent>
            </Card>
          ))}
          {stats.gaps === 0 && <p className="text-sm text-muted-foreground">No knowledge gaps in the last 7 days. 🎉</p>}
        </TabsContent>

        <TabsContent value="recent" className="space-y-2 mt-4">
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

        <TabsContent value="canned" className="space-y-2 mt-4">
          {canned.map((c) => (
            <Card key={c.id} className={c.enabled ? "" : "opacity-60"}>
              <CardContent className="pt-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold break-words">{c.question_pattern}</p>
                    <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap line-clamp-3">{c.answer_md}</p>
                    <div className="flex gap-1 mt-2">
                      <Badge variant="outline">{c.audience}</Badge>
                      <Badge variant={c.enabled ? "default" : "secondary"}>{c.enabled ? "active" : "disabled"}</Badge>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => toggleCanned(c)}>{c.enabled ? "Disable" : "Enable"}</Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {canned.length === 0 && <p className="text-sm text-muted-foreground">No canned answers yet. Promote a great turn from the Recent tab to seed one.</p>}
        </TabsContent>

        <TabsContent value="proposed" className="space-y-2 mt-4">
          {proposed.map((p) => (
            <Card key={p.id}>
              <CardContent className="pt-4 flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium break-words">{p.from_entity} → {p.to_entity}</p>
                  <p className="text-xs text-muted-foreground mt-1">{p.description}</p>
                  {p.inverse_description && <p className="text-xs text-muted-foreground mt-1 italic">↩ {p.inverse_description}</p>}
                </div>
                <div className="flex gap-1">
                  <Button size="sm" onClick={() => approveRel(p.id)}><Check className="h-3 w-3 mr-1" /> Approve</Button>
                  <Button size="sm" variant="outline" onClick={() => rejectRel(p.id)}><X className="h-3 w-3 mr-1" /> Reject</Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {proposed.length === 0 && <p className="text-sm text-muted-foreground">No pending relationship proposals.</p>}
        </TabsContent>

        <TabsContent value="compose" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Compose canned answer</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label htmlFor="pattern">Question pattern (canonical phrasing)</Label>
                <Input id="pattern" value={draft.pattern} onChange={(e) => setDraft({ ...draft, pattern: e.target.value })} placeholder="e.g. how do I start my first Tech Fleet project" />
              </div>
              <div>
                <Label htmlFor="answer">Answer (markdown)</Label>
                <Textarea id="answer" value={draft.answer} onChange={(e) => setDraft({ ...draft, answer: e.target.value })} rows={10} placeholder="The exact phrasing Fleety should start from. Include sources and links." />
              </div>
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <Label htmlFor="audience">Audience</Label>
                  <select
                    id="audience"
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
