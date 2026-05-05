/**
 * KnownIssuePanel — Lane 5 silence catalog viewer/editor.
 *
 * Admins can:
 *   - See active silence patterns (substring/regex/fingerprint)
 *   - Add a new silence rule without a deploy
 *   - Toggle entries on/off
 *
 * RLS enforces admin-only read/write on `known_issue_catalog`.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Plus } from "lucide-react";

type MatchKind = "substring" | "regex" | "fingerprint";

interface CatalogRow {
  id: string;
  pattern: string;
  match_kind: MatchKind;
  event_type_filter: string | null;
  reason: string;
  is_active: boolean;
  created_at: string;
}

export function KnownIssuePanel() {
  const [rows, setRows] = useState<CatalogRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    pattern: "",
    match_kind: "substring" as MatchKind,
    event_type_filter: "",
    reason: "",
  });

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("known_issue_catalog")
        .select("id,pattern,match_kind,event_type_filter,reason,is_active,created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      setRows((data ?? []) as CatalogRow[]);
    } catch (e) {
      toast.error("Failed to load known-issue catalog", { description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  const toggleActive = async (row: CatalogRow) => {
    setBusyId(row.id);
    const next = !row.is_active;
    try {
      const { error } = await supabase
        .from("known_issue_catalog")
        .update({ is_active: next })
        .eq("id", row.id);
      if (error) throw error;
      toast.success(next ? "Silence enabled" : "Silence disabled");
      await fetchAll();
    } catch (e) {
      toast.error("Toggle failed", { description: (e as Error).message });
    } finally {
      setBusyId(null);
    }
  };

  const addRule = async () => {
    const pattern = draft.pattern.trim();
    const reason = draft.reason.trim();
    if (!pattern || !reason) {
      toast.error("Pattern and reason are required");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.from("known_issue_catalog").insert({
        pattern,
        match_kind: draft.match_kind,
        event_type_filter: draft.event_type_filter.trim() || null,
        reason,
        is_active: true,
      });
      if (error) throw error;
      toast.success("Silence rule added");
      setDraft({ pattern: "", match_kind: "substring", event_type_filter: "", reason: "" });
      await fetchAll();
    } catch (e) {
      toast.error("Add failed", { description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Known-Issue Catalog</CardTitle>
        <CardDescription>
          Patterns the triage system silences automatically. Edit live — no deploy needed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border p-3 space-y-2 bg-muted/20">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Add a silence rule
          </p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <Input
              placeholder="Pattern (e.g. ResizeObserver loop)"
              value={draft.pattern}
              onChange={(e) => setDraft({ ...draft, pattern: e.target.value })}
              aria-label="Pattern"
            />
            <Select
              value={draft.match_kind}
              onValueChange={(v) => setDraft({ ...draft, match_kind: v as MatchKind })}
            >
              <SelectTrigger aria-label="Match kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="substring">substring</SelectItem>
                <SelectItem value="regex">regex</SelectItem>
                <SelectItem value="fingerprint">fingerprint</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder="Event type filter (optional)"
              value={draft.event_type_filter}
              onChange={(e) => setDraft({ ...draft, event_type_filter: e.target.value })}
              aria-label="Event type filter"
            />
            <Input
              placeholder="Reason (required)"
              value={draft.reason}
              onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
              aria-label="Reason"
            />
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={addRule} disabled={loading}>
              <Plus className="h-4 w-4 mr-1" /> Add rule
            </Button>
          </div>
        </div>

        {loading && !rows ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : rows && rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No silence rules yet. Errors that match a rule never re-triage.
          </p>
        ) : (
          <ul className="space-y-1">
            {rows?.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-3 rounded-md border p-2 hover:bg-muted/30"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline">{row.match_kind}</Badge>
                    {row.event_type_filter && (
                      <Badge variant="secondary">{row.event_type_filter}</Badge>
                    )}
                    <code className="text-xs font-mono truncate">{row.pattern}</code>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{row.reason}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted-foreground">
                    {row.is_active ? "active" : "off"}
                  </span>
                  <Switch
                    checked={row.is_active}
                    disabled={busyId === row.id}
                    onCheckedChange={() => toggleActive(row)}
                    aria-label={`Toggle ${row.pattern}`}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
