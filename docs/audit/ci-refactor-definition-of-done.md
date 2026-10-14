# CI refactor: the definition of done

This is the bar the CI refactor must clear before anyone calls it "done." It exists because a gate that
cannot fail is worse than no gate: it shows green and tells you that you are safe when nothing was
checked. The whole program is an argument that a check is only trustworthy if it has been **proven** it
can still fail. This document states, honestly, what that proof is and is not.

## The honest ceiling, stated first

You **cannot** prove that a pattern-based gate has zero false positives and zero false negatives over
every possible input. That is equivalent to fully, formally verifying an arbitrary program, which is
undecidable in the general case. Any claim of "mathematically impossible to ever misfire, forever" is
false, and if this document made that claim you should distrust the entire release.

So this bar does not promise perfection over all inputs. It promises something weaker, true, and strong
enough to be worth having: **every gate is proven to detect the cases it is specified to detect, it is
structurally impossible to ship a gate without that proof, and every real-world miss becomes a permanent
test so the error surface only ever shrinks.**

## The four conditions of "done"

A gate is done when all four hold. The program is done when every gate is done and the meta-gates that
enforce these conditions are themselves green and proven.

### 1. Paired fixtures: a known-bad AND a known-good case

Every gate ships a discrimination test with **both** directions, not one:

- a **known-bad** fixture (an input that violates the rule) and an assertion that the gate **exits
  non-zero** on it. This proves the gate has no false negative *on that case*.
- a **known-good** fixture (an input that is clean but close to the line) and an assertion that the gate
  **exits zero** on it. This proves the gate has no false positive *on that case*.

A gate that only proves it catches the bad case is half-tested: it could be a gate that fails on
everything, which is just as useless as one that fails on nothing. Both directions are required.

### 2. The test is load-bearing (neutralization proof)

A test that passes even when the gate is broken is not a test. So each gate's test must be proven to
**flip to red when the gate is neutralized**. The meta-gate mutates the gate script to a no-op (makes it
always exit zero) and confirms the test then fails. If the test still passes against a no-op gate, the
test was decorative and the gate is treated as untested. This is the mutation idea turned on the gates
themselves, and TFN already has the harness for it (`verify-guard-test-discrimination`).

### 3. Structurally impossible to ship an unproven gate

Conditions 1 and 2 are not honor-system. Two meta-gates make them merge-blocking:

- **every gate has a test** (`check-has-test`-style): a gate script with no accompanying test fails CI.
- **every test discriminates** (`verify-check-discrimination`-style): a test that does not flip when its
  gate is neutralized fails CI.

Because these are themselves required checks feeding the `gate` aggregator, you cannot add a gate that
skips the proof. The proof is enforced by the same machine it describes.

### 4. The miss corpus: every escape becomes a permanent fixture

No fixture set is complete. When a gate lets through something it should have caught (a false negative
found in the wild) or blocks something it should have allowed (a false positive), the fix is **not** just
to patch the gate. The fix is to add the missed input as a new committed fixture **first**, watch it
fail, then change the gate until it passes. The miss can never silently return, because the test for it
now lives in the suite forever. This is the `arch-encode` loop applied to the gates, and it is what makes
the false-positive and false-negative surface monotonically shrink instead of drifting.

## What each condition does and does not prove

| Condition | Proves | Does NOT prove |
|-----------|--------|----------------|
| Paired fixtures | the gate behaves correctly on the specified bad and good cases | correctness on inputs no fixture covers |
| Neutralization | the test is real and tied to the gate's behavior | the gate's rule is the *right* rule |
| Meta-gates | no gate can merge without the above proof | the fixtures are *exhaustive* |
| Miss corpus | every known escape is permanently closed | that no unknown escape exists |

Read together: the bar guarantees **no gate ships unproven, and no known mistake recurs.** It does not
guarantee omniscience. That is the honest shape of the strongest thing that is actually achievable.

## The release gate (how "done" is itself enforced)

"Done" is not a feeling; it is a check. Before the program is declared complete:

1. Every gate in `scripts/ci/` has a paired-fixture test (condition 1), proven load-bearing (condition 2).
2. The two meta-gates (conditions 3) are required checks in the `main-security-gates` ruleset.
3. The miss corpus (condition 4) is a documented, growing directory of fixtures, with a short README
   explaining that every entry is a real past escape.
4. A final judge-arch review in fresh context confirms the above against the actual diff, and the
   skill-application receipt for the capstone PR cites `verifiable-quality-gates` and `skeptical-audit`
   with the evidence.

Until all four hold, the program is **not done**, regardless of how many gates are green. A green board
on an unproven gate is exactly the lie this bar exists to prevent.
