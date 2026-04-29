export interface NotifyPayload {
  event:
    | "user_signed_up"
    | "profile_completed"
    | "task_completed"
    | "phase_completed"
    | "class_registered"
    | "application_submitted"
    | "project_applied"
    | "feedback_submitted"
    | "resource_explored"
    | "discord_verified";
  display_name?: string;
  discord_username?: string;
  discord_user_id?: string;
  task_name?: string;
  phase_name?: string;
  class_name?: string;
  country?: string;
  project_name?: string;
  application_type?: string;
  feedback_area?: string;
  search_query?: string;
}

export const VALID_EVENTS = new Set<NotifyPayload["event"]>([
  "user_signed_up",
  "profile_completed",
  "task_completed",
  "phase_completed",
  "class_registered",
  "application_submitted",
  "project_applied",
  "feedback_submitted",
  "resource_explored",
  "discord_verified",
]);

const TEXT_FIELD_MAX = 140;
const SEARCH_QUERY_MAX = 200;
const DISCORD_SNOWFLAKE_RE = /^\d{5,30}$/;
const OPTIONAL_TEXT_FIELDS: Array<keyof NotifyPayload> = [
  "display_name",
  "discord_username",
  "task_name",
  "phase_name",
  "class_name",
  "country",
  "project_name",
  "application_type",
  "feedback_area",
  "search_query",
];

export function sanitizeDiscordText(value: unknown, maxLength = TEXT_FIELD_MAX): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/@/g, "@\u200b")
    .replace(/[`*_~|>\\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
  return clean || undefined;
}

export function validateNotifyPayload(raw: unknown): { ok: true; payload: NotifyPayload } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "Invalid payload" };
  const input = raw as Record<string, unknown>;
  const event = input.event;
  if (typeof event !== "string" || !VALID_EVENTS.has(event as NotifyPayload["event"])) {
    return { ok: false, error: "Missing event" };
  }

  const payload: NotifyPayload = { event: event as NotifyPayload["event"] };
  for (const field of OPTIONAL_TEXT_FIELDS) {
    const max = field === "search_query" ? SEARCH_QUERY_MAX : TEXT_FIELD_MAX;
    const sanitized = sanitizeDiscordText(input[field], max);
    if (sanitized) payload[field] = sanitized as never;
  }

  const discordUserId = typeof input.discord_user_id === "string" ? input.discord_user_id.trim() : "";
  if (DISCORD_SNOWFLAKE_RE.test(discordUserId)) payload.discord_user_id = discordUserId;

  return { ok: true, payload };
}

export function buildActionText(payload: NotifyPayload): string {
  switch (payload.event) {
    case "user_signed_up":
      return "Signed up to Tech Fleet Network 🎉";
    case "profile_completed":
      return `Completed their profile setup${payload.country ? ` (🌍 ${payload.country})` : ""} ✅`;
    case "task_completed":
      return `Completed task: ${payload.task_name || "a task"} 📋`;
    case "phase_completed":
      return `Completed all tasks in ${payload.phase_name || "a phase"} 🏆🚀`;
    case "class_registered":
      return `Registered for ${payload.class_name || "a class"} 📚`;
    case "application_submitted":
      return `Submitted their ${payload.application_type || "General"} Application 📝`;
    case "project_applied":
      return `Applied to project: ${payload.project_name || "a project"} 🚀`;
    case "feedback_submitted":
      return `Submitted feedback about ${payload.feedback_area || "the platform"} 💬`;
    case "resource_explored":
      return `Explored resources: "${payload.search_query || "a topic"}" 🔍`;
    case "discord_verified":
      return "has verified their Discord account from the Tech Fleet Network Platform ✅🔗";
  }
}

export function buildMessage(payload: NotifyPayload): string {
  let userTag: string;
  if (payload.discord_user_id) {
    userTag = `<@${payload.discord_user_id}>`;
  } else if (payload.discord_username) {
    userTag = `**@${payload.discord_username.replace(/^@\u200b?/, "")}**`;
  } else {
    userTag = `**${payload.display_name || "A member"}**`;
  }

  const action = buildActionText(payload);
  return `${userTag} just did the following in Tech Fleet Network: **${action}**`;
}