-- Add SELECT policy for avatars bucket (needed for list operations)
CREATE POLICY "Avatar images are publicly accessible"
ON storage.objects
FOR SELECT
USING (bucket_id = 'avatars');
