/**
 * Membership FAQ — single source of truth for the help entries shown
 * under the tier grid on the Membership tab. Keep entries short and
 * task-oriented (Heuristic #10: help and documentation).
 */

export interface FaqEntry {
  id: string;
  question: string;
  answer: string;
}

export const MEMBERSHIP_FAQ: FaqEntry[] = [
  {
    id: "checkout-price",
    question: "Why is my checkout price different from what's shown here?",
    answer:
      "Tech Fleet uses Purchasing Power Parity. If you're outside higher-cost regions, Gumroad detects your country at checkout and applies an automatic discount based on local cost of living. No coupon code is needed. The discount stacks with the Founding Member rate while that promo is active.",
  },
  {
    id: "founding-member-rate",
    question: "What does 'locked for life' mean for the Founding Member rate?",
    answer:
      "If you subscribe to the yearly Community plan before September 30, your $49.99/year rate stays the same for as long as you keep your subscription active. If your subscription lapses, the rate resets to standard pricing.",
  },
  {
    id: "switch-tier",
    question: "Can I switch tiers later?",
    answer:
      "Yes. You can switch any time from this Membership tab. Downgrades and cancellations are handled through the Gumroad email link from your original receipt.",
  },
];
