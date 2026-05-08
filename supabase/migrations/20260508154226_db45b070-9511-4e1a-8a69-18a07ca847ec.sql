-- Resolved: chunk-load errors are mitigated by lazy-with-retry + the new mount watchdog
UPDATE public.agent_fix_queue
SET status='resolved',
    resolved_at=now(),
    dismissed_reason='Mitigated by lazy-with-retry recovery and the new index.html mount watchdog (8s blank-screen detector). No further code action.',
    updated_at=now()
WHERE id IN (
  '7758a2db-5a11-4bcd-8d27-1301550b26f8', -- NetworkActivity stale chunk
  'bef5c154-42f9-42cb-b8d7-003f7b17f8c8'  -- FleetyChatWidget stale chunk
);

-- Dismissed: transient client-side network failures from a single user session at ~04:05 UTC
UPDATE public.agent_fix_queue
SET status='dismissed',
    dismissed_at=now(),
    dismissed_reason='Transient client-side network failure (TypeError: NetworkError / AbortError) — same user session, same window, multiple parallel fetches failing simultaneously. Indicates user lost connectivity or closed the tab mid-flight. Not a code bug. The high notification-poll counts (getReadIds=91, list=91) are normal retry behavior on a flaky connection.',
    updated_at=now()
WHERE id IN (
  '83feda4d-cb15-4305-b105-e9b2e6319b20', -- getReadIds NetworkError
  '0c6acf94-e210-44e9-9876-87eb6b8ee496', -- list NetworkError
  '1a0b1894-3b1f-4f7f-b8cb-ac95f0ec714b', -- query.published-banners
  'e0cfbcae-839a-4305-9311-b156cdd15a4a', -- query.teacher-role
  '8ba8f73f-ca9c-442b-8c4a-3ba4b7da7089', -- query.admin-role
  'bffedceb-f5d8-42a2-85cf-040c3a1d2a21', -- query.announcements.latest.20
  '752c0398-fab5-47c4-b745-1f48b04ed39c', -- query.banner-dismissals
  'bc129ceb-89a9-4c90-8360-9097d9c0a9dc', -- query.dashboard-overview
  'd32fcb2d-e6ea-454d-bea0-100dd98d34e3'  -- AbortError
);

-- Dismissed: email permanent bounce — handled by pipeline auto-suppression
UPDATE public.agent_fix_queue
SET status='dismissed',
    dismissed_at=now(),
    dismissed_reason='Permanent email bounce — already auto-suppressed by the transactional email pipeline (email_send_log). Informational only; not actionable in code. The recipient address is invalid.',
    updated_at=now()
WHERE id='fc445779-2cc1-4f60-bce4-f4b5fff9de4b';

-- Dismissed: RHF/zod resolver unhandledrejection noise (suppression rule added in code)
UPDATE public.agent_fix_queue
SET status='dismissed',
    dismissed_at=now(),
    dismissed_reason='Benign React Hook Form + zodResolver noise: the resolver promise rejects with the ZodError before RHF catches it and writes form.formState.errors. The cohort form shows the inline validation message correctly. Suppression pattern "ZodError" added to error-reporter.service.ts so future occurrences are filtered at source.',
    updated_at=now()
WHERE id='292bd36c-2949-45df-be52-1fdc29922979';