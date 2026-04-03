import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { getInviteChannelCandidates } from "./discord-invite-utils.ts";

Deno.test("prioritizes onboarding channels over project-specific general channels", () => {
  const candidates = getInviteChannelCandidates([
    { id: "1", type: 0, name: "pr-general" },
    { id: "2", type: 0, name: "welcome" },
    { id: "3", type: 0, name: "create-a-ticket" },
    { id: "4", type: 0, name: "general" },
    { id: "5", type: 0, name: "introductions" },
  ]);

  assertEquals(
    candidates.map((channel) => channel.name),
    ["welcome", "introductions", "general", "pr-general", "create-a-ticket"],
  );
});

Deno.test("keeps all text channels available as fallback candidates", () => {
  const candidates = getInviteChannelCandidates([
    { id: "1", type: 2, name: "voice" },
    { id: "2", type: 0, name: "custom-onboarding" },
    { id: "3", type: 0, name: "support-general" },
  ]);

  assertEquals(
    candidates.map((channel) => channel.name),
    ["custom-onboarding", "support-general"],
  );
});
