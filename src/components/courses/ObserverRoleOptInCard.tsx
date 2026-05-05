import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Loader2, Sparkles, Calendar, MessagesSquare, Bell, ExternalLink, AlertTriangle, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ProfileDiscordConnector } from "@/components/profile/ProfileDiscordConnector";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface OptInState {
  loading: boolean;
  granting: boolean;
  optedIn: boolean;
  projectsGranted: boolean;
  observersGranted: boolean;
  queuedForRetry: boolean;
  optedInAt: string | null;
  error: string | null;
}

interface Props {
  onCompleted?: () => void;
}

const DISCORD_GUILD_DEEP_LINK = "https://discord.com/channels/@me";

function NextSteps({ partial }: { partial: boolean }) {
  return (
    <div className="space-y-3" role="region" aria-label="What to do next">
      <p className="text-sm font-semibold text-foreground">What to do next</p>
      <div className="grid gap-3">
        <Card className="p-4 flex items-start gap-3 bg-background/40 border-border/60">
          <div className="rounded-full bg-emerald-500/15 p-2 shrink-0">
            <Calendar className="h-4 w-4 text-emerald-400" aria-hidden />
          </div>
          <div className="flex-1 space-y-2">
            <p className="text-sm font-medium">1. Pick a project meeting</p>
            <p className="text-xs text-muted-foreground">Browse upcoming Tech Fleet project meetings on the platform's Events Calendar.</p>
            <Button asChild size="sm" variant="secondary" className="h-8">
              <Link to="/events">Open Events Calendar</Link>
            </Button>
          </div>
        </Card>
        <Card className="p-4 flex items-start gap-3 bg-background/40 border-border/60">
          <div className="rounded-full bg-indigo-500/15 p-2 shrink-0">
            <MessagesSquare className="h-4 w-4 text-indigo-300" aria-hidden />
          </div>
          <div className="flex-1 space-y-2">
            <p className="text-sm font-medium">2. Explore project Discord channels</p>
            <p className="text-xs text-muted-foreground">Hop into Tech Fleet Discord and visit the project channels to see what each team is working on.</p>
            <Button asChild size="sm" variant="secondary" className="h-8">
              <a href={DISCORD_GUILD_DEEP_LINK} target="_blank" rel="noopener noreferrer">
                Open Discord <ExternalLink className="h-3 w-3 ml-1.5" />
              </a>
            </Button>
          </div>
        </Card>
        <Card className="p-4 flex items-start gap-3 bg-background/40 border-border/60">
          <div className="rounded-full bg-amber-500/15 p-2 shrink-0">
            <Bell className="h-4 w-4 text-amber-300" aria-hidden />
          </div>
          <div className="flex-1 space-y-1">
            <p className="text-sm font-medium">3. Watch for daily alerts</p>
            <p className="text-xs text-muted-foreground">
              New <code className="px-1 py-0.5 rounded bg-muted text-xs">#calling-all-observers</code> posts ping you each day with meetings to join.
            </p>
          </div>
        </Card>
      </div>
      <p className="text-xs text-muted-foreground pt-1">
        {partial
          ? "You can also grant the missing role manually in #observers-get-ready while we keep retrying."
          : "Then come back and post your reflections in #observer-reflections."}
      </p>
    </div>
  );
}

function Confetti({ active }: { active: boolean }) {
  const [pieces] = useState(() =>
    Array.from({ length: 24 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.4,
      duration: 1.6 + Math.random() * 1.2,
      color: ["#10b981", "#3b82f6", "#a855f7", "#f59e0b", "#ec4899"][i % 5],
    })),
  );
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (!active || reduced) return null;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {pieces.map((p) => (
        <span
          key={p.id}
          style={{
            left: `${p.left}%`,
            backgroundColor: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
          }}
          className="absolute -top-3 h-2 w-2 rounded-sm opacity-80 animate-[confetti-fall_2s_ease-in_forwards]"
        />
      ))}
      <style>{`@keyframes confetti-fall { to { transform: translateY(110%) rotate(540deg); opacity: 0; } }`}</style>
    </div>
  );
}

export function ObserverRoleOptInCard({ onCompleted }: Props) {
  const { user, profile } = useAuth();
  const [state, setState] = useState<OptInState>({
    loading: true,
    granting: false,
    optedIn: false,
    projectsGranted: false,
    observersGranted: false,
    queuedForRetry: false,
    optedInAt: null,
    error: null,
  });
  const successHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const justSucceededRef = useRef(false);
  const [successDialogOpen, setSuccessDialogOpen] = useState(false);

  const linked = !!(profile?.discord_user_id && profile.discord_user_id.trim().length > 0 && profile.has_discord_account);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    supabase
      .from("observer_role_optins")
      .select("opted_in_at, projects_role_granted_at, observers_role_granted_at, last_error")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setState((s) => ({
          ...s,
          loading: false,
          optedIn: !!data,
          projectsGranted: !!data?.projects_role_granted_at,
          observersGranted: !!data?.observers_role_granted_at,
          queuedForRetry: !!data && !(data.projects_role_granted_at && data.observers_role_granted_at),
          optedInAt: data?.opted_in_at ?? null,
          error: data?.last_error ?? null,
        }));
      });
    return () => { cancelled = true; };
  }, [user]);

  const fullSuccess = state.projectsGranted && state.observersGranted;
  const partialSuccess = state.optedIn && !fullSuccess && (state.projectsGranted || state.queuedForRetry);

  useEffect(() => {
    if (fullSuccess && justSucceededRef.current) {
      successHeadingRef.current?.focus();
    }
  }, [fullSuccess]);

  async function handleGrant() {
    setState((s) => ({ ...s, granting: true, error: null }));
    try {
      const { data, error } = await supabase.functions.invoke("grant-observer-role", {
        body: { confirm: true },
      });
      if (error) throw error;
      const projects = !!data?.projects_granted || !!data?.alreadyGranted;
      const observers = !!data?.observers_granted || !!data?.alreadyGranted;
      const ok = !!data?.ok && projects && observers;
      justSucceededRef.current = ok;
      setState((s) => ({
        ...s,
        granting: false,
        optedIn: true,
        projectsGranted: projects,
        observersGranted: observers,
        queuedForRetry: !!data?.queued_for_retry,
        error: data?.error ?? null,
      }));
      if (ok) {
        setSuccessDialogOpen(true);
        toast.success("Discord roles granted — you're ready to start observing.", {
          duration: 30000,
          position: "top-center",
        });
        onCompleted?.();
      } else if (data?.queued_for_retry) {
        toast.info("We saved your request. We'll finish granting on your next login.", {
          duration: 30000,
          position: "top-center",
        });
        onCompleted?.();
      } else {
        toast.error(data?.error || "Could not grant roles.", { duration: 30000, position: "top-center" });
      }
    } catch (e) {
      const msg = (e as Error).message || "Unexpected error";
      setState((s) => ({ ...s, granting: false, error: msg }));
      toast.error(msg, { duration: 30000, position: "top-center" });
    }
  }

  function handleSkip() {
    toast("Got it — no problem. You can grab the roles manually anytime.", { duration: 8000, position: "top-center" });
    onCompleted?.();
  }

  if (state.loading) {
    return (
      <Card className="p-6 border-border/60">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      </Card>
    );
  }

  // Success
  if (fullSuccess) {
    return (
      <>
        <Card
          role="status"
          className="relative overflow-hidden p-6 border-emerald-500/40 bg-gradient-to-br from-emerald-500/15 via-emerald-500/5 to-background"
        >
          <Confetti active={justSucceededRef.current} />
          <div className="relative space-y-5">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-emerald-500/20 p-2.5">
                <CheckCircle2 className="h-6 w-6 text-emerald-400" aria-hidden />
              </div>
              <div>
                <h3
                  ref={successHeadingRef}
                  tabIndex={-1}
                  className="text-xl font-bold text-foreground outline-none"
                >
                  You're an Observer! 🎉
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Both Discord roles are now active on your Tech Fleet profile.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30">
                <CheckCircle2 className="h-3 w-3 mr-1" /> Projects role granted
              </Badge>
              <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30">
                <CheckCircle2 className="h-3 w-3 mr-1" /> Observers role granted
              </Badge>
            </div>
            <NextSteps partial={false} />
            <Button variant="outline" size="sm" onClick={() => setSuccessDialogOpen(true)}>
              Show next steps again
            </Button>
          </div>
        </Card>
        <Dialog open={successDialogOpen} onOpenChange={setSuccessDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-400" aria-hidden />
                You're an Observer! 🎉
              </DialogTitle>
              <DialogDescription>
                Your Projects and Observers Discord roles are active. Here's what to do next.
              </DialogDescription>
            </DialogHeader>
            <NextSteps partial={false} />
            <DialogFooter>
              <Button onClick={() => setSuccessDialogOpen(false)}>Got it</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // Partial / queued
  if (partialSuccess) {
    return (
      <Card role="status" className="p-6 border-amber-500/40 bg-amber-500/5 space-y-5">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-amber-500/20 p-2.5">
            <AlertTriangle className="h-6 w-6 text-amber-400" aria-hidden />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Almost there — we'll keep trying</h3>
            <p className="text-sm text-muted-foreground mt-1">
              We saved your opt-in. Any role we couldn't grant yet will retry automatically on your next login.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className={state.projectsGranted ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" : "bg-amber-500/15 text-amber-300 border-amber-500/30"}>
            {state.projectsGranted ? "✓ Projects granted" : "⏳ Projects — retrying"}
          </Badge>
          <Badge variant="secondary" className={state.observersGranted ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" : "bg-amber-500/15 text-amber-300 border-amber-500/30"}>
            {state.observersGranted ? "✓ Observers granted" : "⏳ Observers — retrying"}
          </Badge>
        </div>
        <Button onClick={handleGrant} disabled={state.granting} variant="secondary">
          {state.granting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          Try again now
        </Button>
        <NextSteps partial />
      </Card>
    );
  }

  // Discord not linked
  if (!linked) {
    return (
      <Card className="p-6 border-border/60 space-y-4">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-indigo-500/15 p-2.5">
            <ShieldCheck className="h-5 w-5 text-indigo-300" aria-hidden />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Link your Discord first</h3>
            <p className="text-sm text-muted-foreground mt-1">
              We need to know which Discord account to grant the Projects and Observers roles to.
            </p>
          </div>
        </div>
        <ProfileDiscordConnector />
      </Card>
    );
  }

  // Ready to opt in
  return (
    <Card className="p-6 border-border/60 space-y-5">
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-emerald-500/15 p-2.5">
          <Sparkles className="h-5 w-5 text-emerald-400" aria-hidden />
        </div>
        <div>
          <h3 className="text-lg font-semibold">Want us to grant your Discord roles automatically?</h3>
          <p className="text-sm text-muted-foreground mt-1">
            We'll add the <strong className="text-foreground">Projects</strong> role and the <strong className="text-foreground">Observers</strong> role to your Tech Fleet Discord profile in one click.
          </p>
        </div>
      </div>
      <div aria-live="polite" className="sr-only">
        {state.granting ? "Granting Projects role, then Observers role." : ""}
      </div>
      <div className="flex flex-col sm:flex-row gap-3">
        <Button
          onClick={handleGrant}
          disabled={state.granting}
          className="bg-emerald-600 hover:bg-emerald-500 text-white"
        >
          {state.granting ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Granting roles…</>
          ) : (
            <>Grant me Projects + Observers roles</>
          )}
        </Button>
        <Button variant="ghost" onClick={handleSkip} disabled={state.granting}>
          Skip — I'll do it manually in Discord
        </Button>
      </div>
      {state.error && (
        <p className="text-xs text-red-400" role="alert">{state.error}</p>
      )}
    </Card>
  );
}

export default ObserverRoleOptInCard;
