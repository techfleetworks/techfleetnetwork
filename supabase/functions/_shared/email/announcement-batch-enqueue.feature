# @pending: the executable proof is the Deno unit test announcement-batch-enqueue.test.ts,
# which runs in CI (ci.yml deno test list). The cucumber runner excludes @pending.
@pending
Feature: The announcement audience is enqueued in bounded, resumable batches
  A single unbounded set-based INSERT of the whole audience is what the 8s
  statement_timeout cancelled on 2026-11-12. The driver in
  supabase/functions/_shared/email/announcement-batch-enqueue.ts enqueues the
  audience in slices of at most p_batch_size rows, advancing a cursor, so no
  statement can time out and a crash mid-loop resumes idempotently.
  Executable proof: announcement-batch-enqueue.test.ts (runs in CI).

  @critical
  Scenario: The whole audience is drained across bounded slices
    Given an audience larger than one batch
    When the batch driver runs to completion
    Then every eligible recipient is enqueued across multiple bounded calls
    And the eligible and enqueued totals sum the slices

  @critical
  Scenario: A batch failure stops the loop and is surfaced, not swallowed
    Given a batch call returns an error mid-drain
    When the driver handles it
    Then it returns the error and the progress made so far
    # the edge function pages on that error (announcement-reach), never silent

  @critical
  Scenario: The loop is bounded and cannot spin forever
    Given a pathological batch that never advances the cursor
    When the driver runs
    Then it stops within the batch ceiling instead of looping forever
