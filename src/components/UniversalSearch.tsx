import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, GraduationCap, ClipboardList, Handshake } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";

/* ── Searchable item types ────────────────────────────────── */

interface SearchItem {
  id: string;
  label: string;
  description: string;
  href: string;
  group: "Courses" | "Applications" | "Project Training";
}

/* ── Static catalogue ─────────────────────────────────────── */

const SEARCH_ITEMS: SearchItem[] = [
  // ── Courses ────────────────────────────────────────────────
  {
    id: "course-onboarding",
    label: "Onboarding Steps",
    description:
      "Set up your profile, complete onboarding class, sign up for service leadership, and review the user guide.",
    href: "/courses/onboarding",
    group: "Courses",
  },
  {
    id: "course-agile",
    label: "Build an Agile Mindset",
    description:
      "Lessons covering agile philosophies, teamwork, and scrum methods.",
    href: "/courses/agile-mindset",
    group: "Courses",
  },
  {
    id: "course-teamwork",
    label: "Learn About Agile Teamwork",
    description:
      "Lessons from the Teammate Handbook covering team expectations, cross-functional work, and leadership.",
    href: "/courses/agile-teamwork",
    group: "Courses",
  },
  {
    id: "course-project-training",
    label: "Join Project Training Teams",
    description:
      "Lessons on how apprenticeship training works, working with nonprofit clients, and building case studies.",
    href: "/courses/project-training",
    group: "Courses",
  },
  {
    id: "course-volunteer",
    label: "Join Volunteer Teams",
    description:
      "Lessons on volunteering at Tech Fleet, team dynamics, and finding your volunteer role.",
    href: "/courses/volunteer-teams",
    group: "Courses",
  },

  // ── Applications ───────────────────────────────────────────
  {
    id: "app-general",
    label: "General Application",
    description:
      "Submit your general application to join Tech Fleet and become a member.",
    href: "/applications",
    group: "Applications",
  },
  {
    id: "app-project",
    label: "Project Applications",
    description:
      "Apply for available project training teams and apprenticeship cohorts.",
    href: "/applications",
    group: "Applications",
  },
  {
    id: "app-volunteer",
    label: "Volunteer Applications",
    description:
      "Apply to join volunteer teams and contribute to Tech Fleet operations.",
    href: "/applications",
    group: "Applications",
  },

  // ── Project Training ───────────────────────────────────────
  {
    id: "pt-landing",
    label: "Project Training Overview",
    description:
      "Hands-on training through real nonprofit projects and apprenticeship teams.",
    href: "/project-training",
    group: "Project Training",
  },
];

/* ── Helpers ──────────────────────────────────────────────── */

const GROUP_ICONS: Record<SearchItem["group"], React.ElementType> = {
  Courses: GraduationCap,
  Applications: ClipboardList,
  "Project Training": Handshake,
};

/**
 * Case-insensitive partial / wildcard match.
 * Supports `*` as a wildcard character.
 * Example: "agil*mind" matches "Build an Agile Mindset".
 */
function matchesQuery(text: string, query: string): boolean {
  if (!query) return true;
  const escaped = query
    .toLowerCase()
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&") // escape regex specials except *
    .replace(/\*/g, ".*"); // convert wildcard * → .*
  try {
    return new RegExp(escaped).test(text.toLowerCase());
  } catch {
    return text.toLowerCase().includes(query.toLowerCase());
  }
}

/* ── Component ────────────────────────────────────────────── */

export function UniversalSearch() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [query, setQuery] = useState("");

  // Keyboard shortcut: Ctrl/Cmd + K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return SEARCH_ITEMS;
    return SEARCH_ITEMS.filter(
      (item) =>
        matchesQuery(item.label, query) ||
        matchesQuery(item.description, query) ||
        matchesQuery(item.group, query)
    );
  }, [query]);

  const grouped = useMemo(() => {
    const groups: Record<string, SearchItem[]> = {};
    for (const item of filtered) {
      if (!groups[item.group]) groups[item.group] = [];
      groups[item.group].push(item);
    }
    return groups;
  }, [filtered]);

  const handleSelect = useCallback(
    (href: string) => {
      setOpen(false);
      setQuery("");
      navigate(href);
    },
    [navigate]
  );

  return (
    <>
      <Button
        variant="outline"
        size={isMobile ? "icon" : "default"}
        className={
          isMobile
            ? "h-9 w-9"
            : "relative h-9 w-full max-w-[300px] justify-start gap-2 text-sm text-muted-foreground"
        }
        onClick={() => setOpen(true)}
        aria-label="Search courses, applications, and project training"
      >
        <Search className="h-4 w-4 shrink-0" />
        {!isMobile && (
          <>
            <span className="hidden sm:inline-flex">Search…</span>
            <kbd className="pointer-events-none absolute right-[0.4rem] top-[0.4rem] hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
              <span className="text-xs">⌘</span>K
            </kbd>
          </>
        )}
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          placeholder="Search courses, applications, project training…"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          {Object.entries(grouped).map(([group, items]) => {
            const Icon = GROUP_ICONS[group as SearchItem["group"]];
            return (
              <CommandGroup key={group} heading={group}>
                {items.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={`${item.label} ${item.description}`}
                    onSelect={() => handleSelect(item.href)}
                    className="flex items-start gap-3 py-2.5"
                  >
                    <Icon
                      className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium text-foreground">
                        {item.label}
                      </span>
                      <span className="text-xs text-muted-foreground line-clamp-1">
                        {item.description}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            );
          })}
        </CommandList>
      </CommandDialog>
    </>
  );
}
