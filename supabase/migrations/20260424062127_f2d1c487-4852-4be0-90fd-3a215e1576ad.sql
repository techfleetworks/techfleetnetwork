-- Seed BDD scenarios for: Membership Parity, Tiers, FAQ & Announcement
INSERT INTO public.bdd_scenarios
  (scenario_id, feature_area, feature_area_number, title, gherkin, status, test_type, test_file)
VALUES
  ('MEM-PARITY-001', 'Membership Parity', 91,
   'Parity notice renders on Membership tab',
   'Given a member opens the Membership tab\nWhen the tier grid renders\nThen the "Fair pricing, wherever you are" notice is visible exactly once',
   'implemented', 'unit', 'src/test/smoke/membership-parity.smoke.test.ts'),

  ('MEM-PARITY-002', 'Membership Parity', 91,
   'Parity notice mentions PPP and "no code needed"',
   'Given the parity notice is rendered\nWhen a screen reader inspects the copy\nThen it includes "Purchasing Power Parity" and "no code needed"',
   'implemented', 'unit', 'src/test/smoke/membership-parity.smoke.test.ts'),

  ('MEM-PARITY-003', 'Membership Parity', 91,
   'All three tier cards render in correct order',
   'Given the membership grid renders\nWhen TIER_ORDER is applied\nThen Starter, Community, and Professional cards render in that order',
   'implemented', 'unit', 'src/test/smoke/membership-parity.smoke.test.ts'),

  ('MEM-PARITY-004', 'Membership Parity', 91,
   'Community card shows Most Popular badge with SR-only "tier" suffix',
   'Given the Community tier is marked popular\nWhen the card renders\nThen a "Most Popular" badge is visible with an SR-only " tier" suffix',
   'implemented', 'unit', 'src/test/smoke/membership-parity.smoke.test.ts'),

  ('MEM-PARITY-005', 'Membership Parity', 91,
   'Founding promo strip only on Community + yearly view + active window',
   'Given the founding promo window is active\nWhen the user toggles to Yearly\nThen the founding promo strip appears only on the Community card',
   'implemented', 'unit', 'src/test/smoke/membership-parity.smoke.test.ts'),

  ('MEM-PARITY-006', 'Membership Parity', 91,
   'Billing toggle exposes Monthly + Yearly with savings badge',
   'Given the membership grid renders\nWhen the founding promo is active\nThen a Monthly/Yearly radiogroup is present and the Yearly option carries a savings badge',
   'implemented', 'unit', 'src/test/smoke/membership-parity.smoke.test.ts'),

  ('MEM-PARITY-007', 'Membership Parity', 91,
   'Professional shows waitlist CTA when no SKU configured',
   'Given the Professional tier has no Gumroad SKU\nWhen the card renders\nThen the CTA reads "Coming soon · Join waitlist"',
   'implemented', 'unit', 'src/test/smoke/membership-parity.smoke.test.ts'),

  ('MEM-PARITY-008', 'Membership Parity', 91,
   'Current-tier status uses aria-disabled, not the disabled attribute',
   'Given the user is on a tier\nWhen that tier card renders\nThen the status block uses role="status" with an aria-label and never the native disabled attribute',
   'implemented', 'unit', 'src/test/smoke/membership-parity.smoke.test.ts'),

  ('MEM-PARITY-009', 'Membership Parity', 91,
   '"Locked for life" copy surfaces while promo window is active',
   'Given the founding promo is active\nWhen the user views the Community yearly price\nThen the price footnote or promo strip includes "locked for life"',
   'implemented', 'unit', 'src/test/smoke/membership-parity.smoke.test.ts'),

  ('MEM-PARITY-FAQ-001', 'Membership Parity', 91,
   'Membership FAQ contains the "checkout price" entry',
   'Given the FAQ data file is loaded\nWhen entries are listed\nThen one entry asks why the checkout price differs and answers with PPP guidance',
   'implemented', 'unit', 'src/test/smoke/membership-parity.smoke.test.ts'),

  ('MEM-PARITY-FAQ-002', 'Membership Parity', 91,
   'FAQ block is reachable from Membership tab and keyboard accessible',
   'Given a member opens the Membership tab\nWhen the page renders\nThen the MembershipFaq accordion is mounted with an accessible name and keyboard support',
   'implemented', 'unit', 'src/test/smoke/membership-parity.smoke.test.ts'),

  ('MEM-PARITY-ANN-001', 'Membership Parity', 91,
   'Draft parity announcement is seeded with admin authorship',
   'Given the seed migration runs\nWhen it inserts the parity announcement\nThen the row is owned by a user with the admin role and contains the parity copy',
   'implemented', 'unit', 'src/test/smoke/membership-parity.smoke.test.ts'),

  ('MEM-PARITY-ANN-002', 'Membership Parity', 91,
   'Parity announcement seed insert is idempotent',
   'Given the seed migration has already run once\nWhen it runs again\nThen no duplicate row is inserted (WHERE NOT EXISTS guard)',
   'implemented', 'unit', 'src/test/smoke/membership-parity.smoke.test.ts')
ON CONFLICT (scenario_id) DO UPDATE SET
  title = EXCLUDED.title,
  gherkin = EXCLUDED.gherkin,
  status = EXCLUDED.status,
  test_type = EXCLUDED.test_type,
  test_file = EXCLUDED.test_file,
  feature_area = EXCLUDED.feature_area,
  feature_area_number = EXCLUDED.feature_area_number,
  updated_at = now();

-- Idempotent seed of the parity Community Update (status implicit by absence
-- of any published flag on this table; not auto-published — admin will publish
-- from the Updates surface once Gumroad PPP is flipped on).
INSERT INTO public.announcements (title, body_html, created_by)
SELECT
  'Pricing parity is on — fairer membership pricing worldwide',
  '<p>Hey Fleet,</p>
<p>Tech Fleet is global. Today we''re turning on <strong>purchasing power parity</strong> for Community Membership. What that means in plain English:</p>
<p>If you live somewhere where US-dollar pricing doesn''t reflect local cost of living, you''ll see an automatic discount at checkout. No coupon code, no form to fill out. Gumroad detects your country and applies the right discount tier.</p>
<ul>
  <li>The discount is applied on the Gumroad checkout page, not here on the platform.</li>
  <li>It stacks with our <strong>Founding Member</strong> rate (50% off yearly, locked for life — through Sep 30).</li>
  <li>Members in the US, EU, UK, Canada, Australia, and other higher-cost regions continue to see standard pricing.</li>
  <li>The discount tier is set by Gumroad''s parity table, which is updated based on World Bank data.</li>
</ul>
<p>Why we''re doing this: we want the same access for a member in Manila as a member in Munich. The dollar amount that means "this is worth it" is different in different places, and we''d rather meet you where you are than pretend that isn''t true.</p>
<p>Questions? Reply in #network-activity or send feedback from your profile.</p>
<p>— The Tech Fleet team</p>',
  ur.user_id
FROM public.user_roles ur
WHERE ur.role = 'admin'
  AND NOT EXISTS (
    SELECT 1 FROM public.announcements a
    WHERE a.title = 'Pricing parity is on — fairer membership pricing worldwide'
  )
ORDER BY ur.user_id
LIMIT 1;