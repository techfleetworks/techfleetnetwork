// Cucumber World for the executable BDD runner (ADR 20261110).
//
// Holds the per-scenario state the step definitions read and write: the input
// under test and the value the system-under-test returned. Each scenario gets a
// fresh instance (cucumber constructs one per scenario), so no state leaks
// between scenarios.
//
// Deliberately tiny and framework-only: no app imports here. The step
// definitions import the REAL shared modules (supabase/functions/_shared/*) so
// the scenarios execute production code, not a stand-in.
import { setWorldConstructor, World } from "@cucumber/cucumber";

export class TfnWorld extends World {
  /** The raw input a Given set up (HTML, chat text, …). */
  input = "";
  /** The value the last When produced from the system under test. */
  result: unknown = undefined;
}

setWorldConstructor(TfnWorld);

// Gherkin quotes in the feature files carry C-style escapes (\n, \") as LITERAL
// backslash sequences — the official parser does NOT unescape them. The step
// definitions decode them here so `"a\nb"` in a .feature becomes a real newline
// at execution, matching what the scenario author meant.
export function decodeGherkinEscapes(raw: string): string {
  return raw
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}
