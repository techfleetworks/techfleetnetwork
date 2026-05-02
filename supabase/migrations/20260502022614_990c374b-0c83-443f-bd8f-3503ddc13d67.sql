create index if not exists idx_journey_progress_completed_phase_task
  on public.journey_progress (phase, task_id)
  where completed = true;

create or replace function public.get_course_completion_counts(_course_specs jsonb)
returns table(course_key text, completers bigint)
language sql
stable
security definer
set search_path = public
as $$
  with specs as (
    select
      (spec->>'key')::text as course_key,
      (spec->>'phase')::journey_phase as phase,
      array(select jsonb_array_elements_text(spec->'task_ids')) as task_ids
    from jsonb_array_elements(coalesce(_course_specs, '[]'::jsonb)) as spec
    where spec ? 'key' and spec ? 'phase' and spec ? 'task_ids'
  ),
  per_user as (
    select
      s.course_key,
      jp.user_id,
      count(distinct jp.task_id) filter (where jp.completed) as done_count,
      cardinality(s.task_ids) as required_count
    from specs s
    join public.journey_progress jp
      on jp.phase = s.phase
     and jp.task_id = any(s.task_ids)
    where jp.user_id is distinct from auth.uid()
    group by s.course_key, jp.user_id, s.task_ids
  )
  select
    s.course_key,
    coalesce(count(distinct pu.user_id) filter (where pu.done_count >= pu.required_count), 0)::bigint as completers
  from specs s
  left join per_user pu on pu.course_key = s.course_key
  group by s.course_key;
$$;

revoke all on function public.get_course_completion_counts(jsonb) from public;
grant execute on function public.get_course_completion_counts(jsonb) to authenticated;

insert into public.bdd_scenarios (scenario_id, feature_area, feature_area_number, title, gherkin, status, test_type)
values
  ('COURSE-COMPLETERS-01', 'training/course-completers', 1, 'Card shows other-completer count',
$$Feature: Course completer count
  Scenario: COURSE-COMPLETERS-01 — Card shows other-completer count
    Given the Discord Learning Series has been completed by 7 distinct users besides the viewer
    When the viewer opens Courses → Core Courses
    Then [UI] the Discord Learning Series card shows "Completed by 7 other members" with a Users icon
    And [DB] get_course_completion_counts returns completers=7 for course_key='discord-learning'
    And [Code] the count excludes auth.uid() and excludes users who completed only some tasks$$,
   'not_built', 'none'),
  ('COURSE-COMPLETERS-02', 'training/course-completers', 1, 'Singular wording at one completer',
$$Feature: Course completer count
  Scenario: COURSE-COMPLETERS-02 — Singular wording
    Given exactly 1 other user has completed the Observer Course
    When the viewer opens the Courses page
    Then [UI] the Observer Course card shows "Completed by 1 other member" (singular)
    And [DB] get_course_completion_counts returns completers=1 for course_key='observer-course'
    And [Code] the formatter switches singular vs plural at n === 1$$,
   'not_built', 'none'),
  ('COURSE-COMPLETERS-03', 'training/course-completers', 1, 'Zero state encourages first completion',
$$Feature: Course completer count
  Scenario: COURSE-COMPLETERS-03 — Zero state
    Given no one besides the viewer has completed Build an Agile Mindset
    When the viewer opens the Courses page
    Then [UI] the Agile Mindset card shows "Be the first to complete this"
    And [DB] get_course_completion_counts returns completers=0 for course_key='agile-mindset'
    And [Code] the line still renders so the empty state is visible$$,
   'not_built', 'none'),
  ('COURSE-COMPLETERS-04', 'training/course-completers', 1, 'Locked cards hide the line',
$$Feature: Course completer count
  Scenario: COURSE-COMPLETERS-04 — Locked cards hide the line
    Given the Onboarding Steps card is locked behind Connect to Discord
    When the viewer opens the Courses page
    Then [UI] the locked card does not render the completers line
    And [Code] the locked render branch in CourseGrid returns before the new caption$$,
   'not_built', 'none'),
  ('COURSE-COMPLETERS-05', 'training/course-completers', 1, 'Self is excluded from count',
$$Feature: Course completer count
  Scenario: COURSE-COMPLETERS-05 — Self is excluded
    Given the viewer themselves has completed every Discord Learning lesson
    And 3 other users have also completed the course
    When the viewer opens the Courses page
    Then [UI] the Discord Learning card shows "Completed by 3 other members" (not 4)
    And [DB] the RPC filters with user_id IS DISTINCT FROM auth.uid()$$,
   'not_built', 'none'),
  ('COURSE-COMPLETERS-06', 'training/course-completers', 1, 'RLS blocks raw row access',
$$Feature: Course completer count
  Scenario: COURSE-COMPLETERS-06 — RLS — non-admin cannot read other users rows
    Given member A is signed in
    When member A queries journey_progress directly for user_id <> A.id
    Then [DB] RLS returns 0 rows (existing policy unchanged)
    And [Code] only the SECURITY DEFINER RPC exposes aggregate counts — never raw rows$$,
   'not_built', 'none')
on conflict (scenario_id) do update
  set gherkin = excluded.gherkin,
      title = excluded.title,
      updated_at = now();