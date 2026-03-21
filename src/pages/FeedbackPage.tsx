import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { usePageHeader } from "@/contexts/PageHeaderContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FEEDBACK_AREAS, FeedbackService } from "@/services/feedback.service";
import { toast } from "sonner";
import { Send, MessageSquarePlus } from "lucide-react";
import { useEffect } from "react";

export default function FeedbackPage() {
  const { user } = useAuth();
  const { setHeader } = usePageHeader();
  const [area, setArea] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { setHeader({ title: "Submit Feedback" }); return () => setHeader(null); }, [setHeader]);

  const canSubmit = area !== "" && message.trim().length >= 10;

  const handleSubmit = async () => {
    if (!user || !canSubmit) return;
    setSubmitting(true);
    const ok = await FeedbackService.submit(user.id, user.email ?? "", area, message.trim());
    setSubmitting(false);
    if (ok) {
      toast.success("Feedback submitted!", { description: "Thank you for helping us improve." });
      setArea("");
      setMessage("");
    } else {
      toast.error("Failed to submit feedback. Please try again.");
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <MessageSquarePlus className="h-5 w-5 text-primary" />
            <CardTitle>Share Your Feedback</CardTitle>
          </div>
          <CardDescription>
            Help us improve Tech Fleet Network. Select the area your feedback is about and share your thoughts.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="feedback-area" className="text-base font-semibold">
              System Area <span className="text-destructive">*</span>
            </Label>
            <Select value={area} onValueChange={setArea}>
              <SelectTrigger id="feedback-area">
                <SelectValue placeholder="Select the area of the platform" />
              </SelectTrigger>
              <SelectContent>
                {FEEDBACK_AREAS.map((a) => (
                  <SelectItem key={a} value={a}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="feedback-message" className="text-base font-semibold">
              Your Feedback <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="feedback-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Share your thoughts, suggestions, or report an issue…"
              className="min-h-[160px] resize-y"
              maxLength={5000}
            />
            <p className="text-xs text-muted-foreground text-right">
              {message.length} / 5,000
            </p>
            {message.length > 0 && message.trim().length < 10 && (
              <p className="text-sm text-destructive">Please write at least 10 characters.</p>
            )}
          </div>

          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="w-full"
          >
            <Send className="h-4 w-4 mr-2" />
            {submitting ? "Submitting…" : "Submit Feedback"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
