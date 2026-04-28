import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { extractBearerToken, getUserClient } from "./admin-client.ts";
import { jsonResponse } from "./http.ts";

export interface AuthenticatedRequestContext {
  authHeader: string;
  token: string;
  userId: string;
  userClient: SupabaseClient;
}

export async function requireAuthenticatedRequest(req: Request): Promise<AuthenticatedRequestContext | Response> {
  const token = extractBearerToken(req);
  if (!token) return jsonResponse({ error: "Unauthorized" }, 401);

  const authHeader = `Bearer ${token}`;
  const userClient = getUserClient(authHeader);
  const { data, error } = await userClient.auth.getClaims(token);
  const userId = data?.claims?.sub;

  if (error || !userId) return jsonResponse({ error: "Unauthorized" }, 401);
  return { authHeader, token, userId, userClient };
}