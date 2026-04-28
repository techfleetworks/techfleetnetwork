import { supabase } from "@/integrations/supabase/client";
import { markLoginCaptchaVerified } from "@/lib/auth-captcha";

type TurnstileAction = "login" | "register" | "forgot_password" | "signup_confirmation_resend";

export async function verifyTurnstileToken(token: string, action: TurnstileAction): Promise<boolean> {
  if (!token.trim()) return false;

  const { data, error } = await supabase.functions.invoke<{ success: boolean; error?: string }>("verify-turnstile", {
    body: { token, action },
  });

  if (error || data?.success !== true) return false;
  markLoginCaptchaVerified();
  return true;
}