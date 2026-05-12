# Tech Fleet — UX Copy Patterns

## Buttons / CTAs

- Verb + object: `Save draft`, `Submit application`, `Schedule interview`.
- Sentence case. No trailing punctuation.
- Disabled state needs a tooltip explaining how to unblock it.

## Form labels & helper text

- Labels: 1–3 words, sentence case, no colon.
- Helper text appears below the field, not as placeholder.
- Required fields use a visible `*` and `aria-required`.

## Error messages

Pattern: `[empathetic acknowledgment] + [plain reason] + [what to do next]`.

✅ "We couldn't find an account with that email. Check the spelling and try again."
🚫 "ERROR: invalid_credentials"
🚫 "Bad request."

## Success messages

Celebratory but proportional. Confirm what happened and what's next.

✅ "Draft saved — pick it up anytime from My Applications."
🚫 "✅✅ SUCCESS!!! 🎉🎉🎉"

## Empty states

Tell the person the next action.

✅ "No applications yet — browse open projects to get started."
🚫 "No data."

## Alt text

Describe content + purpose. Decorative images get `alt=""`.

## Link text

Describes destination. ✅ "Read the three-year strategy."  🚫 "Click here."
