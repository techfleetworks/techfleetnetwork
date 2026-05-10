UPDATE public.agent_fix_queue
SET status = 'dismissed',
    dismissed_at = now(),
    dismissed_reason = CASE
      WHEN source = 'SupportWidget.token' THEN 'Reverted Chatwoot prototype — SupportWidget no longer exists in codebase; residual prod traffic will clear after next deploy.'
      ELSE 'Working as intended — Zod validator correctly rejected missing required fields.'
    END
WHERE status = 'pending'
  AND id IN (
    '410b91a1-bd7c-40a1-8831-9df59a463813',
    'a6550e35-d5ea-4d31-b972-33d958d25800',
    '1b539870-aa49-419a-bf1e-b9aba9c3790c',
    'bedd7f89-04f3-45d4-86b3-2922abbc8160',
    'df2ef5ea-7c86-42f8-a48d-bb0665037b48',
    '60fe83a0-52cf-46e7-aa59-3ee3adc92b0d',
    'e034f361-099d-4b20-8234-8d9bb8909f34'
  );