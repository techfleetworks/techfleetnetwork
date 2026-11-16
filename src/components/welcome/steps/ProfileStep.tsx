import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import MuiTextField from "@mui/material/TextField";
import { Autocomplete, RHFTextField, SaveStatus, Skeleton, Stack, Text } from "@/design-system";
import { useAuth } from "@/contexts/AuthContext";
import { useAutosave } from "@/hooks/use-autosave";
import { useUpdateProfileFields } from "@/hooks/use-update-profile-fields";
import type { Profile } from "@/services/profile.service";
import { COUNTRIES } from "@/lib/countries";
import { regionsForCountryName, countryHasRegions } from "@/lib/regions";
import {
  welcomeProfileSchema,
  type WelcomeProfileForm,
} from "@/lib/validators/welcome-profile";
import { WELCOME_CONTENT } from "../content";
import { WELCOME_STEP_HEADING_ID } from "../navigation";

const COUNTRY_NAMES = COUNTRIES.map((c) => c.name);

/**
 * Step (f) — Fill out your profile (Figma 8873:1442). Renders the member's EXISTING
 * profile fields, prefilled (Redundant Entry, WCAG 3.3.7, FR-f5), all OPTIONAL to advance
 * (P11). Country and State are searchable selects over the shared COUNTRIES / regions
 * lists — the same data as the profile editor, writing the same `profiles` columns
 * (country, state) through the single owner (ProfileService.updateFields) via autosave, so
 * edits survive a refresh (FR-N3) and reach the shared profile (FR-f3). State appears only
 * for countries that have a region list and clears when the country changes.
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
      state: profile?.state ?? "",
      portfolio_url: profile?.portfolio_url ?? "",
      linkedin_url: profile?.linkedin_url ?? "",
    },
  });

  const values = form.watch();
  const hasErrors = Object.keys(form.formState.errors).length > 0;
  const stateOptions = regionsForCountryName(values.country).map((r) => r.name);
  const showState = countryHasRegions(values.country);

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

      <Controller
        name="country"
        control={form.control}
        render={({ field }) => (
          <Autocomplete
            options={COUNTRY_NAMES}
            value={field.value || null}
            onChange={(_e, v) => {
              field.onChange(v ?? "");
              // Clear a now-invalid state when the country changes.
              const nextRegions = regionsForCountryName(v).map((r) => r.name);
              if (!nextRegions.includes(form.getValues("state"))) {
                form.setValue("state", "", { shouldDirty: true });
              }
            }}
            onBlur={field.onBlur}
            getOptionLabel={(o) => o}
            isOptionEqualToValue={(o, val) => o === val}
            renderInput={(params) => (
              <MuiTextField
                {...params}
                label={c.fields.country}
                placeholder={c.countryPlaceholder}
              />
            )}
          />
        )}
      />

      {showState ? (
        <Controller
          name="state"
          control={form.control}
          render={({ field }) => (
            <Autocomplete
              options={stateOptions}
              value={field.value || null}
              onChange={(_e, v) => field.onChange(v ?? "")}
              onBlur={field.onBlur}
              getOptionLabel={(o) => o}
              isOptionEqualToValue={(o, val) => o === val}
              renderInput={(params) => (
                <MuiTextField
                  {...params}
                  label={c.fields.state}
                  placeholder={c.statePlaceholder}
                />
              )}
            />
          )}
        />
      ) : null}

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
