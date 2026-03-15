import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ExternalLink } from "lucide-react";

interface CommunityAgreementPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAccepted: () => void;
  loading?: boolean;
}

export function CommunityAgreementPanel({ open, onOpenChange, onAccepted, loading }: CommunityAgreementPanelProps) {
  const [agreed, setAgreed] = useState(false);

  const handleAccept = () => {
    if (!agreed) return;
    onAccepted();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl flex flex-col p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b">
          <SheetTitle className="text-xl">Community Collective Agreement</SheetTitle>
          <SheetDescription>
            Please read the full agreement below and confirm your acceptance.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 px-6 py-4">
          <div className="prose prose-sm dark:prose-invert max-w-none space-y-6">
            <h2 className="text-lg font-bold text-foreground">Tech Fleet Collective Agreement</h2>
            <p className="text-muted-foreground">
              As members of Tech Fleet, we commit to uphold this covenant and to refine it as needed.
              Together, we can cultivate a community that empowers each individual to realize their fullest
              potential and thrive in alignment with Tech Fleet's mission.
            </p>

            <h3 className="text-base font-semibold text-foreground">In Summary</h3>
            <ol className="list-decimal pl-5 space-y-3 text-sm text-foreground">
              <li>
                We all share responsibility to support our{" "}
                <a href="https://guide.techfleet.org/policies/community-collective-agreement/community-core-values" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                  core values
                </a>{" "}
                and to moderate activities which hurt or endanger our community.
              </li>
              <li>
                We authorize our representatives to safeguard our community by removing persons and prohibited
                content from Tech Fleet channels, but only according to our{" "}
                <a href="https://guide.techfleet.org/policies/community-collective-agreement/prohibited-activity-in-tech-fleet" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                  prohibited activity
                </a>{" "}
                and{" "}
                <a href="https://guide.techfleet.org/policies/community-collective-agreement/community-enforcement" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                  enforcement
                </a>{" "}
                rules.
              </li>
              <li>
                We must work together to effectively distinguish between our positive social guidelines and
                the aforementioned rules which we must rarely, but consistently, enforce.
              </li>
              <li>
                If you're intensely concerned about any behaviors in our community, please consult this
                Collective Agreement, and go straight to{" "}
                <a href="https://guide.techfleet.org/policies/community-collective-agreement/reporting-and-resolving-issues" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                  Reporting Issues
                </a>{" "}
                if needed.
              </li>
              <li>
                To be considered as a member of Tech Fleet, you must agree to our{" "}
                <a href="https://guide.techfleet.org/policies/community-collective-agreement/community-core-values/tech-fleet-pledge-of-purpose" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                  Pledge of Purpose
                </a>{" "}
                and{" "}
                <a href="https://guide.techfleet.org/policies/community-collective-agreement/community-core-values/tech-fleet-pledge-of-community" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                  Pledge of Community
                </a>.
              </li>
            </ol>

            <h3 className="text-base font-semibold text-foreground mt-6">The Collective Agreement</h3>
            <p className="text-sm text-muted-foreground">
              Read these pages to learn more about our collective agreement as Tech Fleet community members:
            </p>

            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-semibold text-foreground mb-2">Community Core Values</h4>
                <ul className="space-y-1.5 text-sm">
                  <li><a href="https://guide.techfleet.org/policies/community-collective-agreement/community-core-values/tech-fleets-mission-and-values" target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-1">🫴 Tech Fleet's Mission and Values <ExternalLink className="h-3 w-3" /></a></li>
                  <li><a href="https://guide.techfleet.org/policies/community-collective-agreement/community-core-values/tech-fleet-members-rights" target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-1">🤝 Tech Fleet Members' Rights <ExternalLink className="h-3 w-3" /></a></li>
                  <li><a href="https://guide.techfleet.org/policies/community-collective-agreement/community-core-values/tech-fleet-pledge-of-purpose" target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-1">❤️ Tech Fleet Pledge of Purpose <ExternalLink className="h-3 w-3" /></a></li>
                  <li><a href="https://guide.techfleet.org/policies/community-collective-agreement/community-core-values/tech-fleet-pledge-of-community" target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-1">🫂 Tech Fleet Pledge of Community <ExternalLink className="h-3 w-3" /></a></li>
                </ul>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-foreground mb-2">Community Operations</h4>
                <ul className="space-y-1.5 text-sm">
                  <li><a href="https://guide.techfleet.org/policies/community-collective-agreement/prohibited-activity-in-tech-fleet" target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-1">❌ Prohibited Activity in Tech Fleet <ExternalLink className="h-3 w-3" /></a></li>
                  <li><a href="https://guide.techfleet.org/policies/community-collective-agreement/reporting-and-resolving-issues" target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-1">📣 Reporting and Resolving Issues <ExternalLink className="h-3 w-3" /></a></li>
                  <li><a href="https://guide.techfleet.org/policies/community-collective-agreement/community-enforcement" target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-1">🙅‍♀️ Community Enforcement <ExternalLink className="h-3 w-3" /></a></li>
                  <li><a href="https://guide.techfleet.org/policies/community-collective-agreement/transforming-tension-and-conflict" target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-1">🌐 Transforming Tension & Conflict <ExternalLink className="h-3 w-3" /></a></li>
                </ul>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-foreground mb-2">Community Policies</h4>
                <ul className="space-y-1.5 text-sm">
                  <li><a href="https://guide.techfleet.org/community-code-of-conduct/code-of-conduct-and-anti-harassment-policy" target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-1">💟 Code of Conduct and Anti-Harassment Policy <ExternalLink className="h-3 w-3" /></a></li>
                  <li><a href="https://guide.techfleet.org/policies/tech-fleets-policies/slack-and-discord-policy" target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-1">🖱️ Slack and Discord Policy <ExternalLink className="h-3 w-3" /></a></li>
                  <li><a href="https://guide.techfleet.org/policies/tech-fleets-policies/conflict-of-interest-policy" target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-1">👁️‍🗨️ Conflict of Interest Policy <ExternalLink className="h-3 w-3" /></a></li>
                  <li><a href="https://guide.techfleet.org/policies/tech-fleets-policies/legal-disclaimers" target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-1">💼 Legal Disclaimers <ExternalLink className="h-3 w-3" /></a></li>
                </ul>
              </div>
            </div>
          </div>
        </ScrollArea>

        <div className="border-t px-6 py-4 space-y-4">
          <div className="flex items-start gap-3">
            <Checkbox
              id="agree-community"
              checked={agreed}
              onCheckedChange={(checked) => setAgreed(checked === true)}
              className="mt-0.5"
            />
            <label htmlFor="agree-community" className="text-sm text-foreground leading-snug cursor-pointer">
              I have read and agree to the Tech Fleet Community Collective Agreement, including the Pledge of Purpose and Pledge of Community.
            </label>
          </div>
          <Button
            onClick={handleAccept}
            disabled={!agreed || loading}
            className="w-full"
          >
            {loading ? "Saving…" : "Accept Agreement"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
