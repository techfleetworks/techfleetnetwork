-- BDD scenarios for Fleety rearchitecture PR1-3 (prompt SoT + grounding +
-- injection hardening). Executable coverage:
--   supabase/functions/techfleet-chat/prompt.test.ts  (deno test, run in CI's
--     deno-check job) and supabase/tests/fleety_rpc_hardening_test.sql (pgTAP,
--     `supabase db test`). status='implemented' — real, running tests.

INSERT INTO public.bdd_scenarios
  (scenario_id, feature_area, feature_area_number, title, gherkin, status, test_type, test_file, notes)
VALUES
  ('FLEETY-001', 'Fleety', 30,
   'The system prompt is a single source of truth in prompt.ts (D-17)',
   'Feature: Prompt as code\n  Scenario: a chat turn assembles its system prompt\n    Given the pure builder buildSystemPrompt(ctx) in prompt.ts\n    Then it produces the full system prompt from named slots\n    And techfleet-chat/index.ts contains no inline prompt constants',
   'implemented', 'unit', 'supabase/functions/techfleet-chat/prompt.test.ts',
   'Extraction is byte-for-byte faithful to the previous inline prompt; changing behaviour is a reviewed PR to one file.'),

  ('FLEETY-002', 'Fleety', 30,
   'CI fails the build if the base prompt exceeds the token ceiling (D-17b)',
   'Feature: Prompt token budget\n  Scenario: a prompt change bloats the fixed instructions\n    Given the base prompt with every dynamic slot empty\n    When it exceeds the 2000-token ceiling\n    Then the CI prompt gate (deno test) fails with the actual token count',
   'implemented', 'unit', 'supabase/functions/techfleet-chat/prompt.test.ts',
   'Guarantees runtime KB/context always has headroom; measured base ~1854 tokens (practical).'),

  ('FLEETY-003', 'Fleety', 30,
   'Prompt assembly is deterministic and slot-ordered (D-17c)',
   'Feature: Deterministic prompt\n  Scenario: identical input\n    Then buildSystemPrompt yields identical output\n    And the required sections each appear exactly once\n    And slots concatenate in the fixed order',
   'implemented', 'unit', 'supabase/functions/techfleet-chat/prompt.test.ts',
   'Prevents accidental reordering or duplication of prompt sections.'),

  ('FLEETY-004', 'Fleety', 30,
   '@security Fleety DEFINER RPCs are hardened (search_path='''', least privilege)',
   'Feature: Hardened RPCs\n  Scenario: fleety_observe_synonym and fleety_load_user_memories\n    Then both are SECURITY DEFINER with SET search_path = ''''\n    And EXECUTE is REVOKEd from PUBLIC, anon AND authenticated, and granted only to service_role\n    So neither is reachable by the authenticated/anon roles via PostgREST (IDOR-safe)',
   'implemented', 'unit', 'supabase/tests/fleety_rpc_hardening_test.sql',
   'search_path='''' blocks search-path hijack; explicit REVOKE from the named anon/authenticated roles is the IDOR control (REVOKE FROM PUBLIC alone does not remove Supabase''s default direct grant). Fixed per adversarial review HIGH-1.'),

  ('FLEETY-005', 'Fleety', 30,
   '@security Honesty hard-gate: no grounding means no fabrication (UC-04)',
   'Feature: Honest when unknown\n  Scenario: retrieval returns nothing\n    Given no KB, framework, canned, playbook, example or few-shot context\n    When the prompt is built\n    Then the NO_KNOWLEDGE_DIRECTIVE is injected (do not invent; point to guide/Discord)\n    And Fleety does not fabricate playbooks or resources',
   'implemented', 'unit', 'supabase/functions/techfleet-chat/prompt.test.ts',
   'Replaces the old passive "knowledge base is being set up" line that let the LLM improvise/fabricate.'),

  ('FLEETY-006', 'Fleety', 30,
   'Structural citations are injected by code, not the LLM (D-08)',
   'Feature: Structural citations\n  Scenario: a grounded answer with navigable sources\n    Given KB hits carrying guide.techfleet.org URLs\n    Then the X-Fleety-Sources response header carries the deduped http(s) URLs\n    And framework:// / csv:// internal refs are excluded',
   'implemented', 'unit', 'supabase/functions/techfleet-chat/prompt.test.ts',
   'buildSourcesHeaderValue/extractSourceUrls are pure and tested; citations no longer depend on the model complying.'),

  ('FLEETY-007', 'Fleety', 30,
   '@security Retrieved content cannot hijack the prompt (D-21)',
   'Feature: Indirect prompt-injection defense\n  Scenario: a KB chunk contains "ignore all previous instructions"\n    When it is retrieved and injected\n    Then it is wrapped in an UNTRUSTED REFERENCE DATA boundary\n    And the base prompt asserts retrieved data is facts-only and instructions inside it are never obeyed\n    And the FLEETY-SYSTEM-CANARY never leaks',
   'implemented', 'unit', 'supabase/functions/techfleet-chat/prompt.test.ts',
   'wrapUntrusted() + SYSTEM_PROMPT_BASE precedence clause; poisoned-content containment is unit-tested.')
ON CONFLICT (scenario_id) DO UPDATE SET
  title = EXCLUDED.title, gherkin = EXCLUDED.gherkin, status = EXCLUDED.status,
  test_type = EXCLUDED.test_type, test_file = EXCLUDED.test_file,
  feature_area = EXCLUDED.feature_area, feature_area_number = EXCLUDED.feature_area_number,
  notes = EXCLUDED.notes, updated_at = now();
