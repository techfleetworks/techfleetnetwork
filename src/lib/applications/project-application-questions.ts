/**
 * Single source of truth for WHICH project-application questions apply to a project.
 *
 * A project's `is_shipathon` flag (ADR-0055) removes two questions from the application flow:
 *   - Step 2: the "Did you participate in a previous phase of this project?" radio and its
 *     three follow-ups (position / learnings / help-teammates). The standalone
 *     "prior engagement preparation" question stays and becomes the sole Step-2 narrative.
 *   - Step 3: the "What do you know about the client and the project?" question.
 *
 * Render, validation, and the Step-4 review MUST all derive from the object this returns, so a
 * question that is not rendered can never be required — that lockstep is what makes it impossible
 * to lock an applicant out of submitting. There is no separate boolean to keep "in sync".
 *
 * Fail-safe by construction: the flag is read as `is_shipathon === true`, so a project row where
 * the column is absent/undefined (e.g. a projection or grant regression) resolves to the normal,
 * fully-reachable question set rather than silently hiding questions.
 */
export interface ProjectApplicationQuestions {
  /** Ask the previous-phase group (radio + position/learnings/help). */
  askPreviousPhase: boolean;
  /** Ask "what do you know about the client and the project?" */
  askClientKnowledge: boolean;
}

/** Only the fields this rule depends on — keep is_shipathon optional so callers surface undefined. */
export interface ProjectApplicationQuestionInput {
  is_shipathon?: boolean | null;
}

export function getProjectApplicationQuestions(
  project: ProjectApplicationQuestionInput
): ProjectApplicationQuestions {
  const isShipathon = project?.is_shipathon === true;
  return {
    askPreviousPhase: !isShipathon,
    askClientKnowledge: !isShipathon,
  };
}

/** Step-2 narrative values, named as the applicant page state. */
export interface ProjectStep2Values {
  teamHatsInterest: string[];
  participatedPrev: boolean;
  prevPosition: string;
  prevLearnings: string;
  prevHelpTeammates: string;
  priorPreparation: string;
}

/** Step-3 narrative values, named as the applicant page state. */
export interface ProjectStep3Values {
  passion: string;
  clientKnowledge: string;
  crossFunctional: string;
  successContribution: string;
}

/**
 * Required-field check for Step 2, driven by the question set.
 *
 * A field is required only when its input is rendered:
 *   - previous-phase group required only when the group is asked AND the applicant answered "yes";
 *   - otherwise the prior-engagement question is the required one — which is exactly when it is shown
 *     (Shipathon, or a non-Shipathon "no").
 * This preserves the existing non-Shipathon flow byte-for-byte and never requires a hidden field.
 */
export function validateProjectStep2(
  v: ProjectStep2Values,
  questions: ProjectApplicationQuestions
): Record<string, string> {
  const errs: Record<string, string> = {};
  if (v.teamHatsInterest.length === 0) errs.team_hats_interest = "Select at least one team hat";
  if (questions.askPreviousPhase && v.participatedPrev) {
    if (!v.prevPosition.trim()) errs.previous_phase_position = "Required";
    if (!v.prevLearnings.trim()) errs.previous_phase_learnings = "Required";
    if (!v.prevHelpTeammates.trim()) errs.previous_phase_help_teammates = "Required";
  } else {
    if (!v.priorPreparation.trim()) errs.prior_engagement_preparation = "Required";
  }
  return errs;
}

/**
 * Required-field check for Step 3, driven by the question set.
 * client-knowledge is required only when it is asked; the other three are always required.
 */
export function validateProjectStep3(
  v: ProjectStep3Values,
  questions: ProjectApplicationQuestions
): Record<string, string> {
  const errs: Record<string, string> = {};
  if (!v.passion.trim()) errs.passion_for_project = "Required";
  if (questions.askClientKnowledge && !v.clientKnowledge.trim()) {
    errs.client_project_knowledge = "Required";
  }
  if (!v.crossFunctional.trim()) errs.cross_functional_contribution = "Required";
  if (!v.successContribution.trim()) errs.project_success_contribution = "Required";
  return errs;
}
