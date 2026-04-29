-- Make profile pictures private so durable public avatar links are no longer exposed.
UPDATE storage.buckets
SET public = false
WHERE id = 'avatars';

DROP POLICY IF EXISTS "Anyone can view avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can view avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can list own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can manage their own avatars" ON storage.objects;
DROP POLICY IF EXISTS "Admins can manage avatars" ON storage.objects;

CREATE POLICY "Authenticated members can view avatars"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload own avatar"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update own avatar"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete own avatar"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Admins can manage avatars"
ON storage.objects
FOR ALL
TO authenticated
USING (
  bucket_id = 'avatars'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
)
WITH CHECK (
  bucket_id = 'avatars'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

INSERT INTO public.bdd_scenarios (scenario_id, feature_area, feature_area_number, title, gherkin, status, test_type, notes)
VALUES (
  'SEC-AVATAR-PRIVATE-029',
  'Security',
  20,
  'Private profile pictures use authenticated access',
  'Feature: Secure profile picture access
  Scenario: A member uploads a profile picture
    Given the member is signed in
    When they upload a valid PNG or JPG profile picture
    Then the profile picture is stored in private file storage
    And the profile record must not store a durable public storage URL
    And signed-in members can view profile pictures through authenticated access
    And unauthenticated visitors cannot enumerate or fetch avatar files',
  'implemented',
  'unit',
  'Profile picture callers store object paths and resolve short-lived display URLs client-side.'
)
ON CONFLICT (scenario_id) DO UPDATE SET
  title = EXCLUDED.title,
  gherkin = EXCLUDED.gherkin,
  status = EXCLUDED.status,
  test_type = EXCLUDED.test_type,
  notes = EXCLUDED.notes,
  updated_at = now();