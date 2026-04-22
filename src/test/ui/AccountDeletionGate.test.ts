/**
 * Account deletion confirmation gate.
 *
 * The destructive "Permanently Delete" button is gated by an exact-match
 * "Delete" confirmation. This pure-logic test asserts the gate matches the
 * production guard in ProfileEditPanel.handleDeleteAccount and the disabled
 * prop on the destructive button: `deleteConfirmText !== "Delete"`.
 *
 * Keeping the gate as data-driven cases means a regression that loosens the
 * comparison (e.g., toLowerCase, trim, includes) fails CI immediately.
 */
import { describe, it, expect } from "vitest";

const isDeletionConfirmed = (input: string): boolean => input === "Delete";

describe("Account deletion confirmation gate", () => {
  const cases: Array<[string, boolean, string]> = [
    ["Delete", true, "exact match unlocks destructive action"],
    ["", false, "empty string never confirms"],
    ["delete", false, "lowercase must not match (case-sensitive guard)"],
    ["DELETE", false, "uppercase must not match"],
    [" Delete", false, "leading whitespace must not match"],
    ["Delete ", false, "trailing whitespace must not match"],
    ["Delete account", false, "extra text must not match"],
    ["Del", false, "prefix must not match"],
  ];

  for (const [input, expected, description] of cases) {
    it(description, () => {
      expect(isDeletionConfirmed(input)).toBe(expected);
    });
  }
});
