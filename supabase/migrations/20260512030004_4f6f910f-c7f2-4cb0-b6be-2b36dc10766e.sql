
INSERT INTO public.known_issue_catalog (pattern, match_kind, event_type_filter, reason, is_active)
VALUES
  ('uncaught exception: undefined', 'substring', 'client_error', 'Browser extension / cross-origin script noise; no actionable stack', true),
  ('Minified React error #426', 'substring', 'ui_render_error', 'React Suspense hydration race during chunk swap; benign — handled by ErrorBoundary retry', true),
  ('Minified React error #426', 'substring', 'client_error', 'React Suspense hydration race during chunk swap; benign — handled by ErrorBoundary retry', true)
ON CONFLICT DO NOTHING;

UPDATE public.agent_fix_queue
SET status='dismissed',
    dismissed_at = now(),
    dismissed_reason = 'Catalogued as known noise (browser extension / Suspense hydration race / historical validation_rejected — already filtered going forward).'
WHERE id IN (
  '268f13d4-dd21-49ab-9119-dfab119131b8',
  '887e1ca6-ca3a-4c0e-a4e6-9311d67638a1',
  '7308cb96-e155-407c-b574-ec3226d313cd',
  '2653bbe8-a0a2-4772-bc64-e0051e975dff',
  '809e5d1d-19f5-4fc6-9d11-e320cd01df50',
  '69d63815-39c5-4463-9fa8-16ecee52d143'
);

UPDATE public.agent_fix_queue
SET status='resolved',
    resolved_at = now()
WHERE id = '36229c6a-d523-48cc-9a0b-3b4966feb74e';
