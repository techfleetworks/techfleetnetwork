import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LifeBuoy, Bug, MessageSquarePlus, Loader2 } from "lucide-react";
import { openSupportWidget } from "@/components/SupportWidget";
import { reportError } from "@/services/error-reporter.service";

interface TicketRow {
  id: string;
  chatwoot_conversation_id: number;
  inbox_type: "support" | "bug" | "internal";
  subject: string;
  status: "open" | "pending" | "snoozed" | "resolved";
  last_message_at: string | null;
  last_message_preview: string | null;
}

const statusVariant: Record<TicketRow["status"], "default" | "secondary" | "outline"> = {
  open: "default",
  pending: "secondary",
  snoozed: "outline",
  resolved: "outline",
};

const statusColor: Record<TicketRow["status"], string> = {
  open: "bg-blue-500/15 text-blue-400 border-blue-500/40",
  pending: "bg-amber-500/15 text-amber-400 border-amber-500/40",
  snoozed: "bg-muted text-muted-foreground",
  resolved: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40",
};

export default function SupportPage() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) { setLoading(false); return; }
      const { data, error } = await supabase
        .from("tickets")
        .select("id,chatwoot_conversation_id,inbox_type,subject,status,last_message_at,last_message_preview")
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(100);
      if (cancelled) return;
      if (error) {
        reportError(error, { source: "SupportPage.load", severity: "warn" });
        setTickets([]);
      } else {
        setTickets((data ?? []) as TicketRow[]);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const grouped = {
    support: tickets.filter((t) => t.inbox_type === "support"),
    bug: tickets.filter((t) => t.inbox_type === "bug"),
  };

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6 max-w-5xl">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold flex items-center gap-2">
            <LifeBuoy className="h-7 w-7 text-primary" /> Support
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Your conversations with the Tech Fleet team. Replies notify you in-app.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={openSupportWidget}>
            <MessageSquarePlus className="h-4 w-4 mr-2" /> New conversation
          </Button>
          <Button variant="outline" onClick={openSupportWidget}>
            <Bug className="h-4 w-4 mr-2" /> Report a bug
          </Button>
        </div>
      </header>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : tickets.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No tickets yet. Click "New conversation" to start one.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {(["support", "bug"] as const).map((kind) => grouped[kind].length > 0 && (
            <section key={kind} aria-labelledby={`tickets-${kind}`}>
              <h2 id={`tickets-${kind}`} className="text-lg font-medium mb-3 flex items-center gap-2">
                {kind === "support" ? <LifeBuoy className="h-5 w-5" /> : <Bug className="h-5 w-5" />}
                {kind === "support" ? "Support requests" : "Bug reports"}
                <span className="text-sm text-muted-foreground">({grouped[kind].length})</span>
              </h2>
              <div className="grid gap-3 md:grid-cols-2">
                {grouped[kind].map((t) => (
                  <Card key={t.id}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center justify-between gap-2">
                        <span className="truncate">{t.subject || `Conversation #${t.chatwoot_conversation_id}`}</span>
                        <Badge variant={statusVariant[t.status]} className={statusColor[t.status]}>
                          {t.status}
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground line-clamp-2 min-h-[2.5rem]">
                        {t.last_message_preview || "No messages yet."}
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        {t.last_message_at ? new Date(t.last_message_at).toLocaleString() : ""}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
