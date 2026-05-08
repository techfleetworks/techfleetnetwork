UPDATE public.agent_fix_queue
SET status = 'dismissed',
    dismissed_at = now(),
    dismissed_reason = 'Benign self-resolving system_health_state transition (audit_pressure none↔soft); informational only, no code fix required.',
    dismissed_by = NULL,
    updated_at = now()
WHERE event_type = 'audit_pressure_changed'
  AND status IN ('open','triaging','triaged')
  AND fingerprint IN (
    '22f966da9e598b8dd0061c8f160162c9a060790ff6b41f03192d9943c32c75b3',
    'fb7920740b839d1a7f22baf33601d3dd71ba3b1421874f35e222bf2aafa596c9'
  );