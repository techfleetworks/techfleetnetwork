import { useEffect, useMemo, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ensureLocale, dirFor } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

/**
 * Curated short list of languages we ship vetted bundles for.
 * Any other BCP-47 tag can still be selected via the search input — it will
 * be auto-translated on demand by the `translate-bundle` edge function.
 */
const FEATURED: Array<{ code: string; native: string }> = [
  { code: "en", native: "English" },
  { code: "es", native: "Español" },
  { code: "fr", native: "Français" },
  { code: "de", native: "Deutsch" },
  { code: "pt-BR", native: "Português (Brasil)" },
  { code: "it", native: "Italiano" },
  { code: "nl", native: "Nederlands" },
  { code: "pl", native: "Polski" },
  { code: "ar", native: "العربية" },
  { code: "he", native: "עברית" },
  { code: "zh-Hans", native: "简体中文" },
  { code: "zh-Hant", native: "繁體中文" },
  { code: "ja", native: "日本語" },
  { code: "ko", native: "한국어" },
  { code: "hi", native: "हिन्दी" },
  { code: "ru", native: "Русский" },
  { code: "tr", native: "Türkçe" },
  { code: "vi", native: "Tiếng Việt" },
  { code: "id", native: "Bahasa Indonesia" },
];

/** All BCP-47 tags Intl exposes to us, deduped + sorted by display name. */
function buildFullList(displayLocale: string): Array<{ code: string; native: string; display: string }> {
  const dn = new Intl.DisplayNames([displayLocale, "en"], { type: "language" });
  const seen = new Set<string>();
  const list: Array<{ code: string; native: string; display: string }> = [];
  // Browser-supplied tags vary; we union a sane base set.
  const base = [
    ...FEATURED.map((f) => f.code),
    "af","sq","am","hy","az","eu","be","bn","bs","bg","my","ca","hr","cs","da","et","fil","fi","gl","ka",
    "el","gu","ha","is","ig","ga","jv","kn","kk","km","rw","ky","lo","la","lv","lt","lb","mk","mg","ms",
    "ml","mt","mi","mr","mn","ne","no","nb","nn","or","ps","fa","pa","ro","sm","gd","sr","st","sn","sd",
    "si","sk","sl","so","su","sw","sv","tg","ta","tt","te","th","ti","ts","tk","uk","ur","ug","uz","cy",
    "xh","yi","yo","zu",
  ];
  for (const code of base) {
    if (seen.has(code)) continue;
    seen.add(code);
    let display = code;
    let native = code;
    try {
      display = dn.of(code) || code;
      const nativeDn = new Intl.DisplayNames([code, "en"], { type: "language" });
      native = nativeDn.of(code) || display;
    } catch {
      /* keep code */
    }
    list.push({ code, native, display });
  }
  list.sort((a, b) => a.display.localeCompare(b.display));
  return list;
}

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const current = i18n.language || "en";
  const list = useMemo(() => buildFullList(current), [current]);

  const handlePick = useCallback(
    async (code: string) => {
      setBusy(true);
      try {
        const ok = await ensureLocale(code, "common");
        await i18n.changeLanguage(code);
        // Mirror choice to localStorage (detector also does this) and to profile.
        try { localStorage.setItem("tf_lang", code); } catch { /* private mode */ }
        document.documentElement.lang = code;
        document.documentElement.dir = dirFor(code);
        if (user?.id) {
          await supabase
            .from("profiles")
            .update({ preferred_language: code })
            .eq("user_id", user.id);
        }
        toast.success(t("language.preferenceSaved"));
        if (!ok) toast.message(t("language.machineTranslated"));
      } finally {
        setBusy(false);
        setOpen(false);
      }
    },
    [i18n, t, user?.id],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={t("language.change")}
          disabled={busy}
          className="gap-2"
        >
          <Globe className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">{current}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="end">
        <Command>
          <CommandInput placeholder={t("language.search")} />
          <CommandList>
            <CommandEmpty>—</CommandEmpty>
            <CommandGroup heading={t("language.label")}>
              {list.map((entry) => (
                <CommandItem
                  key={entry.code}
                  value={`${entry.code} ${entry.display} ${entry.native}`}
                  onSelect={() => handlePick(entry.code)}
                >
                  <span lang={entry.code} className="font-medium">
                    {entry.native}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {entry.code}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
