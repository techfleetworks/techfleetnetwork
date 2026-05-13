-- Audit follow-up: cohorts_meeting_url_public
-- Strategy: column-level privilege revoke for anon role. Leaves the RLS policy
-- byte-for-byte identical (per audit guardrails) while preventing unauthenticated
-- clients from selecting the meeting_url column. Authenticated role retains
-- access via the existing "Public can view published cohorts of published classes"
-- + member/teacher/admin policies.

REVOKE SELECT (meeting_url) ON public.cohorts FROM anon;