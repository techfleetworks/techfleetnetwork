import { useDiscordRoleRetry } from "@/hooks/use-discord-role-retry";

/** Mountpoint for self-healing background tasks that run inside AuthProvider scope. */
export function SelfHealingRunner() {
  useDiscordRoleRetry();
  return null;
}
