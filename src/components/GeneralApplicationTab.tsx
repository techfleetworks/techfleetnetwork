import { Loader2, ArrowLeft, ArrowRight, Save, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StepProgressBar } from "@/components/StepProgressBar";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { useGeneralApplication } from "@/hooks/use-general-application";
import {
  SECTION_TITLES,
  TOTAL_SECTIONS,
  getFieldErrors,
  getSectionHasInput,
} from "@/lib/validators/general-application";
import {
  SectionBasicInfo,
  SectionProfile,
  SectionEngagement,
  SectionAgile,
  SectionLeadership,
  SectionReview,
} from "@/components/general-application";

export function GeneralApplicationTab() {
  const {
    loading,
    form,
    section,
    saving,
    errors,
    sectionsTouched,
    showCelebration,
    isCompleted,
    formContainerRef,
    setSection,
    setErrors,
    setShowCelebration,
    updateField,
    handleSave,
    handleNext,
    handleBack,
    canSubmit,
    navigate,
  } = useGeneralApplication();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="relative">
      {/* ── Sticky Progress Bar ────────────────────────────── */}
      <div className="sticky top-0 z-20 border-b bg-background px-4 sm:px-6 py-3">
        <div className="max-w-4xl w-full mx-auto">
        <StepProgressBar
          steps={SECTION_TITLES.map((label, i) => {
            const s = i + 1;
            const fieldErrors = getFieldErrors(form, s);
            const isComplete = Object.keys(fieldErrors).length === 0;
            const hasAnyInput = getSectionHasInput(form, s);
            return {
              label,
              hasError: sectionsTouched.has(s) && !isComplete,
              status: isComplete && hasAnyInput ? "completed" as const : hasAnyInput ? "started" as const : "not_started" as const,
            };
          })}
          currentStep={section}
          onStepClick={(s) => { setErrors({}); setSection(s); }}
        />
        </div>
      </div>

      {/* ── Content ─────────────────────────────── */}
      <div ref={formContainerRef}>
        <div className="max-w-3xl w-full mx-auto px-4 sm:px-6 py-6">
          <div className="card-elevated p-6 space-y-6">
            {/* Error summary banner */}
            {Object.keys(errors).length > 0 && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 flex gap-3" role="alert" aria-live="assertive">
                <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" aria-hidden="true" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-destructive">
                    Please fix {Object.keys(errors).length} {Object.keys(errors).length === 1 ? "error" : "errors"} to continue
                  </p>
                  <ul className="text-sm text-destructive/90 list-disc list-inside space-y-0.5">
                    {Object.values(errors).map((msg, i) => (
                      <li key={i}>{msg}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            <div>
              <h2 className="text-lg font-semibold text-foreground">
                {section === TOTAL_SECTIONS
                  ? "Review Your Application"
                  : `Section ${section}: ${SECTION_TITLES[section - 1]}`}
              </h2>
              {section === 2 && (
                <p className="text-sm text-muted-foreground mt-1">
                  Here are some questions that are stored in your profile. Feel free to update them while you're filling out the general application.
                </p>
              )}
              {section === TOTAL_SECTIONS && (
                <p className="text-sm text-muted-foreground mt-1">
                  Review all your answers below. Click Edit on any section to make changes before submitting.
                </p>
              )}
            </div>

            {section === 1 && <SectionBasicInfo form={form} errors={errors} updateField={updateField} />}
            {section === 2 && <SectionProfile form={form} errors={errors} updateField={updateField} />}
            {section === 3 && <SectionEngagement form={form} errors={errors} updateField={updateField} />}
            {section === 4 && <SectionAgile form={form} errors={errors} updateField={updateField} />}
            {section === 5 && <SectionLeadership form={form} errors={errors} updateField={updateField} />}
            {section === TOTAL_SECTIONS && (
              <SectionReview
                form={form}
                onEditSection={(s) => { setErrors({}); setSection(s); }}
              />
            )}
          </div>
        </div>
      </div>

      {/* ── Sticky Footer CTAs ─────────────────────────────── */}
      <div className="sticky bottom-0 z-20 border-t bg-background px-4 sm:px-6 py-3">
        <div className="max-w-3xl w-full mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            {section > 1 && (
              <Button variant="outline" onClick={handleBack}>
                <ArrowLeft className="h-4 w-4 mr-2" /> Previous
              </Button>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={() => handleSave(false)} disabled={saving}>
              <Save className="h-4 w-4 mr-2" />
              {saving ? "Saving…" : isCompleted ? "Save Changes" : "Save Draft"}
            </Button>
            {section < TOTAL_SECTIONS ? (
              <Button onClick={handleNext} disabled={saving}>
                Next <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            ) : (
              <Button onClick={() => handleSave(true)} disabled={saving || !canSubmit()}>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                {saving ? "Submitting…" : isCompleted ? "Update Application" : "Submit Application"}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* 🎉 Celebration dialog on first completion */}
      <Dialog open={showCelebration} onOpenChange={setShowCelebration}>
        <DialogContent className="sm:max-w-md text-center">
          <DialogHeader className="items-center">
            <div className="text-5xl mb-2">🎉</div>
            <DialogTitle className="text-xl">
              General Application Submitted!
            </DialogTitle>
            <DialogDescription className="text-muted-foreground pt-2">
              Congratulations! Your general application has been submitted successfully.
              You can update it anytime from the Applications page.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 pt-2">
            <Button onClick={() => { setShowCelebration(false); navigate("/applications"); }}>
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Back to Applications
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
