import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { RHFTextField, SaveStatus, Skeleton, Stack, Text } from "@/design-system";
import { useAuth } from "@/contexts/AuthContext";
import { useAutosave } from "@/hooks/use-autosave";
import { useUpdateProfileFields } from "@/hooks/use-update-profile-fields";
import type { Profile } from "@/services/profile.service";
import {
  welcomeProfileSchema,
  type WelcomeProfileForm,
} from "@/lib/validators/welcome-profile";
import { WELCOME_CONTENT } from "../content";
import { WELCOME_STEP_HEADING_ID } from "../navigation";

/**
 * Step (f) — Fill out your profile (§4.8). Renders the member's EXISTING Basic-Information
 * fields, prefilled from their profile (Redundant Entry, WCAG 3.3.7, FR-f5), all OPTIONAL
 * to advance (P11). Edits persist through the single owner (ProfileService.updateFields,
 * allow-listed + sanitized) via autosave, so data survives a refresh (FR-N3) and the write
 * reaches the shared profile (bidirectional with the edit page, FR-f3). Adds no column
 * ("State" is not collected, P11).
 *
 * Gated on `profileLoaded` so the form initializes from real values; the heading renders in
 * both states so the shell's focus target always exists.
 */
export function ProfileStep() {
  const { user, profile, profileLoaded } = useAuth();

  if (!profileLoaded || !user) {
    return (
      <Stack spacing={3}>
        <Text brand="display" id={WELCOME_STEP_HEADING_ID} tabIndex={-1} sx={{ outline: "none" }}>
          {WELCOME_CONTENT.profile.heading}
        </Text>
        <Skeleton variant="rounded" height={56} />
        <Skeleton variant="rounded" height={56} />
        <Skeleton variant="rounded" height={56} />
      </Stack>
    );
  }

  return <ProfileForm profile={profile} />;
}

function ProfileForm({ profile }: { profile: Profile | null }) {
  const saveProfile = useUpdateProfileFields();
  const c = WELCOME_CONTENT.profile;

  const form = useForm<WelcomeProfileForm>({
    resolver: zodResolver(welcomeProfileSchema),
    mode: "onBlur",
    defaultValues: {
      first_name: profile?.first_name ?? "",
      last_name: profile?.last_name ?? "",
      country: profile?.country ?? "",
      portfolio_url: profile?.portfolio_url ?? "",
      linkedin_url: profile?.linkedin_url ?? "",
    },
  });

  const values = form.watch();
  const hasErrors = Object.keys(form.formState.errors).length > 0;

  const autosave = useAutosave<WelcomeProfileForm>({
    value: values,
    // Don't persist while a field (e.g. a URL) is invalid; empty is always valid (optional).
    enabled: !hasErrors,
    label: "welcome-profile",
    // Writes through the hook → ProfileService (allow-listed) → refreshes the shared
    // profile so the edit page / dashboard see the edit (bidirectional, FR-f3).
    onSave: (v) => saveProfile(v),
  });

  return (
    <Stack spacing={3} component="form" onSubmit={(e) => e.preventDefault()}>
      <Text brand="display" id={WELCOME_STEP_HEADING_ID} tabIndex={-1} sx={{ outline: "none" }}>
        {c.heading}
      </Text>
      <Text brand="body" color="muted">
        {c.subhead}
      </Text>

      <RHFTextField name="first_name" control={form.control} label={c.fields.first_name} />
      <RHFTextField name="last_name" control={form.control} label={c.fields.last_name} />
      <RHFTextField name="country" control={form.control} label={c.fields.country} />
      <RHFTextField
        name="portfolio_url"
        control={form.control}
        label={c.fields.portfolio_url}
        type="url"
        placeholder="https://"
      />
      <RHFTextField
        name="linkedin_url"
        control={form.control}
        label={c.fields.linkedin_url}
        type="url"
        placeholder="https://"
      />

      <SaveStatus
        state={autosave.status}
        savedAt={autosave.lastSavedAt}
        onRetry={autosave.retry}
      />
    </Stack>
  );
}
