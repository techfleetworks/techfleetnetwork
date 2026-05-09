import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LifeBuoy, Bug, ShieldCheck, Loader2 } from "lucide-react";
import { reportError } from "@/services/error-reporter.service";

interface AdminTicketRow {
  id: string;
  chatwoot_conversation_id: number;
  inbox_type: "support" | "bug" | "internal";
  subject: string;
  status: "open" | "pending" | "snoozed" | "resolved";
  owner_identifier: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
}

const statusColor: Record<AdminTicketRow["status"], string> = {
  open: "bg-blue-500/15 text-blue-400 border-blue-500/40",
  pending: "bg-amber-500/15 text-amber-400 border-amber-500/40",
  snoozed: "bg-muted text-muted-foreground",
  resolved: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40",
};

export default function AdminTicketsPage() {
  const [tickets, setTickets] = useState<AdminTicketRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select("id,chatwoot_conversation_id,inbox_type,subject,status,owner_identifier,last_message_at,last_message_preview")
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(500);
      if (cancelled) return;
      if (error) reportError(error, "AdminTicketsPage.load", { severity: "warn" });
      else setTickets((data ?? []) as AdminTicketRow[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const baseUrl = import.meta.env.VITE_LOVABLE_CONNECTOR_CHATWOOT_BASE_URL || "";
  const conversationLink = (id: number) => baseUrl ? `${baseUrl.replace(/\/$/, "")}/app/accounts/1/conversations/${id}` : "#";

  const grouped = {
    support: tickets.filter((t) => t.inbox_type === "support"),
    bug: tickets.filter((t) => t.inbox_type === "bug"),
    internal: tickets.filter((t) => t.inbox_type === "internal"),
  };

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6 max-w-6xl">
      <header className="flex items-center gap-2">
        <ShieldCheck className="h-7 w-7 text-primary" />
        <h1 className="text-2xl md:text-3xl font-semibold">Admin tickets</h1>
      </header>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <Tabs defaultValue="support">
          <TabsList>
            <TabsTrigger value="support"><LifeBuoy className="h-4 w-4 mr-1" /> Support ({grouped.support.length})</TabsTrigger>
            <TabsTrigger value="bug"><Bug className="h-4 w-4 mr-1" /> Bugs ({grouped.bug.length})</TabsTrigger>
            <TabsTrigger value="internal"><ShieldCheck className="h-4 w-4 mr-1" /> Internal ({grouped.internal.length})</TabsTrigger>
          </TabsList>
          {(["support", "bug", "internal"] as const).map((kind) => (
            <TabsContent key={kind} value={kind} className="mt-4">
              {grouped[kind].length === 0 ? (
                <Card><CardContent className="py-12 text-center text-muted-foreground">No tickets in this inbox.</CardContent></Card>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {grouped[kind].map((t) => (
                    <a key={t.id} href={conversationLink(t.chatwoot_conversation_id)} target="_blank" rel="noopener noreferrer">
                      <Card className="hover:border-primary/60 transition-colors">
                        <CardContent className="p-4 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="font-medium truncate">{t.subject || `Conversation #${t.chatwoot_conversation_id}`}</div>
                            <Badge className={statusColor[t.status]}>{t.status}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-2">{t.last_message_preview || "No messages yet."}</p>
                          <p className="text-xs text-muted-foreground">
                            {t.owner_identifier ? `User ${t.owner_identifier.slice(0, 8)}…` : "Unknown user"} · {t.last_message_at ? new Date(t.last_message_at).toLocaleString() : ""}
                          </p>
                        </CardContent>
                      </Card>
                    </a>
                  ))}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}
