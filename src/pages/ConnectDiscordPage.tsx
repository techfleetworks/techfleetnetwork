import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  MessageSquare,
  ExternalLink,
  Copy,
  Check,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import DiscordUsernameTutorial from "@/components/DiscordUsernameTutorial";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
const COMMUNITY_ROLE_ID = "1083439364975112293";

export const TOTAL_CONNECT_DISCORD = 1;
export const CONNECT_DISCORD_TASK_IDS = [TASK_ID] as const;

export default function ConnectDiscordPage() {
  const { user, profile, profileLoaded, refreshProfile } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [showCompletionDialog, setShowCompletionDialog] = useState(false);
  const completionShownRef = useRef(false);

  const { data: progress, isLoading: progressLoading } = useJourneyProgress(user?.id, PHASE);
  const isAlreadyComplete = (progress ?? []).some(
    (p) => p.task_id === TASK_ID && p.completed
  );

  // Source of truth: profile has a discord_user_id OR journey task is complete
  const isLinked = !!(profile?.discord_user_id) || isAlreadyComplete;

  // Whether initial data is ready — prevent flash of incorrect state
  const dataReady = profileLoaded && !progressLoading;

  // Step state — initialise based on profile data once ready
  const [step, setStep] = useState<
    "ask" | "no-discord-choose" | "no-discord-no-account" | "no-discord-has-account" | "yes-discord"
  >("ask");

  // Invite flow state
  const [inviteUrl, setInviteUrl] = useState<string>("");
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  // Verify flow state
  const [username, setUsername] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [verifyError, setVerifyError] = useState("");
  const [candidates, setCandidates] = useState<Array<{
    id: string;
    username: string;
    global_name: string | null;
    nick: string | null;
    avatar: string | null;
  }>>([]);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  // Track whether we've done the initial sync from DB state
  const initialSyncDone = useRef(false);

  // Sync verified state ONCE when profile/progress first loads — not on every re-render.
  // Never load a stored invite URL — invites are single-use and ephemeral.
  useEffect(() => {
    if (!dataReady || initialSyncDone.current) return;
    initialSyncDone.current = true;

    if (profile?.discord_username) setUsername(profile.discord_username);

    if (isLinked) {
      setVerified(true);
      setStep("yes-discord");
    }
  }, [dataReady, isLinked, profile?.discord_username]);

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
    if (name.startsWith("@")) {
      name = name.slice(1);
    }
    if (!name.startsWith(".")) {
      name = "." + name;
    }
    return name;
  };

  const assignCommunityRole = async (discordUserId: string) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) throw new Error("Not authenticated");

    const res = await supabase.functions.invoke("manage-discord-roles", {
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: {
        action: "assign",
        discord_user_id: discordUserId,
        role_id: COMMUNITY_ROLE_ID,
      },
    });

    if (res.error) {
      throw new Error(res.error.message || "Failed to assign the Community role");
    }
  };

  /** Download a Discord avatar and upload it to the avatars bucket */
  const saveDiscordAvatar = async (discordAvatarUrl: string, userId: string): Promise<string | null> => {
    try {
      // Only set avatar if user doesn't already have one
      const { data: currentProfile } = await supabase
        .from("profiles")
        .select("avatar_url")
        .eq("user_id", userId)
        .single();

      if (currentProfile?.avatar_url) {
        return null; // User already has an avatar, don't overwrite
      }

      const response = await fetch(discordAvatarUrl);
      if (!response.ok) return null;

      const blob = await response.blob();
      const path = `${userId}/avatar.png`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, blob, { upsert: true, contentType: "image/png" });

      if (uploadError) {
        console.warn("[ConnectDiscord] Avatar upload failed:", uploadError.message);
        return null;
      }

      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl } as any)
        .eq("user_id", userId);

      return publicUrl;
    } catch (err) {
      console.warn("[ConnectDiscord] Avatar save failed:", err);
      return null;
    }
  };

  /** Complete linking once we have a confirmed Discord user ID */
  const finalizeLinking = async (discordUserId: string, discordUsername: string, avatarUrl?: string | null) => {
    // Check if this Discord account is already linked to another user
    const { data: existing } = await supabase
      .from("profiles")
      .select("display_name, user_id")
      .eq("discord_user_id", discordUserId)
      .neq("user_id", user!.id)
      .limit(1);

    if (existing && existing.length > 0) {
      const ownerName = existing[0].display_name || "another member";
      throw new Error(
        `This Discord account is already linked to ${ownerName}. Each Discord account can only be connected to one Tech Fleet profile. If you believe this is an error, please contact an admin.`
      );
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        discord_username: discordUsername,
        discord_user_id: discordUserId,
        has_discord_account: true,
      })
      .eq("user_id", user!.id);

    if (updateError) {
      if (updateError.message?.includes("idx_profiles_discord_user_id_unique") || updateError.message?.includes("unique")) {
        throw new Error(
          "This Discord account is already linked to another Tech Fleet profile. Each Discord account can only be connected to one profile. If you believe this is an error, please contact an admin."
        );
      }
      throw updateError;
    }

    // Save Discord avatar if available and user doesn't have one yet
    if (avatarUrl) {
      saveDiscordAvatar(avatarUrl, user!.id); // fire-and-forget, don't block linking
    }

    await JourneyService.upsertTask(user!.id, PHASE, TASK_ID, true);

    let communityRoleAssigned = false;
    try {
      await assignCommunityRole(discordUserId);
      communityRoleAssigned = true;
    } catch {
      communityRoleAssigned = false;
    }

    DiscordNotifyService.discordVerified(displayName, discordUsername, discordUserId);

    queryClient.invalidateQueries({ queryKey: ["journey-completed", user!.id, PHASE] });
    queryClient.invalidateQueries({ queryKey: ["journey-progress", user!.id, PHASE] });

    await refreshProfile();

    setVerified(true);
    setCandidates([]);
    if (communityRoleAssigned) {
      toast.success("Discord account verified, linked, and added to Community!");
    } else {
      toast.success("Discord account verified and linked!", {
        description:
          "Invite generation now works without role-assignment permissions. If the Community role does not appear in Discord, an admin only needs to check Fleety's role permissions and hierarchy once.",
      });
    }
    if (!completionShownRef.current) {
      completionShownRef.current = true;
      setShowCompletionDialog(true);
    }
  };

  const handleVerify = async () => {
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
      console.log("[ConnectDiscord] resolveDiscordId result:", JSON.stringify(result));

      if (result.candidates && result.candidates.length > 0) {
        // Always require explicit member selection before linking — even exact matches.
        setCandidates(result.candidates);
        setVerifyError("");
      } else if (result.discord_user_id) {
        setVerifyError("Please select your Discord account from the search results before linking.");
      } else {
        setVerifyError(
          result.message ||
            "We couldn't find that name in the Tech Fleet Discord server. Please make sure you've joined and that the username or display name is correct."
        );
      }
    } catch (err: any) {
      setVerifyError(err.message || "Verification failed. Please try again.");
    } finally {
      setVerifying(false);
    }
  };

  const handleCandidateSelect = async (candidate: {
    id: string;
    username: string;
    global_name: string | null;
    avatar?: string | null;
  }) => {
    setConfirmingId(candidate.id);
    setVerifyError("");
    try {
      const confirmed = await DiscordNotifyService.confirmDiscordId(candidate.id);
      if (!confirmed?.discord_user_id) {
        throw new Error("That Discord account is no longer visible in the Tech Fleet server. Please join the server, then search again.");
      }
      await finalizeLinking(
        confirmed.discord_user_id,
        confirmed.discord_username || candidate.username,
        candidate.avatar
      );
    } catch (err: any) {
      setVerifyError(err.message || "Verification failed. Please try again.");
    } finally {
      setConfirmingId(null);
    }
  };

  // Show loading until profile and journey progress are ready
  if (!dataReady) {
    return (
      <div className="container-app py-8 sm:py-12 max-w-2xl flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

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

            {inviteUrl ? (
              <div className="flex flex-wrap justify-center gap-2 pt-2">
                <a
                  href={inviteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex shrink-0 items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  <ExternalLink className="h-4 w-4" />
                  Open Discord Invite
                </a>
                <Button variant="outline" size="sm" onClick={copyToClipboard} className="shrink-0 gap-2">
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copied!" : "Copy Link"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={generateInvite}
                  disabled={generating}
                  className="shrink-0 gap-2"
                >
                  {generating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  I need another link
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={generateInvite}
                disabled={generating}
                className="gap-2 mt-1"
              >
                {generating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating…
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4" />
                    Generate a new invite link
                  </>
                )}
              </Button>
            )}
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
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={inviteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex shrink-0 items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Open Discord Invite
                    </a>
                    <Button variant="outline" size="sm" onClick={copyToClipboard} className="shrink-0 gap-2">
                      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {copied ? "Copied!" : "Copy Link"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={generateInvite}
                      disabled={generating}
                      className="shrink-0 gap-2"
                    >
                      {generating ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
                      I need another link
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
                <div className="flex flex-wrap gap-2">
                  <a
                    href={inviteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex shrink-0 items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Open Discord Invite
                  </a>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={copyToClipboard}
                    className="shrink-0 gap-2"
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    {copied ? "Copied!" : "Copy Link"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={generateInvite}
                    disabled={generating}
                    className="shrink-0 gap-2"
                  >
                    {generating ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                    I need another link
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
              Enter your Discord username or display name and we'll find you in the Tech
              Fleet server.
            </p>

            {/* Tutorial: How to find your username */}
            <DiscordUsernameTutorial />

            <div className="space-y-2">
              <Label htmlFor="discord-username">Discord Username or Display Name</Label>
              <Input
                id="discord-username"
                placeholder="e.g. johndoe or John D."
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setVerifyError("");
                  setCandidates([]);
                }}
                disabled={verifying || !!confirmingId}
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

            {/* Candidate picker — shown when no exact match but similar members found */}
            {candidates.length > 0 && (
              <div className="space-y-3">
                <p className="text-sm font-medium text-foreground">
                  We found similar members — is one of these you?
                </p>
                <div className="space-y-2" role="list" aria-label="Matching Discord members">
                  {candidates.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => handleCandidateSelect(c)}
                      disabled={!!confirmingId}
                      className="w-full flex items-center gap-3 rounded-lg border bg-background p-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                      role="listitem"
                      aria-label={`Select ${c.global_name || c.nick || c.username}`}
                    >
                      {c.avatar ? (
                        <img
                          src={c.avatar}
                          alt=""
                          className="h-10 w-10 rounded-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground text-sm font-medium">
                          {(c.global_name || c.username || "?").charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {c.global_name || c.username}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          @{c.username}
                          {c.nick && c.nick !== c.global_name ? ` · ${c.nick}` : ""}
                        </p>
                      </div>
                      {confirmingId === c.id ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground flex-shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  None of these? Try searching with your exact Discord username (Settings → My Account).
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <Button
                onClick={handleVerify}
                disabled={verifying || !!confirmingId || !username.trim()}
                className="gap-2"
              >
                {verifying ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Searching…
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    {candidates.length > 0 ? "Search Again" : "Verify"}
                  </>
                )}
              </Button>
              <Button
                variant="ghost"
                onClick={() => setStep("no-discord-choose")}
                disabled={verifying || !!confirmingId}
              >
                I need an invite instead
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Completion dialog */}
      <Dialog open={showCompletionDialog} onOpenChange={setShowCompletionDialog}>
        <DialogContent className="sm:max-w-md text-center">
          <DialogHeader className="items-center">
            <div className="text-5xl mb-2">🎉</div>
            <DialogTitle className="text-xl">
              Connect to Discord Complete!
            </DialogTitle>
            <DialogDescription className="text-muted-foreground pt-2">
              You've successfully connected your Discord account. You're ready for the next step!
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 pt-2">
            <Button onClick={() => { setShowCompletionDialog(false); navigate("/courses/onboarding"); }}>
              Continue to Onboarding Steps
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
            <Button variant="outline" onClick={() => setShowCompletionDialog(false)}>
              Stay on This Page
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
