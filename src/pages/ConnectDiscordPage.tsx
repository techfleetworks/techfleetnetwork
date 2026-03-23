import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  MessageSquare,
  ExternalLink,
  Copy,
  Check,
  Loader2,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { DiscordNotifyService } from "@/services/discord-notify.service";
import { JourneyService } from "@/services/journey.service";
import { useJourneyProgress } from "@/hooks/use-journey-progress";
import { useQueryClient } from "@/lib/react-query";
import { toast } from "sonner";

const TASK_ID = "connect-discord";
const PHASE = "first_steps" as const;

export const TOTAL_CONNECT_DISCORD = 1;
export const CONNECT_DISCORD_TASK_IDS = [TASK_ID] as const;

export default function ConnectDiscordPage() {
  const { user, profile, refreshProfile } = useAuth();
  const queryClient = useQueryClient();

  const { data: progress = [] } = useJourneyProgress(user?.id, PHASE);
  const isAlreadyComplete = progress.some(
    (p) => p.task_id === TASK_ID && p.completed
  );

  // Source of truth: profile has a discord_user_id OR journey task is complete
  const isLinked = !!(profile?.discord_user_id) || isAlreadyComplete;

  // Step state
  const [step, setStep] = useState<
    "ask" | "no-discord-choose" | "no-discord-no-account" | "no-discord-has-account" | "yes-discord"
  >("ask");

  // Invite flow state
  const [inviteUrl, setInviteUrl] = useState<string>(
    (profile as any)?.discord_invite_url || ""
  );
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  // Verify flow state
  const [username, setUsername] = useState(profile?.discord_username || "");
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [verifyError, setVerifyError] = useState("");

  // Sync verified state when profile/progress loads
  useEffect(() => {
    if (isLinked) {
      setVerified(true);
      setStep("yes-discord");
      if (profile?.discord_username) setUsername(profile.discord_username);
    }
  }, [isLinked, profile?.discord_username]);

  const displayName =
    profile?.display_name ||
    profile?.first_name ||
    user?.user_metadata?.full_name ||
    "A member";

  const generateInvite = async () => {
    setGenerating(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const res = await supabase.functions.invoke("generate-discord-invite", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (res.error)
        throw new Error(res.error.message || "Failed to generate invite");
      const url = res.data?.invite_url;
      if (!url) throw new Error("No invite URL returned");

      setInviteUrl(url);
      toast.success("Your personal Discord invite link is ready!");
    } catch (err: any) {
      toast.error(err.message || "Failed to generate invite link");
    } finally {
      setGenerating(false);
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("Invite link copied!");
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  const normalizeDiscordUsername = (raw: string): string => {
    let name = raw.trim();
    // Remove leading @ if present
    if (name.startsWith("@")) {
      name = name.slice(1);
    }
    // Ensure leading dot
    if (!name.startsWith(".")) {
      name = "." + name;
    }
    return name;
  };

  const handleVerify = async () => {
    const trimmed = username.trim();
    if (!trimmed) {
      setVerifyError("Please enter your Discord username.");
      return;
    }
    const normalized = normalizeDiscordUsername(trimmed);
    setVerifying(true);
    setVerifyError("");

    try {
      const discordUserId =
        await DiscordNotifyService.resolveDiscordId(normalized);

      if (!discordUserId) {
        setVerifyError(
          "We couldn't find that username in the Tech Fleet Discord server. Please make sure you've joined and that the username is correct."
        );
        setVerifying(false);
        return;
      }

      // Save discord info to profile
      await supabase
        .from("profiles")
        .update({
          discord_username: normalized,
          discord_user_id: discordUserId,
          has_discord_account: true,
        })
        .eq("user_id", user!.id);

      // Mark task as complete
      await JourneyService.upsertTask(user!.id, PHASE, TASK_ID, true);

      // Send Discord notification for verification
      DiscordNotifyService.discordVerified(
        displayName,
        normalized,
        discordUserId
      );

      // Invalidate queries
      queryClient.invalidateQueries({
        queryKey: ["journey-completed", user!.id, PHASE],
      });
      queryClient.invalidateQueries({
        queryKey: ["journey-progress", user!.id, PHASE],
      });

      // Refresh profile so EditProfilePage stays in sync
      await refreshProfile();

      setVerified(true);
      toast.success("Discord account verified and linked!");
    } catch (err: any) {
      setVerifyError(err.message || "Verification failed. Please try again.");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="container-app py-8 sm:py-12 max-w-2xl">
      <Breadcrumb className="mb-6">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/courses">Courses</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Connect to Discord</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center gap-3 mb-2">
        <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center">
          <MessageSquare className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Connect to Discord
          </h1>
          <p className="text-muted-foreground text-sm">
            Link your Discord account to the Tech Fleet Network.
          </p>
        </div>
        {verified && (
          <Badge
            variant="outline"
            className="ml-auto bg-success/10 text-success border-success/20"
          >
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
            Verified
          </Badge>
        )}
      </div>

      <div className="mt-8 space-y-6">
        {/* Already verified */}
        {verified && (
          <div className="rounded-lg border border-success/30 bg-success/5 p-6 text-center space-y-3">
            <CheckCircle2 className="h-12 w-12 text-success mx-auto" />
            <h2 className="text-lg font-semibold text-foreground">
              You're connected!
            </h2>
            <p className="text-sm text-muted-foreground">
              Your Discord account{" "}
              <strong className="text-foreground">
                @{profile?.discord_username || username}
              </strong>{" "}
              is linked to your Tech Fleet Network profile.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 mt-2"
              onClick={() => {
                setVerified(false);
                setUsername("");
                setVerifyError("");
                setStep("yes-discord");
              }}
            >
              <MessageSquare className="h-4 w-4" />
              Re-link a different account
            </Button>
          </div>
        )}

        {/* Step 1: Ask */}
        {!verified && step === "ask" && (
          <div className="rounded-lg border bg-card p-6 space-y-4">
            <h2 className="text-lg font-semibold text-foreground">
              Are you currently in the Tech Fleet Discord server?
            </h2>
            <p className="text-sm text-muted-foreground">
              Tech Fleet's community lives on Discord. We need to verify your
              membership to link your accounts.
            </p>
            <div className="flex gap-3">
              <Button onClick={() => setStep("yes-discord")} className="gap-2">
                <Check className="h-4 w-4" />
                Yes, I'm in Discord
              </Button>
              <Button
                variant="outline"
                onClick={() => setStep("no-discord-choose")}
                className="gap-2"
              >
                No, I need an invite
              </Button>
            </div>
          </div>
        )}

        {/* Step 1b: Choose whether they have a Discord account */}
        {!verified && step === "no-discord-choose" && (
          <div className="rounded-lg border bg-card p-6 space-y-4">
            <h2 className="text-lg font-semibold text-foreground">
              Do you already have a Discord account?
            </h2>
            <p className="text-sm text-muted-foreground">
              Discord is a free communication platform. If you don't have an account yet, we'll help you get set up.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button onClick={() => setStep("no-discord-has-account")} className="gap-2">
                <Check className="h-4 w-4" />
                Yes, I have Discord
              </Button>
              <Button
                variant="outline"
                onClick={() => setStep("no-discord-no-account")}
                className="gap-2"
              >
                No, I need to create one
              </Button>
            </div>
          </div>
        )}

        {/* Step 2a-i: No Discord account — setup guidance first */}
        {!verified && step === "no-discord-no-account" && (
          <div className="rounded-lg border bg-card p-6 space-y-5">
            <h2 className="text-lg font-semibold text-foreground">
              Set up Discord first
            </h2>
            <p className="text-sm text-muted-foreground">
              Discord is a free platform for text, voice, and video communication. Follow these steps to get started:
            </p>

            <ol className="list-decimal list-inside space-y-3 text-sm text-muted-foreground">
              <li>
                <strong className="text-foreground">Download Discord</strong> — Get the app for your device or use the web version.
                <div className="mt-2 flex flex-wrap gap-2">
                  <a
                    href="https://discord.com/download"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Download Discord
                  </a>
                  <a
                    href="https://discord.com/app"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Use in Browser
                  </a>
                </div>
              </li>
              <li>
                <strong className="text-foreground">Create your account</strong> — Pick a username and verify your email address.
              </li>
              <li>
                <strong className="text-foreground">Come back here</strong> — Once your Discord account is ready, generate your personal invite link below.
              </li>
            </ol>

            <div className="border-t border-border pt-4 space-y-3">
              <p className="text-sm font-medium text-foreground">Ready? Generate your invite link:</p>
              {inviteUrl ? (
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <a
                      href={inviteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Open Discord Invite
                    </a>
                    <Button variant="outline" size="sm" onClick={copyToClipboard} className="gap-2">
                      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {copied ? "Copied!" : "Copy Link"}
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    This is a single-use invite link valid for 7 days.
                  </p>
                  <Button
                    variant="secondary"
                    onClick={() => setStep("yes-discord")}
                    className="gap-2 mt-2"
                  >
                    I've joined — Verify my username
                  </Button>
                </div>
              ) : (
                <Button onClick={generateInvite} disabled={generating} className="gap-2">
                  {generating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Generating…
                    </>
                  ) : (
                    <>
                      <MessageSquare className="h-4 w-4" />
                      Get My Discord Invite
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Step 2a-ii: Has Discord account — just generate invite */}
        {!verified && step === "no-discord-has-account" && (
          <div className="rounded-lg border bg-card p-6 space-y-4">
            <h2 className="text-lg font-semibold text-foreground">
              Join Tech Fleet on Discord
            </h2>
            <p className="text-sm text-muted-foreground">
              Get your personal invite link to join the Tech Fleet Discord
              server. Once you've joined, come back here and verify your
              username.
            </p>

            {inviteUrl ? (
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row gap-2">
                  <a
                    href={inviteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Open Discord Invite
                  </a>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={copyToClipboard}
                    className="gap-2"
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    {copied ? "Copied!" : "Copy Link"}
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  This is a single-use invite link valid for 7 days.
                </p>
                <Button
                  variant="secondary"
                  onClick={() => setStep("yes-discord")}
                  className="gap-2 mt-2"
                >
                  I've joined — Verify my username
                </Button>
              </div>
            ) : (
              <Button
                onClick={generateInvite}
                disabled={generating}
                className="gap-2"
              >
                {generating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating…
                  </>
                ) : (
                  <>
                    <MessageSquare className="h-4 w-4" />
                    Get My Discord Invite
                  </>
                )}
              </Button>
            )}
          </div>
        )}

        {/* Step 2b: Yes Discord — verify username */}
        {!verified && step === "yes-discord" && (
          <div className="rounded-lg border bg-card p-6 space-y-4">
            <h2 className="text-lg font-semibold text-foreground">
              Verify your Discord account
            </h2>
            <p className="text-sm text-muted-foreground">
              Enter your Discord username and we'll verify you're in the Tech
              Fleet server using the Tech Fleet Network Activity Bot.
            </p>

            <div className="space-y-2">
              <Label htmlFor="discord-username">Discord Username</Label>
              <Input
                id="discord-username"
                placeholder="e.g. johndoe"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setVerifyError("");
                }}
                disabled={verifying}
                aria-describedby={
                  verifyError ? "discord-verify-error" : undefined
                }
                aria-invalid={!!verifyError}
              />
            </div>

            {verifyError && (
              <div
                id="discord-verify-error"
                className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 rounded-md p-3"
                role="alert"
              >
                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{verifyError}</span>
              </div>
            )}

            <div className="flex gap-3">
              <Button
                onClick={handleVerify}
                disabled={verifying || !username.trim()}
                className="gap-2"
              >
                {verifying ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Verifying…
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Verify
                  </>
                )}
              </Button>
              <Button
                variant="ghost"
                onClick={() => setStep("no-discord-choose")}
                disabled={verifying}
              >
                I need an invite instead
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
