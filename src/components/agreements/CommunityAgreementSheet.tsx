import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@/lib/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, FileCheck2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { sanitizeHtml } from "@/lib/security";
import { format } from "date-fns";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicationId: string;
  projectName?: string;
  clientName?: string;
}

interface AgreementVersion {
  id: string;
  version: string;
  title: string;
  body_html: string;
}

interface SignatureRow {
  id: string;
  signed_at: string;
  version_id: string;
}

export function CommunityAgreementSheet({ open, onOpenChange, applicationId, projectName, clientName }: Props) {
  const qc = useQueryClient();
  const [agreed, setAgreed] = useState(false);

  const { data: version, isLoading: versionLoading } = useQuery({
    queryKey: ["community-agreement-current"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_agreement_versions" as any)
        .select("id, version, title, body_html")
        .eq("is_current", true)
        .single();
      if (error) throw error;
      return data as unknown as AgreementVersion;
    },
    enabled: open,
    staleTime: 60_000,
  });

  const { data: signature } = useQuery({
    queryKey: ["community-agreement-signature", applicationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_agreement_signatures" as any)
        .select("id, signed_at, version_id")
        .eq("application_id", applicationId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as SignatureRow | null;
    },
    enabled: open && !!applicationId,
  });

  useEffect(() => {
    if (!open) setAgreed(false);
  }, [open]);

  const signMutation = useMutation({
    mutationFn: async () => {
      const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
      const { data, error } = await supabase.rpc("sign_community_agreement" as any, {
        p_application_id: applicationId,
        p_user_agent: ua,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Thanks! Your agreement is signed.", {
        description: "You're all set to start your team training.",
      });
      qc.invalidateQueries({ queryKey: ["community-agreement-signature", applicationId] });
      qc.invalidateQueries({ queryKey: ["my-project-app-status", applicationId] });
      qc.invalidateQueries({ queryKey: ["dashboard-agreement-status"] });
      qc.invalidateQueries({ queryKey: ["roster-agreement-status"] });
      onOpenChange(false);
    },
    onError: (e: any) => {
      toast.error("We couldn't record your signature.", {
        description: e?.message || "Please try again in a moment.",
      });
    },
  });

  const safeHtml = useMemo(() => version ? sanitizeHtml(version.body_html) : "", [version]);
  const alreadySigned = !!signature;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-2xl w-full flex flex-col p-0">
        <SheetHeader className="p-6 pb-3 border-b">
          <SheetTitle className="flex items-center gap-2 text-lg">
            <FileCheck2 className="h-5 w-5 text-primary" />
            Community Contributor Terms
          </SheetTitle>
          <SheetDescription>
            {projectName ? (
              <>For your role on <strong>{projectName}</strong>{clientName ? <> with <strong>{clientName}</strong></> : null}.</>
            ) : (
              <>Review and agree to begin your team training.</>
            )}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 px-6 py-4">
          {versionLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="Loading terms" />
            </div>
          ) : (
            <div
              className="prose prose-sm max-w-none text-foreground [&_a]:text-primary [&_h1]:text-xl [&_h2]:text-base [&_h2]:mt-5 [&_h2]:font-semibold [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_li]:my-1"
              dangerouslySetInnerHTML={{ __html: safeHtml }}
            />
          )}
        </ScrollArea>

        <div className="border-t p-6 bg-background space-y-3">
          {alreadySigned ? (
            <div className="flex items-center gap-2 text-success text-sm">
              <CheckCircle2 className="h-5 w-5" />
              Signed on {format(new Date(signature!.signed_at), "MMMM d, yyyy")}
            </div>
          ) : (
            <>
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={agreed}
                  onCheckedChange={(v) => setAgreed(v === true)}
                  aria-label="I agree to the Community Contributor Terms"
                  className="mt-0.5"
                />
                <span>I have read and agree to the Community Contributor Terms and Conditions.</span>
              </label>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)} disabled={signMutation.isPending}>
                  Close
                </Button>
                <Button
                  onClick={() => signMutation.mutate()}
                  disabled={!agreed || signMutation.isPending}
                >
                  {signMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</>
                  ) : "Agree and continue"}
                </Button>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
