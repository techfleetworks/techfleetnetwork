import { describe, it, expect } from "vitest";
import {
  getProjectApplicationQuestions,
  validateProjectStep2,
  validateProjectStep3,
  type ProjectStep2Values,
  type ProjectStep3Values,
} from "@/lib/applications/project-application-questions";

/**
 * These tests are the structural guarantee behind the Shipathon question toggle (ADR-0055):
 * because render, validation, and the review screen all consume getProjectApplicationQuestions(),
 * a question that is not asked can never be required — so a Shipathon applicant can always submit,
 * and the existing (non-Shipathon) flow is unchanged.
 */

const emptyStep2: ProjectStep2Values = {
  teamHatsInterest: ["Design"],
  participatedPrev: false,
  prevPosition: "",
  prevLearnings: "",
  prevHelpTeammates: "",
  priorPreparation: "",
};

const emptyStep3: ProjectStep3Values = {
  passion: "",
  clientKnowledge: "",
  crossFunctional: "",
  successContribution: "",
};

describe("getProjectApplicationQuestions", () => {
  it("asks every question for a normal (non-Shipathon) project", () => {
    expect(getProjectApplicationQuestions({ is_shipathon: false })).toEqual({
      askPreviousPhase: true,
      askClientKnowledge: true,
    });
  });

  it("drops the previous-phase group and client-knowledge for a Shipathon project", () => {
    expect(getProjectApplicationQuestions({ is_shipathon: true })).toEqual({
      askPreviousPhase: false,
      askClientKnowledge: false,
    });
  });

  it("fails safe to the full question set when the flag is missing/undefined/null", () => {
    // A projection or grant regression that drops the column must NOT silently hide questions.
    expect(getProjectApplicationQuestions({})).toEqual({
      askPreviousPhase: true,
      askClientKnowledge: true,
    });
    expect(getProjectApplicationQuestions({ is_shipathon: null })).toEqual({
      askPreviousPhase: true,
      askClientKnowledge: true,
    });
    // Any non-`true` value is treated as "not a Shipathon".
    expect(getProjectApplicationQuestions({ is_shipathon: undefined })).toEqual({
      askPreviousPhase: true,
      askClientKnowledge: true,
    });
  });
});

describe("validateProjectStep2", () => {
  const normal = getProjectApplicationQuestions({ is_shipathon: false });
  const shipathon = getProjectApplicationQuestions({ is_shipathon: true });

  it("always requires at least one team hat", () => {
    const errs = validateProjectStep2({ ...emptyStep2, teamHatsInterest: [] }, normal);
    expect(errs.team_hats_interest).toBeDefined();
  });

  it("non-Shipathon + 'Yes' requires the three previous-phase fields (unchanged behavior)", () => {
    const errs = validateProjectStep2({ ...emptyStep2, participatedPrev: true }, normal);
    expect(errs.previous_phase_position).toBe("Required");
    expect(errs.previous_phase_learnings).toBe("Required");
    expect(errs.previous_phase_help_teammates).toBe("Required");
    expect(errs.prior_engagement_preparation).toBeUndefined();
  });

  it("non-Shipathon + 'No' requires prior engagement (unchanged behavior)", () => {
    const errs = validateProjectStep2({ ...emptyStep2, participatedPrev: false }, normal);
    expect(errs.prior_engagement_preparation).toBe("Required");
    expect(errs.previous_phase_position).toBeUndefined();
  });

  it("Shipathon never requires the previous-phase fields — even with a stale participatedPrev=true", () => {
    // The lockout that this whole design exists to prevent: the previous-phase inputs are not
    // rendered for a Shipathon, so they must never be required, regardless of stale draft state.
    const errs = validateProjectStep2({ ...emptyStep2, participatedPrev: true }, shipathon);
    expect(errs.previous_phase_position).toBeUndefined();
    expect(errs.previous_phase_learnings).toBeUndefined();
    expect(errs.previous_phase_help_teammates).toBeUndefined();
    // Prior engagement is the one Step-2 narrative that a Shipathon still asks + requires.
    expect(errs.prior_engagement_preparation).toBe("Required");
  });

  it("Shipathon passes Step 2 with team hats + prior engagement filled, everything else empty", () => {
    const errs = validateProjectStep2(
      { ...emptyStep2, participatedPrev: true, priorPreparation: "I have prepared." },
      shipathon
    );
    expect(errs).toEqual({});
  });
});

describe("validateProjectStep3", () => {
  const normal = getProjectApplicationQuestions({ is_shipathon: false });
  const shipathon = getProjectApplicationQuestions({ is_shipathon: true });

  it("non-Shipathon requires client knowledge (unchanged behavior)", () => {
    const errs = validateProjectStep3(emptyStep3, normal);
    expect(errs.client_project_knowledge).toBe("Required");
  });

  it("Shipathon never requires client knowledge, but still requires the other three", () => {
    const errs = validateProjectStep3({ ...emptyStep3, clientKnowledge: "" }, shipathon);
    expect(errs.client_project_knowledge).toBeUndefined();
    expect(errs.passion_for_project).toBe("Required");
    expect(errs.cross_functional_contribution).toBe("Required");
    expect(errs.project_success_contribution).toBe("Required");
  });

  it("Shipathon passes Step 3 with client knowledge left empty", () => {
    const errs = validateProjectStep3(
      {
        passion: "Excited.",
        clientKnowledge: "",
        crossFunctional: "I collaborate.",
        successContribution: "I ship.",
      },
      shipathon
    );
    expect(errs).toEqual({});
  });
});
