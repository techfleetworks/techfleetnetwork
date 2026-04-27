import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { LoginCaptchaState } from "@/lib/auth-captcha";

type AuthCaptchaFieldProps = {
  id: string;
  captchaState: LoginCaptchaState;
  value: string;
  onChange: (value: string) => void;
};

export function AuthCaptchaField({ id, captchaState, value, onChange }: AuthCaptchaFieldProps) {
  const labelId = `${id}-label`;

  return (
    <div className="rounded-md border border-border bg-muted/40 p-3 space-y-2" role="group" aria-labelledby={labelId}>
      <Label id={labelId} htmlFor={id}>Human verification: what is {captchaState.question}?</Label>
      <Input
        id={id}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, 3))}
        autoComplete="off"
        required
        aria-required="true"
      />
    </div>
  );
}