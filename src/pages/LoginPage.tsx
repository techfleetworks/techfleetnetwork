import { useState, useEffect, useRef, type FormEvent } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Mail, Lock } from "lucide-react";
import { AuthService } from "@/services/auth.service";
import { RateLimitService } from "@/services/rate-limit.service";
import { loginSchema } from "@/lib/validators/auth";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { toast } from "sonner";
import techFleetLogo from "@/assets/tech-fleet-logo.svg";
import { ValidatedField } from "@/components/ui/validated-field";
import { validationBorderClass, getFieldValidationState, showFormErrors, scrollToFirstError } from "@/lib/form-validation";
import { useQueryClient } from "@/lib/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MfaService } from "@/services/mfa.service";
import { MfaChallengeDialog } from "@/components/MfaChallengeDialog";
import { clearLoginCaptcha, getLoginCaptchaState, recordFailedLoginAttempt, refreshLoginCaptcha, verifyLoginCaptchaAnswer } from "@/lib/auth-captcha";
import { AuthCaptchaField } from "@/components/auth/AuthCaptchaField";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [captchaState, setCaptchaState] = useState(() => getLoginCaptchaState());
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [mfaOpen, setMfaOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const searchParams = new URLSearchParams(location.search);
  const redirectParam = searchParams.get("redirect");
  const fromState = (location.state as { from?: { pathname: string } })?.from?.pathname;
  const from = fromState || redirectParam || "/dashboard";

  const markTouched = (field: string) =>
    setTouched((prev) => ({ ...prev, [field]: true }));

  // Real-time validation
  useEffect(() => {
    if (Object.keys(touched).length === 0) return;
    const result = loginSchema.safeParse({ email, password });
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.issues.forEach((err) => {
        const field = err.path[0] as string;
        if (!fieldErrors[field]) fieldErrors[field] = err.message;
      });
      const touchedErrors: Record<string, string> = {};
      for (const [k, v] of Object.entries(fieldErrors)) {
        if (touched[k]) touchedErrors[k] = v;
      }
      setErrors(touchedErrors);
    } else {
      setErrors({});
    }
  }, [email, password, touched]);

  // Show toast for admin confirmation redirect (fires at most once per page load)
  const adminConfirmedHandledRef = useRef(false);
  useEffect(() => {
    if (adminConfirmedHandledRef.current) return;
    const params = new URLSearchParams(location.search);
    const adminConfirmed = params.get("admin_confirmed");
    if (!adminConfirmed) return;

    adminConfirmedHandledRef.current = true;
    queryClient.removeQueries({ queryKey: ["admin-role"] });

    if (adminConfirmed === "true") {
      toast.success("Admin Role successfully confirmed!");
    } else if (adminConfirmed === "already") {
      toast.info("Your admin role was already confirmed.");
    } else if (adminConfirmed === "error") {
      toast.error("Failed to confirm admin role. Please try again or contact support.");
    }

    // Strip the param from the URL via the navigation API so router state stays in sync
    params.delete("admin_confirmed");
    const nextSearch = params.toString();
    navigate(
      { pathname: location.pathname, search: nextSearch ? `?${nextSearch}` : "" },
      { replace: true },
    );
  }, [queryClient, location.search, location.pathname, navigate]);

  // Store redirect for OAuth flows
  useEffect(() => {
    if (from && from !== "/dashboard") {
      sessionStorage.setItem("auth_redirect", from);
    }
  }, [from]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched({ email: true, password: true });

    const result = loginSchema.safeParse({ email, password });
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.issues.forEach((err) => {
        const field = err.path[0] as string;
        if (!fieldErrors[field]) fieldErrors[field] = err.message;
      });
      setErrors(fieldErrors);
      showFormErrors(fieldErrors, { email: "Email", password: "Password" });
      scrollToFirstError();
      return;
    }
    if (!verifyLoginCaptchaAnswer(captchaAnswer)) {
      const nextCaptcha = refreshLoginCaptcha();
      setCaptchaState(nextCaptcha);
      setCaptchaAnswer("");
      setError("Complete the human verification before trying again.");
      return;
    }
    setErrors({});
    setError("");
    setLoading(true);

    try {
      const rateCheck = await RateLimitService.check(result.data.email, "login_attempt");
      if (!rateCheck.allowed) {
        const minutes = Math.ceil(rateCheck.retry_after / 60);
        setError(`Too many login attempts. Please try again in ${minutes} minute${minutes > 1 ? "s" : ""}.`);
        setLoading(false);
        return;
      }

      queryClient.removeQueries({ queryKey: ["admin-role"] });
      try {
        await AuthService.signInWithPassword(result.data.email, result.data.password);
        // Check if 2FA challenge is required (user has enrolled TOTP factors)
        const { needsChallenge } = await MfaService.getAssuranceLevel();
        if (needsChallenge) {
          setMfaOpen(true);
          setLoading(false);
          return;
        }
        clearLoginCaptcha();
        navigate(from, { replace: true });
      } catch (err: unknown) {
        const nextCaptcha = recordFailedLoginAttempt();
        setCaptchaState(nextCaptcha);
        setCaptchaAnswer("");
        // Record failed login for suspicious-activity detection (5+ in 15min auto-revokes sessions)
        try {
          await supabase.rpc("record_failed_login", {
            _email: result.data.email,
            _ip: null,
            _user_agent: navigator.userAgent.substring(0, 200),
          });
        } catch { /* non-blocking */ }
        throw err;
      }
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const bc = (field: string, value: string) =>
    validationBorderClass(getFieldValidationState(errors[field], value, !!touched[field]));

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-8 animate-fade-in">
        <div className="text-center">
          <img src={techFleetLogo} alt="" className="h-12 w-12 mx-auto mb-4 dark:invert" aria-hidden="true" />
          <h1 className="text-2xl font-bold text-foreground">Welcome back</h1>
          <p className="text-muted-foreground mt-1">Sign in to your Tech Fleet account</p>
        </div>

        <div className="card-elevated p-6 sm:p-8">
          {error && (
            <div className="mb-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm" role="alert">
              {error}
            </div>
          )}

          <GoogleSignInButton />

          <div className="mt-4 relative">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t" /></div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">Or continue with email</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5 mt-4" noValidate>
            <ValidatedField id="email" label="Email address" required error={errors.email} value={email} touched={touched.email}>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <Input id="email" type="email" inputMode="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} onBlur={() => markTouched("email")} className={`pl-10 ${bc("email", email)}`} autoComplete="email" required aria-required="true" aria-invalid={!!errors.email} />
              </div>
            </ValidatedField>

            <ValidatedField id="password" label="Password" required error={errors.password} value={password} touched={touched.password}>
              <div className="flex items-center justify-between mb-1.5">
                <span /> {/* spacer since label is in ValidatedField */}
                <Link to="/forgot-password" className="text-xs text-primary-text hover:underline">Forgot password?</Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <Input id="password" type={showPassword ? "text" : "password"} placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} onBlur={() => markTouched("password")} className={`pl-10 pr-10 ${bc("password", password)}`} autoComplete="current-password" required aria-required="true" aria-invalid={!!errors.password} />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex h-8 w-8 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={showPassword ? "Hide password" : "Show password"}>
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </ValidatedField>

            <AuthCaptchaField id="login-captcha" captchaState={captchaState} value={captchaAnswer} onChange={setCaptchaAnswer} />

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in…" : "Sign In"}
            </Button>
          </form>
        </div>

        <p className="text-center text-sm text-muted-foreground">
          New member?{" "}
          <Link to={from !== "/dashboard" ? `/register?redirect=${encodeURIComponent(from)}` : "/register"} className="text-primary-text font-medium hover:underline">Sign up</Link>
        </p>
      </div>

      <MfaChallengeDialog
        open={mfaOpen}
        onSuccess={() => { setMfaOpen(false); navigate(from, { replace: true }); }}
        onCancel={() => { setMfaOpen(false); setError("Sign-in cancelled. Please try again."); }}
      />
    </div>
  );
}
