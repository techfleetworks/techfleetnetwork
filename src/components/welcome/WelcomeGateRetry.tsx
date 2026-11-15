import { useState } from "react";
import { Box, Button, Stack, Text } from "@/design-system";
import { useAuth } from "@/contexts/AuthContext";

/**
 * The gate's "profile read failed" state (§7 / CLAUDE.md three-state). Shown when the gate
 * can neither confirm completion nor safely redirect — it must NEVER bypass (skipping the
 * mandatory flow) nor redirect (looping). So we hold the user here with two always-available
 * actions: retry the read, or sign out. This is NOT a trap — sign-out is a keyboard-reachable
 * escape, and it is a routed page region (not an aria-modal). DS-only (welcome dir rule).
 */
export function WelcomeGateRetry() {
  const { refreshProfile, signOut } = useAuth();
  const [retrying, setRetrying] = useState(false);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await refreshProfile();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <Box
      component="main"
      sx={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        px: 2,
        pt: "env(safe-area-inset-top)",
        pb: "env(safe-area-inset-bottom)",
      }}
    >
      <Stack spacing={3} sx={{ maxWidth: 420, width: "100%" }}>
        <Text brand="pageTitle" component="h1">
          We couldn't load your account
        </Text>
        <Text brand="body">
          Something went wrong reading your profile, so we can't start your welcome just yet.
          Please try again. If it keeps happening, sign out and back in.
        </Text>
        <Stack spacing={1.5}>
          <Button size="lg" onClick={handleRetry} disabled={retrying}>
            {retrying ? "Retrying…" : "Try again"}
          </Button>
          <Button size="lg" variant="outline" onClick={() => void signOut()}>
            Sign out
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}
