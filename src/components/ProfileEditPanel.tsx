import { useState, useEffect, type FormEvent } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertCircle, User, Globe, MessageCircle, Check, ChevronsUpDown, Mail } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { profileSchema } from "@/lib/validators/profile";
import { ProfileService } from "@/services/profile.service";
import { COUNTRIES } from "@/lib/countries";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface ProfileEditPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProfileEditPanel({ open, onOpenChange }: ProfileEditPanelProps) {
  const { user, profile, refreshProfile } = useAuth();
  const [form, setForm] = useState({ firstName: "", lastName: "", country: "", discordUsername: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [countryOpen, setCountryOpen] = useState(false);

  // Sync form state when panel opens or profile changes
  useEffect(() => {
    if (open && profile) {
      setForm({
        firstName: profile.first_name || "",
        lastName: profile.last_name || "",
        country: profile.country || "",
        discordUsername: profile.discord_username || "",
      });
      setErrors({});
    }
  }, [open, profile]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const result = profileSchema.safeParse(form);
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
    setSaving(true);

    try {
      await ProfileService.update(user!.id, result.data);
      await refreshProfile();
      toast.success("Profile updated successfully");
      onOpenChange(false);
    } catch (err: any) {
      setErrors({ general: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl flex flex-col p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b">
          <SheetTitle className="text-xl">Edit Profile</SheetTitle>
          <SheetDescription>
            Update your profile information below.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 px-6 py-4">
          <form id="profile-edit-form" onSubmit={handleSubmit} className="space-y-5" noValidate>
            {errors.general && (
              <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm" role="alert">
                {errors.general}
              </div>
            )}

            {/* Email (read-only) */}
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <Input
                  id="edit-email"
                  value={profile?.email || user?.email || ""}
                  readOnly
                  disabled
                  className="pl-10 bg-muted/50"
                />
              </div>
              <p className="text-xs text-muted-foreground">Email cannot be changed here.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-firstName">First name</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <Input
                  id="edit-firstName"
                  value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                  placeholder="Jane"
                  className="pl-10"
                  required
                  aria-required="true"
                  aria-invalid={!!errors.firstName}
                  aria-describedby={errors.firstName ? "edit-fn-error" : undefined}
                />
              </div>
              {errors.firstName && (
                <p id="edit-fn-error" className="text-sm text-destructive flex items-center gap-1" role="alert">
                  <AlertCircle className="h-3 w-3" /> {errors.firstName}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-lastName">Last name</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <Input
                  id="edit-lastName"
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                  placeholder="Doe"
                  className="pl-10"
                  required
                  aria-required="true"
                  aria-invalid={!!errors.lastName}
                  aria-describedby={errors.lastName ? "edit-ln-error" : undefined}
                />
              </div>
              {errors.lastName && (
                <p id="edit-ln-error" className="text-sm text-destructive flex items-center gap-1" role="alert">
                  <AlertCircle className="h-3 w-3" /> {errors.lastName}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Country</Label>
              <Popover open={countryOpen} onOpenChange={setCountryOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={countryOpen}
                    className={cn("w-full justify-between pl-10 relative font-normal", !form.country && "text-muted-foreground")}
                    aria-invalid={!!errors.country}
                    aria-describedby={errors.country ? "edit-co-error" : undefined}
                  >
                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    {form.country || "Select a country"}
                    <ChevronsUpDown className="ml-auto h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search countries..." />
                    <CommandList>
                      <CommandEmpty>No country found.</CommandEmpty>
                      <CommandGroup>
                        {COUNTRIES.map((c) => (
                          <CommandItem
                            key={c.code}
                            value={c.name}
                            onSelect={() => {
                              setForm({ ...form, country: c.name });
                              setCountryOpen(false);
                            }}
                          >
                            <Check className={cn("mr-2 h-4 w-4", form.country === c.name ? "opacity-100" : "opacity-0")} />
                            {c.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {errors.country && (
                <p id="edit-co-error" className="text-sm text-destructive flex items-center gap-1" role="alert">
                  <AlertCircle className="h-3 w-3" /> {errors.country}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-discordUsername">Discord username</Label>
              <div className="relative">
                <MessageCircle className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <Input
                  id="edit-discordUsername"
                  value={form.discordUsername}
                  onChange={(e) => setForm({ ...form, discordUsername: e.target.value })}
                  placeholder="username"
                  className="pl-10"
                  required
                  aria-required="true"
                  aria-invalid={!!errors.discordUsername}
                  aria-describedby={errors.discordUsername ? "edit-dc-error" : undefined}
                />
              </div>
              {errors.discordUsername && (
                <p id="edit-dc-error" className="text-sm text-destructive flex items-center gap-1" role="alert">
                  <AlertCircle className="h-3 w-3" /> {errors.discordUsername}
                </p>
              )}
            </div>
          </form>
        </ScrollArea>

        <div className="border-t px-6 py-4">
          <Button form="profile-edit-form" type="submit" className="w-full" disabled={saving}>
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
