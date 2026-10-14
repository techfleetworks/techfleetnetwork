import type { ComponentType } from "react";
import { WelcomeStep } from "./steps/WelcomeStep";
import { WhyItsHelpfulStep } from "./steps/WhyItsHelpfulStep";
import { StayUpdatedStep } from "./steps/StayUpdatedStep";
import { ProfileStep } from "./steps/ProfileStep";
import { StartStep } from "./steps/StartStep";
import { WELCOME_NAV } from "./content";

/**
 * The ordered Welcome Flow step registry — the SINGLE SOURCE OF TRUTH for which screens
 * exist and in what order. The shell derives the progress-dot count and the active step
 * from this array (never a hardcoded count), so later PRs add a screen by appending one
 * entry here. Designed final order (§4.2 FR-N1): Welcome -> Why it's helpful -> Newsletter
 * -> Profile -> Start. PR2 ships the first two; e/f/g arrive in later PRs.
 */
export interface WelcomeStepDef {
  /** Stable id (the PDF/Figma step letter) — used in tests and telemetry, never copy. */
  id: "a" | "c" | "e" | "f" | "g";
  /** Short title for the step-progress live-region announcement (§12.3). */
  title: string;
  /** The presentational step component (content only; the shell owns navigation). */
  Component: ComponentType;
  /** Optional label override for the forward button (defaults to "Next"). */
  nextLabel?: string;
}

export const WELCOME_STEPS: readonly WelcomeStepDef[] = [
  {
    id: "a",
    title: "Welcome",
    Component: WelcomeStep,
    nextLabel: "Get started",
  },
  {
    id: "c",
    title: "Why it's helpful",
    Component: WhyItsHelpfulStep,
    nextLabel: WELCOME_NAV.next,
  },
  {
    id: "e",
    title: "Stay updated",
    Component: StayUpdatedStep,
    nextLabel: WELCOME_NAV.next,
  },
  {
    id: "f",
    title: "Your profile",
    Component: ProfileStep,
    nextLabel: WELCOME_NAV.next,
  },
  {
    id: "g",
    title: "Start",
    Component: StartStep,
  },
];
