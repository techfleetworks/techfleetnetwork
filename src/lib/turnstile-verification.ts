import { supabase } from "@/integrations/supabase/client";

type TurnstileAction = "login" | "register" | "forgot_password";

export async function verifyTurnstileToken(token: string, action: TurnstileAction): Promise<boolean> {
  if (!token.trim()) return false;

  const { data, error } = await supabase.functions.invoke<{ success: boolean; error?: string }>("verify-turnstile", {
    body: { token, action },
  });

  if (error) return false;
  return data?.success === true;
}