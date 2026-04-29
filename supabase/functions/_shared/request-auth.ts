import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  extractBearerToken,
  getAdminClient,
  getUserClient,
} from "./admin-client.ts";
import { jsonResponse } from "./http.ts";

export interface AuthenticatedRequestContext {
  authHeader: string;
  token: string;
  userId: string;
  userClient: SupabaseClient;
}

export async function requireAuthenticatedRequest(
  req: Request,
): Promise<AuthenticatedRequestContext | Response> {
  const token = extractBearerToken(req);
  if (!token) return jsonResponse({ error: "Unauthorized" }, 401);

  const authHeader = `Bearer ${token}`;
  const userClient = getUserClient(authHeader);
  const { data, error } = await userClient.auth.getClaims(token);
  const userId = data?.claims?.sub;

  if (error || !userId) return jsonResponse({ error: "Unauthorized" }, 401);
  return { authHeader, token, userId, userClient };
}

export async function requireAdminRequest(
  req: Request,
): Promise<AuthenticatedRequestContext | Response> {
  const auth = await requireAuthenticatedRequest(req);
  if (auth instanceof Response) return auth;

  const { data, error } = await getAdminClient().rpc("has_role", {
    _user_id: auth.userId,
    _role: "admin",
  });

  if (error) {
    console.error(
      JSON.stringify({ level: "error", action: "admin_authorization_check" }),
    );
    return jsonResponse({ error: "Unable to verify authorization" }, 500);
  }

  return data === true ? auth : jsonResponse({ error: "Forbidden" }, 403);
}
