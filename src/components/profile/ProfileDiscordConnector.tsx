import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronRight, Copy, ExternalLink, Loader2, MessageSquare, RefreshCw } from "lucide-react";
import DiscordUsernameTutorial from "@/components/DiscordUsernameTutorial";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  DISCORD_MEMBER_NOT_VISIBLE_MESSAGE,
  DiscordNotifyService,
} from "@/services/discord-notify.service";
import { JourneyService } from "@/services/journey.service";
import { toast } from "sonner";

const TASK_ID = "connect-discord";
const PHASE = "first_steps" as const;
const COMMUNITY_ROLE_ID = "1083439364975112293";

type Candidate = {
  id: string;
  username: string;
  global_name: string | null;
  nick?: string | null;
  avatar?: string | null;
};

function normalizeDiscordUsername(raw: string): string {
  let name = raw.trim();
  if (name.startsWith("@")) name = name.slice(1);
  if (!name.startsWith(".")) name = `.${name}`;
  return name;
}

export function ProfileDiscordConnector() {
  const { user, profile, refreshProfile } = useAuth();
  const [username, setUsername] = useState(profile?.discord_username || "");
  const [verifying, setVerifying] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [relinking, setRelinking] = useState(false);

  const isLinked = Boolean(profile?.discord_user_id) && !relinking;
  const displayName = profile?.display_name || profile?.first_name || user?.user_metadata?.full_name || "A member";

  const clearStaleCandidate = (candidateId: string) => {
    setCandidates((current) => current.filter((candidate) => candidate.id !== candidateId));
    setConfirmingId(null);
  };

  useEffect(() => {
    if (!relinking) setUsername(profile?.discord_username || "");
  }, [profile?.discord_username, relinking]);

  const generateInvite = async () => {
    setGenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const res = await supabase.functions.invoke("generate-discord-invite", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.error) throw new Error(res.error.message || "Failed to generate invite");
      const url = res.data?.invite_url;
      if (!url) throw new Error("No invite URL returned");
      setInviteUrl(url);
      toast.success("Your personal Discord invite link is ready!", { duration: 5000, position: "top-center" });
    } catch (err: any) {
      toast.error(err.message || "Failed to generate invite link", { duration: 30000, position: "top-center" });
    } finally {
      setGenerating(false);
    }
  };

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
      toast.success("Invite link copied!", { duration: 5000, position: "top-center" });
    } catch {
      toast.error("Could not copy to clipboard", { duration: 30000, position: "top-center" });
    }
  };

  const assignCommunityRole = async (discordUserId: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Not authenticated");

    const res = await supabase.functions.invoke("manage-discord-roles", {
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: { action: "assign", discord_user_id: discordUserId, role_id: COMMUNITY_ROLE_ID },
    });
    if (res.error) throw new Error(res.error.message || "Failed to assign the Community role");
  };

  const finalizeLinking = async (discordUserId: string, discordUsername: string) => {
    if (!user) throw new Error("Not authenticated");

    const { data: existing } = await supabase
      .from("profiles")
      .select("display_name, user_id")
      .eq("discord_user_id", discordUserId)
      .neq("user_id", user.id)
      .limit(1);

    if (existing && existing.length > 0) {
      const ownerName = existing[0].display_name || "another member";
      throw new Error(`This Discord account is already linked to ${ownerName}. Each Discord account can only be connected to one Tech Fleet profile.`);
    }

    const { error } = await supabase
      .from("profiles")
      .update({ discord_username: discordUsername, discord_user_id: discordUserId, has_discord_account: true } as any)
      .eq("user_id", user.id);

    if (error) {
      if (error.message?.includes("unique")) {
        throw new Error("This Discord account is already linked to another Tech Fleet profile.");
      }
      throw error;
    }

    await JourneyService.upsertTask(user.id, PHASE, TASK_ID, true);
    try { await assignCommunityRole(discordUserId); } catch { /* role sync retry queue/admin permissions are non-blocking */ }
    DiscordNotifyService.discordVerified(displayName, discordUsername, discordUserId);
    await refreshProfile();
    setRelinking(false);
    setCandidates([]);
    setVerifyError("");
    toast.success("Discord account verified and linked!", { duration: 5000, position: "top-center" });
  };

  const verifyUsername = async () => {
    const trimmed = username.trim();
    if (!trimmed) {
      setVerifyError("Please enter your Discord username or display name.");
      return;
    }

    const normalized = normalizeDiscordUsername(trimmed);
    setVerifying(true);
    setVerifyError("");
    setCandidates([]);

    try {
      const result = await DiscordNotifyService.resolveDiscordId(normalized);
      if (result.candidates?.length) {
        setCandidates(result.candidates);
      } else if (result.discord_user_id) {
        setVerifyError("Please select your Discord account from the search results before linking.");
      } else {
        setVerifyError(result.message || "We couldn't find that name in the Tech Fleet Discord server. Please make sure you've joined and that the username or display name is correct.");
      }
    } catch (err: any) {
      setVerifyError(err.message || "Discord verification is temporarily unavailable. Please try again in a minute.");
    } finally {
      setVerifying(false);
    }
  };

  const selectCandidate = async (candidate: Candidate) => {
    setConfirmingId(candidate.id);
    setVerifyError("");
    try {
      const confirmed = await DiscordNotifyService.confirmDiscordId(candidate.id);
      if (!confirmed?.discord_user_id) {
        throw new Error(DISCORD_MEMBER_NOT_VISIBLE_MESSAGE);
      }
      await finalizeLinking(confirmed.discord_user_id, confirmed.discord_username || candidate.username);
    } catch (err: any) {
      const message = err.message || "Verification failed. Please try again.";
      if (message === DISCORD_MEMBER_NOT_VISIBLE_MESSAGE) {
        clearStaleCandidate(candidate.id);
        setVerifyError(`${message} I removed that stale result so you can search again now.`);
        return;
      }
      setVerifyError(message);
    } finally {
      setConfirmingId(null);
    }
  };

  return (
    <section className="rounded-lg border border-border bg-card p-4 space-y-4" aria-labelledby="profile-discord-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10">
            <MessageSquare className="h-5 w-5 text-primary" aria-hidden="true" />
          </div>
          <div>
            <h3 id="profile-discord-heading" className="font-semibold text-foreground">Discord account</h3>
            <p className="text-sm text-muted-foreground">Connect your account through the verified Tech Fleet Discord flow.</p>
          </div>
        </div>
        {isLinked && (
          <Badge variant="outline" className="bg-success/10 text-success border-success/20">
            <CheckCircle2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            Verified
          </Badge>
        )}
      </div>

      {isLinked ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Connected as <strong className="text-foreground">@{profile?.discord_username}</strong>.
          </p>
          <Button type="button" variant="outline" size="sm" onClick={() => setRelinking(true)}>
            Re-link a different account
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {inviteUrl ? (
              <>
                <a href={inviteUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  Open Discord Invite
                </a>
                <Button type="button" variant="outline" size="sm" onClick={copyInvite} className="gap-2">
                  <Copy className="h-4 w-4" aria-hidden="true" />
                  {copied ? "Copied" : "Copy invite"}
                </Button>
              </>
            ) : (
              <Button type="button" variant="outline" size="sm" onClick={generateInvite} disabled={generating} className="gap-2">
                {generating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
                Get Discord invite
              </Button>
            )}
          </div>

          <DiscordUsernameTutorial />

          <div className="space-y-2">
            <Label htmlFor="profile-discord-username">Discord username or display name</Label>
            <Input
              id="profile-discord-username"
              value={username}
              onChange={(event) => { setUsername(event.target.value); setVerifyError(""); setCandidates([]); }}
              placeholder="e.g. johndoe or John D."
              disabled={verifying || !!confirmingId}
              aria-invalid={!!verifyError}
              aria-describedby={verifyError ? "profile-discord-error" : undefined}
            />
          </div>

          {verifyError && (
            <div id="profile-discord-error" className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive" role="alert">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{verifyError}</span>
            </div>
          )}

          {candidates.length > 0 && (
            <div className="space-y-2" role="list" aria-label="Matching Discord members">
              {candidates.map((candidate) => (
                <div key={candidate.id} role="listitem">
                  <button
                    type="button"
                    onClick={() => selectCandidate(candidate)}
                    disabled={!!confirmingId}
                    className="flex w-full items-center gap-3 rounded-lg border bg-background p-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                    aria-label={`Select ${candidate.global_name || candidate.nick || candidate.username}`}
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium text-muted-foreground">
                      {(candidate.global_name || candidate.username || "?").charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{candidate.global_name || candidate.username}</p>
                      <p className="truncate text-xs text-muted-foreground">@{candidate.username}{candidate.nick ? ` · ${candidate.nick}` : ""}</p>
                    </div>
                    {confirmingId === candidate.id ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={verifyUsername} disabled={verifying || !!confirmingId || !username.trim()} className="gap-2">
              {verifying ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
              {candidates.length > 0 ? "Search again" : "Verify Discord account"}
            </Button>
            {relinking && (
              <Button type="button" variant="ghost" onClick={() => { setRelinking(false); setVerifyError(""); setCandidates([]); }}>
                Cancel
              </Button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
