import { useState, useCallback } from "react";
import { WelcomeFlowShell } from "@/components/welcome/WelcomeFlowShell";
import { WELCOME_STEPS } from "@/components/welcome/steps";
import { nextStep, prevStep } from "@/components/welcome/navigation";

/**
 * The mandatory, un-skippable Welcome Flow, routed at /welcome (§4.2 FR-N1). In PR2 it is
 * reachable only by direct navigation — it is NOT yet behind the route gate (that is PR5,
 * the launch) and nothing links to it. It replaces the legacy WelcomeWizard at this route;
 * the legacy component/dialog are retired in a later PR.
 *
 * Step position is held in React state (not localStorage — that was the retired
 * WelcomeDialog mistake). The authoritative "done forever" signal is the server
 * welcome_flow_completed_at column, written once by ProfileService.markWelcomeFlowComplete
 * on the final step (wired when the finish step lands).
 */
export default function WelcomePage() {
  const [step, setStep] = useState(0);

  const onNext = useCallback(
    () => setStep((s) => nextStep(s, WELCOME_STEPS.length)),
    [],
  );
  const onBack = useCallback(
    () => setStep((s) => prevStep(s, WELCOME_STEPS.length)),
    [],
  );

  return (
    <WelcomeFlowShell steps={WELCOME_STEPS} step={step} onNext={onNext} onBack={onBack} />
  );
}
