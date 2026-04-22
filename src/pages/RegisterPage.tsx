import { useState, useEffect, type FormEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Mail, Lock, CheckCircle2, User } from "lucide-react";
import { AuthService } from "@/services/auth.service";
import { RateLimitService } from "@/services/rate-limit.service";
import { registerSchema } from "@/lib/validators/auth";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import techFleetLogo from "@/assets/tech-fleet-logo.svg";
import { PasswordRequirementsList } from "@/components/registration/PasswordRequirementsList";
import { ValidatedField } from "@/components/ui/validated-field";
import { validationBorderClass, getFieldValidationState, showFormErrors, scrollToFirstError } from "@/lib/form-validation";
import { logAccountActivity } from "@/lib/account-activity";

export default function RegisterPage() {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const redirectParam = searchParams.get("redirect");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  const markTouched = (field: string) =>
    setTouched((prev) => ({ ...prev, [field]: true }));

  // Real-time validation on change
  useEffect(() => {
    if (Object.keys(touched).length === 0) return;
    const result = registerSchema.safeParse({ firstName, lastName, email, password, confirmPassword, agreedToTerms });
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.issues.forEach((err) => {
        const field = err.path[0] as string;
        if (!fieldErrors[field]) fieldErrors[field] = err.message;
      });
      // Only show errors for touched fields
      const touchedErrors: Record<string, string> = {};
      for (const [k, v] of Object.entries(fieldErrors)) {
        if (touched[k]) touchedErrors[k] = v;
      }
      setErrors(touchedErrors);
    } else {
      setErrors({});
    }
  }, [firstName, lastName, email, password, confirmPassword, agreedToTerms, touched]);

  useEffect(() => {
    if (redirectParam) {
      sessionStorage.setItem("auth_redirect", redirectParam);
    }
  }, [redirectParam]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    // Mark all fields as touched
    const allTouched: Record<string, boolean> = {
      firstName: true, lastName: true, email: true,
      password: true, confirmPassword: true, agreedToTerms: true,
    };
    setTouched(allTouched);

    const result = registerSchema.safeParse({ firstName, lastName, email, password, confirmPassword, agreedToTerms });
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.issues.forEach((err) => {
        const field = err.path[0] as string;
        if (!fieldErrors[field]) fieldErrors[field] = err.message;
      });
      setErrors(fieldErrors);
      void logAccountActivity("signup_validation_failed", {
        email: email || null,
        details: { failedFields: Object.keys(fieldErrors).join(",") },
      });
      showFormErrors(fieldErrors, {
        firstName: "First name", lastName: "Last name", email: "Email",
        password: "Password", confirmPassword: "Confirm password", agreedToTerms: "Terms agreement",
      });
      scrollToFirstError();
      return;
    }

    setErrors({});
    setLoading(true);
    setAuthError("");

    try {
      const rateCheck = await RateLimitService.check(result.data.email, "signup_attempt");
      if (!rateCheck.allowed) {
        const minutes = Math.ceil(rateCheck.retry_after / 60);
        void logAccountActivity("signup_rate_limited", {
          email: result.data.email,
          details: { retryAfterSec: rateCheck.retry_after },
        });
        setAuthError(`Too many signup attempts. Please try again in ${minutes} minute${minutes > 1 ? "s" : ""}.`);
        setLoading(false);
        return;
      }

      await AuthService.signUp(
        result.data.email,
        result.data.password,
        result.data.firstName,
        result.data.lastName,
        window.location.origin + (redirectParam ? redirectParam : "/profile-setup")
      );
      setSubmitted(true);
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const vs = (field: string, value: string | boolean) =>
    getFieldValidationState(errors[field], value, !!touched[field]);
  const bc = (field: string, value: string | boolean) =>
    validationBorderClass(vs(field, value));

  if (submitted) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md text-center animate-fade-in card-elevated p-8">
          <CheckCircle2 className="h-16 w-16 text-success mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-foreground mb-2">Check your email</h1>
          <p className="text-muted-foreground">
            We've sent a verification link to <strong className="text-foreground">{email}</strong>. Click the link to verify your account and get started.
          </p>
          <Link to="/login" className="inline-block mt-6"><Button variant="outline">Go to Sign In</Button></Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-8 animate-fade-in">
        <div className="text-center">
          <img src={techFleetLogo} alt="" className="h-12 w-12 mx-auto mb-4 dark:invert" aria-hidden="true" />
          <h1 className="text-2xl font-bold text-foreground">Join Tech Fleet</h1>
          <p className="text-muted-foreground mt-1">Create your account and start your journey</p>
        </div>

        <div className="card-elevated p-6 sm:p-8">
          {authError && (
            <div className="mb-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm" role="alert">{authError}</div>
          )}

          <GoogleSignInButton label="Sign up with Google" />

          <div className="mt-4 relative">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t" /></div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">Or continue with email</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5 mt-4" noValidate>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <ValidatedField id="reg-firstName" label="First name" required error={errors.firstName} value={firstName} touched={touched.firstName}>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <Input id="reg-firstName" type="text" placeholder="Jane" value={firstName} onChange={(e) => setFirstName(e.target.value)} onBlur={() => markTouched("firstName")} className={`pl-10 ${bc("firstName", firstName)}`} autoComplete="given-name" required aria-required="true" aria-invalid={!!errors.firstName} aria-describedby={errors.firstName ? "reg-firstName-error" : undefined} />
                </div>
              </ValidatedField>

              <ValidatedField id="reg-lastName" label="Last name" required error={errors.lastName} value={lastName} touched={touched.lastName}>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <Input id="reg-lastName" type="text" placeholder="Doe" value={lastName} onChange={(e) => setLastName(e.target.value)} onBlur={() => markTouched("lastName")} className={`pl-10 ${bc("lastName", lastName)}`} autoComplete="family-name" required aria-required="true" aria-invalid={!!errors.lastName} aria-describedby={errors.lastName ? "reg-lastName-error" : undefined} />
                </div>
              </ValidatedField>
            </div>

            <ValidatedField id="reg-email" label="Email address" required error={errors.email} value={email} touched={touched.email}>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <Input id="reg-email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} onBlur={() => markTouched("email")} className={`pl-10 ${bc("email", email)}`} autoComplete="email" required aria-required="true" aria-invalid={!!errors.email} aria-describedby={errors.email ? "reg-email-error" : undefined} />
              </div>
            </ValidatedField>

            <ValidatedField id="reg-password" label="Password" required error={errors.password} value={password} touched={touched.password}>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <Input id="reg-password" type={showPassword ? "text" : "password"} placeholder="Create a strong password" value={password} onChange={(e) => setPassword(e.target.value)} onBlur={() => markTouched("password")} className={`pl-10 pr-10 ${bc("password", password)}`} autoComplete="new-password" required aria-required="true" aria-invalid={!!errors.password} aria-describedby="password-requirements" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex h-8 w-8 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={showPassword ? "Hide password" : "Show password"}>
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <PasswordRequirementsList password={password} />
            </ValidatedField>

            <ValidatedField id="reg-confirmPassword" label="Confirm password" required error={errors.confirmPassword} value={confirmPassword} touched={touched.confirmPassword}>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <Input id="reg-confirmPassword" type={showConfirmPassword ? "text" : "password"} placeholder="Re-enter your password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} onBlur={() => markTouched("confirmPassword")} className={`pl-10 pr-10 ${bc("confirmPassword", confirmPassword)}`} autoComplete="new-password" required aria-required="true" aria-invalid={!!errors.confirmPassword} aria-describedby={errors.confirmPassword ? "reg-confirmPassword-error" : undefined} />
                <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex h-8 w-8 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}>
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </ValidatedField>

            <div className="flex items-start gap-2">
              <Checkbox id="terms" checked={agreedToTerms} onCheckedChange={(checked) => { setAgreedToTerms(checked === true); markTouched("agreedToTerms"); }} aria-required="true" aria-invalid={!!errors.agreedToTerms} />
              <Label htmlFor="terms" className="text-sm leading-relaxed">
                I agree to the <a href="#" className="text-primary-text hover:underline">Terms of Service</a> and <a href="#" className="text-primary-text hover:underline">Community Guidelines</a>
              </Label>
            </div>
            {errors.agreedToTerms && <p className="text-sm text-destructive flex items-center gap-1" role="alert"><span className="h-3 w-3 shrink-0">⚠</span> {errors.agreedToTerms}</p>}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Creating account…" : "Create Account"}
            </Button>
          </form>
        </div>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link to={redirectParam ? `/login?redirect=${encodeURIComponent(redirectParam)}` : "/login"} className="text-primary-text font-medium hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
