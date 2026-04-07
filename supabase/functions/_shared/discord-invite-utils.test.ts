import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  getInviteCapableChannels,
  getInviteChannelCandidates,
  isExactOnboardingInviteChannel,
} from "./discord-invite-utils.ts";

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

Deno.test("matches onboarding channels by normalized exact name", () => {
  assertEquals(isExactOnboardingInviteChannel({ name: "👋welcome" }), true);
  assertEquals(isExactOnboardingInviteChannel({ name: "general" }), true);
  assertEquals(isExactOnboardingInviteChannel({ name: "agile-ux-general" }), false);
});

Deno.test("filters out channels where the bot cannot both view and create invites", () => {
  const channels = getInviteCapableChannels({
    channels: [
      {
        id: "welcome",
        type: 0,
        name: "welcome",
        permission_overwrites: [
          { id: "guild", type: 0, allow: "0", deny: "1024" },
        ],
      },
      {
        id: "general",
        type: 0,
        name: "general",
        permission_overwrites: [
          { id: "guild", type: 0, allow: "0", deny: "0" },
        ],
      },
    ],
    guildId: "guild",
    guildRoles: [
      { id: "guild", permissions: "1025" },
      { id: "bot-role", permissions: "0" },
    ],
    memberRoleIds: ["bot-role"],
    memberUserId: "bot-user",
  });

  assertEquals(channels.map((channel) => channel.name), ["general"]);
});
