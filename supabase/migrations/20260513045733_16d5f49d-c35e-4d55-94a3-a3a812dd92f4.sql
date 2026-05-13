UPDATE public.agent_fix_queue
SET status = 'resolved'
WHERE id IN (
  'c1c08cef-7778-4ee2-88d6-9390105c8c5c',
  '1122a188-f5ea-4fee-a468-171adc71c8d3',
  '3e01f6c2-851c-46eb-9b0e-ee1885668c30',
  '104c75f3-8888-48f4-9fa5-47f4e5bbc866',
  'ef03b0dc-d4dd-4989-ac26-2696ad0606e7',
  '3bf63fa3-fd40-464a-8262-de7a73fdd91a',
  'e42ac6c3-992a-4f9e-b589-6f11c4d0736b'
);