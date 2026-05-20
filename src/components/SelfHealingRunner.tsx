import { useDiscordRoleRetry } from "@/hooks/use-discord-role-retry";
import { useDiscordUsernameRepair } from "@/hooks/use-discord-username-repair";

/** Mountpoint for self-healing background tasks that run inside AuthProvider scope. */
export function SelfHealingRunner() {
  useDiscordRoleRetry();
  useDiscordUsernameRepair();
  return null;
}

