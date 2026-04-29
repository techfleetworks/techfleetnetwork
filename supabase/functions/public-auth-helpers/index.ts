import { handleCors, jsonResponse, methodNotAllowed, parseJsonBody } from "../_shared/http.ts";
import { getAdminClient } from "../_shared/admin-client.ts";

type Action = "record_failed_login" | "validate_invitation" | "use_invitation";

interface Body {
  action?: unknown;
  email?: unknown;
  ip?: unknown;
  user_agent?: unknown;
  token?: unknown;
}

const EMAIL_PATTERN = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;
const IP_PATTERN = /^[A-Fa-f0-9:.]{3,64}$/;

function parseAction(value: unknown): Action | null {
  if (value === "record_failed_login" || value === "validate_invitation" || value === "use_invitation") {
    return value;
  }
  return null;
}

function cleanEmail(value: unknown): string | null {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!EMAIL_PATTERN.test(email) || email.length > 254) return null;
  return email;
}

function cleanToken(value: unknown): string | null {
  const token = typeof value === "string" ? value.trim() : "";
  return TOKEN_PATTERN.test(token) ? token : null;
}

function cleanIp(value: unknown): string | null {
  const ip = typeof value === "string" ? value.trim().slice(0, 64) : "";
  return ip && IP_PATTERN.test(ip) ? ip : null;
}

function cleanUserAgent(value: unknown): string | null {
  const ua = typeof value === "string" ? value.trim().slice(0, 200) : "";
  return ua || null;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return methodNotAllowed();

  let body: Body;
  try {
    body = await parseJsonBody(req, 4 * 1024) as Body;
  } catch (error) {
    return error instanceof Response ? error : jsonResponse({ error: "Invalid request" }, 400);
  }

  const action = parseAction(body.action);
  if (!action) return jsonResponse({ error: "Invalid action" }, 400);

  const admin = getAdminClient();

  if (action === "record_failed_login") {
    const email = cleanEmail(body.email);
    if (!email) return jsonResponse({ error: "Invalid email" }, 400);
    const { data, error } = await admin.rpc("record_failed_login", {
      _email: email,
      _ip: cleanIp(body.ip),
      _user_agent: cleanUserAgent(body.user_agent),
    });
    if (error) return jsonResponse({ error: "Unable to record failed login" }, 500);
    return jsonResponse({ data });
  }

  const token = cleanToken(body.token);
  if (!token) return jsonResponse({ error: "Invalid token" }, 400);

  if (action === "validate_invitation") {
    const { data, error } = await admin.rpc("validate_invitation", { p_token: token });
    if (error) return jsonResponse({ error: "Unable to validate invitation" }, 500);
    return jsonResponse({ data: Array.isArray(data) ? data : [] });
  }

  const { data, error } = await admin.rpc("use_invitation", { p_token: token });
  if (error) return jsonResponse({ error: "Unable to use invitation" }, 500);
  return jsonResponse({ data: data === true });
});
