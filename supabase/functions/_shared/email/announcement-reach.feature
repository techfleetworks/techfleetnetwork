Feature: A failed announcement broadcast is never silent
  send-announcement-email is invoked fire-and-forget from the UI, so a 500 that is
  not also paged is invisible — that is how the 2026-11-12 under-reach (enqueue
  cancelled by the 8s statement_timeout, rolled back to zero rows) went unnoticed.
  The single owner supabase/functions/_shared/email/announcement-reach.ts routes
  that failure to the durable audit sink (System Health → Top Errors).
  Executable proof: announcement-reach.test.ts.

  @critical
  Scenario: An enqueue failure pages through the audit sink
    Given an announcement broadcast whose enqueue fails and rolls back
    When the edge function handles the failure
    Then one write_audit_log row is written with event_type "email_announcement_reach_failed"
    And it records the announcement id and a human-readable detail
    # the 500 returned to the fire-and-forget UI is not enough — this is the signal

  @critical
  Scenario: The alert fingerprint is stable so System Health can de-noise it
    Given a reach failure with a known reason and counts
    When the alert tags are built
    Then they begin with "reason:<reason>" and include the eligible and enqueued counts
    # identical tuples collapse to one alert; the tuple must be deterministic

  @critical
  Scenario: Alerting is best-effort and cannot break the caller
    Given the audit sink is unavailable
    When an alert is emitted
    Then emission resolves without throwing and the original failure response is unchanged
    # a broken alerter must never mask or replace the original error
