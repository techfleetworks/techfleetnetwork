import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Eye, EyeOff, Mail, Lock, AlertCircle, CheckCircle2, User } from "lucide-react";
import { AuthService } from "@/services/auth.service";
import { registerSchema } from "@/lib/validators/auth";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import techFleetLogo from "@/assets/tech-fleet-logo.svg";

const passwordRequirements = [
  { label: "At least 8 characters", test: (p: string) => p.length >= 8 },
  { label: "One uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { label: "One lowercase letter", test: (p: string) => /[a-z]/.test(p) },
  { label: "One number", test: (p: string) => /[0-9]/.test(p) },
  { label: "One special character", test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

export default function RegisterPage() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const result = registerSchema.safeParse({ firstName, lastName, email, password, agreedToTerms });
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.issues.forEach((err) => {
        const field = err.path[0] as string;
        if (!fieldErrors[field]) fieldErrors[field] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setErrors({});
    setLoading(true);
    setAuthError("");

    try {
      await AuthService.signUp(
        result.data.email,
        result.data.password,
        result.data.firstName,
        result.data.lastName,
        window.location.origin + "/profile-setup"
      );
      setSubmitted(true);
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setLoading(false);
    }
  };

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

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="reg-firstName">First name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <Input id="reg-firstName" type="text" placeholder="Jane" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="pl-10" autoComplete="given-name" required aria-required="true" aria-invalid={!!errors.firstName} aria-describedby={errors.firstName ? "fn-error" : undefined} />
                </div>
                {errors.firstName && <p id="fn-error" className="text-sm text-destructive flex items-center gap-1" role="alert"><AlertCircle className="h-3 w-3" /> {errors.firstName}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="reg-lastName">Last name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <Input id="reg-lastName" type="text" placeholder="Doe" value={lastName} onChange={(e) => setLastName(e.target.value)} className="pl-10" autoComplete="family-name" required aria-required="true" aria-invalid={!!errors.lastName} aria-describedby={errors.lastName ? "ln-error" : undefined} />
                </div>
                {errors.lastName && <p id="ln-error" className="text-sm text-destructive flex items-center gap-1" role="alert"><AlertCircle className="h-3 w-3" /> {errors.lastName}</p>}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reg-email">Email address</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <Input id="reg-email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-10" autoComplete="email" required aria-required="true" aria-invalid={!!errors.email} aria-describedby={errors.email ? "email-error" : undefined} />
              </div>
              {errors.email && <p id="email-error" className="text-sm text-destructive flex items-center gap-1" role="alert"><AlertCircle className="h-3 w-3" /> {errors.email}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="reg-password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <Input id="reg-password" type={showPassword ? "text" : "password"} placeholder="Create a strong password" value={password} onChange={(e) => setPassword(e.target.value)} className="pl-10 pr-10" autoComplete="new-password" required aria-required="true" aria-invalid={!!errors.password} aria-describedby="password-requirements" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label={showPassword ? "Hide password" : "Show password"}>
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <ul id="password-requirements" className="space-y-1 text-xs" aria-label="Password requirements">
                {passwordRequirements.map(({ label, test }) => {
                  const met = password.length > 0 && test(password);
                  return (
                    <li key={label} className={`flex items-center gap-1.5 ${met ? "text-success" : "text-muted-foreground"}`}>
                      {met ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
                      {label}
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="flex items-start gap-2">
              <Checkbox id="terms" checked={agreedToTerms} onCheckedChange={(checked) => setAgreedToTerms(checked === true)} aria-required="true" aria-invalid={!!errors.agreedToTerms} />
              <Label htmlFor="terms" className="text-sm leading-relaxed">
                I agree to the <a href="#" className="text-primary hover:underline">Terms of Service</a> and <a href="#" className="text-primary hover:underline">Community Guidelines</a>
              </Label>
            </div>
            {errors.agreedToTerms && <p className="text-sm text-destructive flex items-center gap-1" role="alert"><AlertCircle className="h-3 w-3" /> {errors.agreedToTerms}</p>}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Creating account…" : "Create Account"}
            </Button>
          </form>

          <div className="mt-4 relative">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t" /></div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
            </div>
          </div>

          <GoogleSignInButton className="mt-4" label="Sign up with Google" />
        </div>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link to="/login" className="text-primary font-medium hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}

function Circle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}
