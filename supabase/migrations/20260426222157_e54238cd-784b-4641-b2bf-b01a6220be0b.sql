ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS membership_billing_period text NOT NULL DEFAULT 'monthly';

CREATE INDEX IF NOT EXISTS idx_profiles_membership_billing_period
ON public.profiles (membership_billing_period);

INSERT INTO public.bdd_scenarios (
  feature_area,
  feature_area_number,
  scenario_id,
  title,
  gherkin,
  status,
  test_type,
  test_file,
  notes
)
VALUES
  (
    'Membership Billing Sync',
    84,
    'MEM-BILLING-SYNC-001',
    'Yearly Gumroad purchase stores billing period',
    'Given Gumroad sends a successful yearly founding membership sale\nWhen the payment webhook applies the sale to the matching profile\nThen the profile membership tier is Community\nAnd the profile membership billing period is yearly\nAnd the profile is marked as a Founding Member',
    'implemented',
    'manual',
    'supabase/functions/gumroad-webhook/index.ts',
    'Ensures yearly purchases persist recurrence instead of only tier.'
  ),
  (
    'Membership Billing Sync',
    84,
    'MEM-BILLING-SYNC-002',
    'Current membership banner shows yearly founding price',
    'Given a profile has Community membership\nAnd membership billing period is yearly\nAnd the profile is marked as a Founding Member\nWhen the Membership tab renders\nThen the current plan banner shows the yearly Founding Member price\nAnd it does not show the monthly Community price',
    'implemented',
    'manual',
    'src/components/CurrentMembershipBanner.tsx',
    'Protects the user-facing banner from falling back to monthly pricing.'
  )
ON CONFLICT (scenario_id) DO UPDATE SET
  title = EXCLUDED.title,
  gherkin = EXCLUDED.gherkin,
  status = EXCLUDED.status,
  test_type = EXCLUDED.test_type,
  test_file = EXCLUDED.test_file,
  notes = EXCLUDED.notes,
  updated_at = now();