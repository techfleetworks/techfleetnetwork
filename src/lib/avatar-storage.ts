const AVATAR_PATH_PATTERN = /^[a-z0-9_-]{1,80}\/avatar\.(png|jpe?g)$/i;

export function extractAvatarPath(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const pathOnly = trimmed.match(/(?:^|\/)avatars\/([^?#]+)/)?.[1] ?? trimmed;
  const decoded = decodeURIComponent(pathOnly);
  if (!AVATAR_PATH_PATTERN.test(decoded)) return null;
  return decoded;
}