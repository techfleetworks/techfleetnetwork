import { useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const TYPES = [
  { value: "access", label: "Access — get a copy of my data" },
  { value: "portability", label: "Portability — receive my data in a portable format" },
  { value: "correction", label: "Correction — fix inaccurate data" },
  { value: "erasure", label: "Erasure — delete my data" },
  { value: "restrict", label: "Restrict — pause processing" },
  { value: "object", label: "Object — to a specific use of my data" },
  { value: "human_review", label: "Human review of an automated decision" },
  { value: "appeal", label: "Appeal a previous decision" },
  { value: "withdraw_consent", label: "Withdraw consent" },
];

export default function DsarSubmitPage() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const [type, setType] = useState(params.get("type") || "access");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);

  if (!user) {
    return (
      <div className="container-app py-12 text-center">
        <h1 className="text-xl font-bold">Privacy request</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Please sign in to submit a verified privacy request, or email
          <a className="underline ml-1" href="mailto:info@techfleet.network">info@techfleet.network</a>.
        </p>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("dsar-submit", {
        body: { type, payload: { details } },
      });
      if (error) throw error;
      toast.success(`Request received. We will respond within 30 days. Reference: ${(data as { id?: string })?.id?.slice(0, 8) ?? ""}`);
      nav("/privacy");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not submit request");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container-app py-8 max-w-2xl">
      <h1 className="text-2xl font-bold">Submit a privacy request</h1>
      <p className="text-sm text-muted-foreground mt-1">
        We respond within 30 days. You'll receive a confirmation email with a reference number.
      </p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <div className="field-group">
          <Label htmlFor="dsar-type">Request type</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger id="dsar-type"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="field-group">
          <Label htmlFor="dsar-details">Details (optional)</Label>
          <Textarea id="dsar-details" rows={6} maxLength={5000} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Tell us anything that helps us identify the data you're asking about." />
        </div>
        <Button type="submit" disabled={busy}>{busy ? "Submitting..." : "Submit request"}</Button>
      </form>
    </div>
  );
}
