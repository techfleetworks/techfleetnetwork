import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@/lib/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { RichTextEditor } from "@/components/RichTextEditor";
import { toast } from "@/hooks/use-toast";
import { Loader2, Send, Mail, Users } from "lucide-react";

const SUBJECT_MAX = 150;
const BODY_MAX = 50_000;

interface Props {
  projectId: string;
  projectName: string;
  isCoordinator: boolean;
}

export default function ProjectBlastComposer({ projectId, projectName, isCoordinator }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const { data: applicantCount = 0 } = useQuery({
    queryKey: ["project-blast-applicant-count", projectId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("project_applications")
        .select("id", { head: true, count: "exact" })
        .eq("project_id", projectId)
        .eq("status", "completed");
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!user && isCoordinator,
  });


  const subjectTrim = subject.trim();
  const bodyText = useMemo(() => body.replace(/<[^>]+>/g, "").trim(), [body]);
  const canSend =
    isCoordinator &&
    subjectTrim.length > 0 &&
    subjectTrim.length <= SUBJECT_MAX &&
    body.length > 0 &&
    body.length <= BODY_MAX &&
    bodyText.length > 0 &&
    applicantCount > 0 &&
    !sending;

  if (!isCoordinator) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Project blasts</CardTitle>
          <CardDescription>
            Only the assigned project coordinator (with admin role) can send blasts.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  async function handleSend() {
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-project-blast", {
        body: { projectId, subject: subjectTrim, bodyHtml: body },
      });
      if (error) throw error;
      const result = data as { recipientCount: number; emailSent: number; emailFailed: number; status: string };
      toast({
        title: `Blast sent to ${result.recipientCount} ${result.recipientCount === 1 ? "applicant" : "applicants"}`,
        description: `${result.emailSent} delivered · ${result.emailFailed} failed`,
      });
      setSubject("");
      setBody("");
      setConfirmOpen(false);
      qc.invalidateQueries({ queryKey: ["project-blast-history", projectId] });
      refetchHistory();
    } catch (e: any) {
      toast({
        title: "Couldn't send blast",
        description: e?.message ?? "Please try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" /> Send a project blast
          </CardTitle>
          <CardDescription>
            Sends a branded email and an in-app notification to everyone who applied to this project.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border bg-muted/30 px-4 py-3 text-sm flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" aria-hidden />
            <span>
              This will reach <strong>{applicantCount}</strong>{" "}
              {applicantCount === 1 ? "applicant" : "applicants"} for{" "}
              <strong>{projectName}</strong>.
            </span>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="blast-subject">Subject line</Label>
            <Input
              id="blast-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value.slice(0, SUBJECT_MAX))}
              placeholder="Quick update on this week's milestones"
              maxLength={SUBJECT_MAX}
              aria-describedby="blast-subject-help"
            />
            <p id="blast-subject-help" className="text-xs text-muted-foreground">
              {subjectTrim.length}/{SUBJECT_MAX} characters
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="blast-body">Message</Label>
            <RichTextEditor content={body} onChange={setBody} placeholder="Write your update…" />
            <p className="text-xs text-muted-foreground">
              Scripts and unsafe HTML are stripped automatically.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => { setSubject(""); setBody(""); }}
              disabled={sending || (!subject && !body)}
            >
              Clear draft
            </Button>
            <Button
              disabled={!canSend}
              onClick={() => setConfirmOpen(true)}
            >
              {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Send blast
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Blast history</CardTitle>
          <CardDescription>Most recent project blasts you sent for this project.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No blasts sent yet.</p>
          ) : (
            <table className="w-full text-sm min-w-[640px]">
              <thead className="text-left text-muted-foreground border-b">
                <tr>
                  <th className="px-3 py-2">Sent</th>
                  <th className="px-3 py-2">Subject</th>
                  <th className="px-3 py-2">Recipients</th>
                  <th className="px-3 py-2">Sent</th>
                  <th className="px-3 py-2">Failed</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {history.map((b: any) => (
                  <tr key={b.id} className="border-b last:border-b-0">
                    <td className="px-3 py-2 text-muted-foreground">
                      {b.sent_at ? formatDistanceToNow(new Date(b.sent_at), { addSuffix: true }) :
                        formatDistanceToNow(new Date(b.created_at), { addSuffix: true })}
                    </td>
                    <td className="px-3 py-2 font-medium text-foreground truncate max-w-[260px]">{b.subject}</td>
                    <td className="px-3 py-2">{b.recipient_count}</td>
                    <td className="px-3 py-2 text-success">{b.email_sent_count}</td>
                    <td className="px-3 py-2 text-destructive">{b.email_failed_count}</td>
                    <td className="px-3 py-2">
                      <Badge variant={b.status === "sent" ? "default" : b.status === "partial" ? "secondary" : b.status === "failed" ? "destructive" : "outline"}>
                        {b.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Send blast to ${applicantCount} ${applicantCount === 1 ? "applicant" : "applicants"}?`}
        consequence={
          <>
            Each applicant will receive an email and an in-app notification.
            This action can't be undone.
          </>
        }
        actionLabel="Send blast"
        loading={sending}
        onConfirm={handleSend}
      />
    </div>
  );
}
