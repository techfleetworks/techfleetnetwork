export type DiscordInviteChannel = {
  id: string;
  type: number;
  name?: string;
};

const EXACT_PRIORITY_NAMES = [
  "👋welcome",
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
  return (name ?? "").trim().toLowerCase();
}

function sortByName(a: DiscordInviteChannel, b: DiscordInviteChannel) {
  return normalizeChannelName(a.name).localeCompare(normalizeChannelName(b.name));
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
