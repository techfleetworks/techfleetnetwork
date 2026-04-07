export type DiscordPermissionOverwrite = {
  id: string;
  type: number | string;
  allow?: string;
  deny?: string;
};

export type DiscordInviteChannel = {
  id: string;
  type: number;
  name?: string;
  parent_id?: string | null;
  permission_overwrites?: DiscordPermissionOverwrite[];
};

export type DiscordGuildRole = {
  id: string;
  name?: string;
  permissions?: string;
};

const CREATE_INSTANT_INVITE = 0x1n;
const ADMINISTRATOR = 0x8n;
const VIEW_CHANNEL = 0x400n;
const REQUIRED_INVITE_PERMISSIONS = CREATE_INSTANT_INVITE | VIEW_CHANNEL;

export const EXACT_ONBOARDING_CHANNEL_NAMES = [
  "welcome",
  "general",
  "start-here",
  "getting-started",
  "get-started",
  "onboarding",
  "community",
  "introductions",
] as const;

const EXACT_ONBOARDING_CHANNEL_SET = new Set(EXACT_ONBOARDING_CHANNEL_NAMES);

const EXACT_PRIORITY_NAMES = [
  "welcome",
  "start-here",
  "introductions",
  "general",
] as const;

const HINT_PRIORITY_FRAGMENTS = [
  "welcome",
  "start-here",
  "introduction",
  "getting-started",
  "get-started",
  "onboarding",
] as const;

const DEPRIORITIZED_FRAGMENTS = [
  "log",
  "logs",
  "ticket",
  "rules",
  "mod",
  "support",
  "archive",
  "staff",
] as const;

function normalizeChannelName(name?: string): string {
  return (name ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}-]+/gu, "")
    .replace(/^-+|-+$/g, "");
}

function sortByName(a: DiscordInviteChannel, b: DiscordInviteChannel) {
  return normalizeChannelName(a.name).localeCompare(normalizeChannelName(b.name));
}

function parsePermissionBits(value?: string): bigint {
  try {
    return BigInt(value ?? "0");
  } catch {
    return 0n;
  }
}

function applyOverwrite(permissions: bigint, overwrite?: DiscordPermissionOverwrite) {
  if (!overwrite) return permissions;

  const allow = parsePermissionBits(overwrite.allow);
  const deny = parsePermissionBits(overwrite.deny);
  return (permissions & ~deny) | allow;
}

function isRoleOverwrite(overwrite: DiscordPermissionOverwrite) {
  return overwrite.type === 0 || overwrite.type === "0" || overwrite.type === "role";
}

function isMemberOverwrite(overwrite: DiscordPermissionOverwrite) {
  return overwrite.type === 1 || overwrite.type === "1" || overwrite.type === "member";
}

function getBaseGuildPermissions(
  guildRoles: DiscordGuildRole[],
  guildId: string,
  memberRoleIds: string[],
) {
  const everyoneRole = guildRoles.find((role) => role.id === guildId);
  const memberRoles = guildRoles.filter((role) => memberRoleIds.includes(role.id));

  return [everyoneRole, ...memberRoles].reduce(
    (permissions, role) => permissions | parsePermissionBits(role?.permissions),
    0n,
  );
}

export function isExactOnboardingInviteChannel(channel: Pick<DiscordInviteChannel, "name">) {
  return EXACT_ONBOARDING_CHANNEL_SET.has(normalizeChannelName(channel.name));
}

export function getInviteCapableChannels({
  channels,
  guildId,
  guildRoles,
  memberRoleIds,
  memberUserId,
}: {
  channels: DiscordInviteChannel[];
  guildId: string;
  guildRoles: DiscordGuildRole[];
  memberRoleIds: string[];
  memberUserId: string;
}) {
  const textChannels = channels.filter((channel) => channel.type === 0);
  const guildPermissions = getBaseGuildPermissions(guildRoles, guildId, memberRoleIds);

  if ((guildPermissions & ADMINISTRATOR) === ADMINISTRATOR) {
    return textChannels;
  }

  return textChannels.filter((channel) => {
    let permissions = guildPermissions;
    const overwrites = channel.permission_overwrites ?? [];

    permissions = applyOverwrite(
      permissions,
      overwrites.find((overwrite) => overwrite.id === guildId),
    );

    let roleAllow = 0n;
    let roleDeny = 0n;
    for (const overwrite of overwrites) {
      if (!isRoleOverwrite(overwrite) || !memberRoleIds.includes(overwrite.id)) continue;
      roleAllow |= parsePermissionBits(overwrite.allow);
      roleDeny |= parsePermissionBits(overwrite.deny);
    }
    permissions = (permissions & ~roleDeny) | roleAllow;

    permissions = applyOverwrite(
      permissions,
      overwrites.find(
        (overwrite) => isMemberOverwrite(overwrite) && overwrite.id === memberUserId,
      ),
    );

    return (permissions & REQUIRED_INVITE_PERMISSIONS) === REQUIRED_INVITE_PERMISSIONS;
  });
}

export function getInviteChannelCandidates(
  channels: DiscordInviteChannel[],
): DiscordInviteChannel[] {
  const textChannels = channels.filter((channel) => channel.type === 0);
  const exact: DiscordInviteChannel[] = [];
  const hinted: DiscordInviteChannel[] = [];
  const neutral: DiscordInviteChannel[] = [];
  const deprioritized: DiscordInviteChannel[] = [];

  for (const channel of textChannels) {
    const name = normalizeChannelName(channel.name);

    if (EXACT_PRIORITY_NAMES.includes(name as (typeof EXACT_PRIORITY_NAMES)[number])) {
      exact.push(channel);
      continue;
    }

    if (HINT_PRIORITY_FRAGMENTS.some((fragment) => name.includes(fragment))) {
      hinted.push(channel);
      continue;
    }

    if (DEPRIORITIZED_FRAGMENTS.some((fragment) => name.includes(fragment))) {
      deprioritized.push(channel);
      continue;
    }

    neutral.push(channel);
  }

  exact.sort(
    (a, b) =>
      EXACT_PRIORITY_NAMES.indexOf(
        normalizeChannelName(a.name) as (typeof EXACT_PRIORITY_NAMES)[number],
      ) -
      EXACT_PRIORITY_NAMES.indexOf(
        normalizeChannelName(b.name) as (typeof EXACT_PRIORITY_NAMES)[number],
      ),
  );
  hinted.sort(sortByName);
  neutral.sort(sortByName);
  deprioritized.sort(sortByName);

  return [...exact, ...hinted, ...neutral, ...deprioritized];
}
