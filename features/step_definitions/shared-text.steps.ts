// Step definitions for the two executable @security features whose behaviour is
// pure and runtime-agnostic, so they run as real Node-side BDD without Deno,
// Supabase, or network:
//   - supabase/functions/_shared/html-to-text.feature   (htmlToPlainText / stripActiveContent)
//   - supabase/functions/_shared/prompt-injection.feature (hasPromptInjection)
//
// These import the PRODUCTION shared modules directly, so the scenarios exercise
// the exact code the edge functions run — not a copy. Everything else in the
// feature set needs Deno/Supabase/live upstreams and is tracked @pending in
// features/bdd-index.json until wired; auth features are @auth-excluded (owned by
// the auth refactor).
import assert from "node:assert/strict";
import { Given, When, Then } from "@cucumber/cucumber";

import { htmlToPlainText, stripActiveContent } from "../../supabase/functions/_shared/html-to-text.ts";
import { hasPromptInjection } from "../../supabase/functions/_shared/prompt-injection.ts";
import { TfnWorld, decodeGherkinEscapes } from "../support/world.ts";

// ----- html-to-text ---------------------------------------------------------

Given(/^HTML "(.*)"$/, function (this: TfnWorld, raw: string) {
  this.input = decodeGherkinEscapes(raw);
});

Given(/^text "(.*)"$/, function (this: TfnWorld, raw: string) {
  this.input = decodeGherkinEscapes(raw);
});

When("it is passed through htmlToPlainText", function (this: TfnWorld) {
  this.result = htmlToPlainText(this.input);
});

When("it is passed through stripActiveContent", function (this: TfnWorld) {
  this.result = stripActiveContent(this.input);
});

function asText(result: unknown): string {
  assert.equal(typeof result, "string", "expected the system under test to return a string");
  return result as string;
}

Then(/^the result contains no "([^"]*)" substring$/, function (this: TfnWorld, needle: string) {
  const out = asText(this.result);
  assert.ok(!out.includes(decodeGherkinEscapes(needle)), `result must not contain "${needle}": got ${JSON.stringify(out)}`);
});

Then(/^the result contains no "([^"]*)" character$/, function (this: TfnWorld, needle: string) {
  const out = asText(this.result);
  assert.ok(!out.includes(decodeGherkinEscapes(needle)), `result must not contain "${needle}": got ${JSON.stringify(out)}`);
});

Then(/^the result contains no "([^"]*)" and no "([^"]*)"$/, function (this: TfnWorld, a: string, b: string) {
  const out = asText(this.result);
  assert.ok(!out.includes(decodeGherkinEscapes(a)), `result must not contain "${a}": got ${JSON.stringify(out)}`);
  assert.ok(!out.includes(decodeGherkinEscapes(b)), `result must not contain "${b}": got ${JSON.stringify(out)}`);
});

Then(/^the result contains "([^"]*)" and "([^"]*)"$/, function (this: TfnWorld, a: string, b: string) {
  const out = asText(this.result);
  assert.ok(out.includes(decodeGherkinEscapes(a)), `result must contain "${a}": got ${JSON.stringify(out)}`);
  assert.ok(out.includes(decodeGherkinEscapes(b)), `result must contain "${b}": got ${JSON.stringify(out)}`);
});

Then(/^the result contains "([^"]*)"$/, function (this: TfnWorld, needle: string) {
  const out = asText(this.result);
  assert.ok(out.includes(decodeGherkinEscapes(needle)), `result must contain "${needle}": got ${JSON.stringify(out)}`);
});

Then(/^the result does not contain "([^"]*)"$/, function (this: TfnWorld, needle: string) {
  const out = asText(this.result);
  assert.ok(!out.includes(decodeGherkinEscapes(needle)), `result must not contain "${needle}": got ${JSON.stringify(out)}`);
});

Then(/^the result is "([^"]*)"$/, function (this: TfnWorld, expected: string) {
  const out = asText(this.result);
  assert.equal(out, decodeGherkinEscapes(expected));
});

// ----- prompt-injection -----------------------------------------------------

Given(/^untrusted chat input "(.*)"$/, function (this: TfnWorld, raw: string) {
  this.input = decodeGherkinEscapes(raw);
});

When("techfleet-chat calls hasPromptInjection from the one owner", function (this: TfnWorld) {
  this.result = hasPromptInjection(this.input);
});

// Regex (not a Cucumber expression) so the literal "(no retrieval, no LLM call)" parentheses are
// matched as text, not parsed as an optional group.
Then(/^it returns true and the turn is refused with the boundary reply/, function (this: TfnWorld) {
  assert.equal(this.result, true, `expected hasPromptInjection(${JSON.stringify(this.input)}) === true`);
});

Then("it returns false and the turn proceeds normally", function (this: TfnWorld) {
  assert.equal(this.result, false, `expected hasPromptInjection(${JSON.stringify(this.input)}) === false`);
});

// Defensive non-string scenario: the detector must treat empty/null/undefined as
// "no match" and never throw. We exercise all three at the boundary.
Given("untrusted input that is empty, null, or undefined", function (this: TfnWorld) {
  this.input = "";
});

When("hasPromptInjection is called at the boundary", function (this: TfnWorld) {
  const inputs: unknown[] = ["", null, undefined];
  const results: boolean[] = [];
  for (const value of inputs) {
    // Cast: the contract is that a non-string is handled defensively, so we
    // deliberately pass non-strings a caller might forward from untrusted JSON.
    results.push(hasPromptInjection(value as string));
  }
  this.result = results;
});

Then("it returns false and never throws", function (this: TfnWorld) {
  assert.ok(Array.isArray(this.result), "expected the boundary call to collect a result per input");
  const results = this.result as boolean[];
  for (const r of results) {
    assert.equal(r, false, "every empty/null/undefined input must be classified as no-match (false)");
  }
});
