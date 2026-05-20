import { useState } from "react";
import { MessageSquare, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Icon } from "@/components/ui/icon";

type BackfillResult = {
  scanned: number;
  repaired: number;
  skipped_unchanged: number;
  skipped_discord_dot_legit: number;
  errors: Array<{ user_id: string; reason: string }>;
};

/**
 * Admin-only one-shot repair for legacy `@.` Discord username labels.
 * Triggers the `backfill-discord-usernames` edge function which never touches
 * `discord_user_id` or `has_discord_account` — only normalizes the displayed handle.
 */
export function DiscordRepairTab() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BackfillResult | null>(null);

  const runRepair = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke<BackfillResult>(
        "backfill-discord-usernames",
        { body: {} },
      );
      if (error) throw error;
      setResult(data ?? null);
      toast({
        title: "Discord usernames repaired",
        description: data
          ? `Scanned ${data.scanned} • Repaired ${data.repaired} • Skipped ${data.skipped_unchanged + data.skipped_discord_dot_legit}`
          : "Repair complete",
        variant: "default",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast({
        title: "Repair failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon icon={MessageSquare} size="ui" label="Discord" />
          Discord username repair
        </CardTitle>
        <CardDescription>
          Normalizes legacy member labels that render as <code>@.</code> or <code>@</code> by
          fetching the canonical handle from Discord. Only the displayed username changes —
          member links and verified status stay intact.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={runRepair} disabled={running}>
          <RefreshCw className={`mr-2 h-4 w-4 ${running ? "animate-spin" : ""}`} aria-hidden />
          {running ? "Repairing…" : "Repair Discord usernames"}
        </Button>

        {result && (
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge variant="secondary">Scanned: {result.scanned}</Badge>
            <Badge variant="default">Repaired: {result.repaired}</Badge>
            <Badge variant="outline">Unchanged: {result.skipped_unchanged}</Badge>
            <Badge variant="outline">
              Legit dot-leading: {result.skipped_discord_dot_legit}
            </Badge>
            {result.errors.length > 0 && (
              <Badge variant="destructive">Errors: {result.errors.length}</Badge>
            )}
          </div>
        )}

        {result && result.errors.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">View errors</summary>
            <ul className="mt-2 space-y-1">
              {result.errors.map((e, i) => (
                <li key={i} className="font-mono text-xs">
                  {e.user_id.slice(0, 8)}… — {e.reason}
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
