// Skills & Practices Framework tab — Overview / Browse sub-views.
// Backed by the per-entity reference_* tables.
import { useState } from "react";
import { Loader2, BookOpen, Compass } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  FRAMEWORK_LABELS,
  FRAMEWORK_DEFINITIONS,
  FRAMEWORK_GROUPS,
  FRAMEWORK_TO_REFERENCE,
  type FrameworkEntity,
} from "@/services/framework.service";
import { listReference, type ReferenceItem } from "@/services/reference.service";

export default function SkillsPracticesTab() {
  const [sub, setSub] = useState("overview");

  return (
    <div className="space-y-6">
      <Tabs value={sub} onValueChange={setSub} className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview"><Compass className="h-4 w-4 mr-1.5" />Overview</TabsTrigger>
          <TabsTrigger value="browse"><BookOpen className="h-4 w-4 mr-1.5" />Browse</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewView onNavigate={setSub} />
        </TabsContent>

        <TabsContent value="browse">
          <BrowseView />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------- Overview sub-view ----------
function OverviewView({ onNavigate }: { onNavigate: (sub: string) => void }) {
  return (
    <div className="space-y-6 max-w-4xl">
      <header className="space-y-2">
        <h2 className="text-2xl font-semibold text-foreground">
          The Skills &amp; Practices Framework
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Tech Fleet&apos;s open-source taxonomy of team-based problem solving — a shared
          language for what it actually takes to succeed on empowered teams.
        </p>
      </header>

      <Card className="p-5 space-y-3">
        <h3 className="text-base font-semibold text-foreground">What are team practices?</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          <strong className="text-foreground">Team practices are shared beliefs and behaviors</strong>{" "}
          that teammates hold while working together. Skills and experience aren&apos;t enough
          to succeed — even highly skilled experts can join a team and fail at working with
          others. Practices are how empowered teams act, not just what they know. Tech Fleet
          tracks seven core practices:
        </p>
        <ul className="grid sm:grid-cols-2 gap-x-4 gap-y-1.5 text-sm text-foreground">
          <li><strong>Empowerment</strong> — building power in others</li>
          <li><strong>Service Leadership</strong> — supporting others&apos; growth</li>
          <li><strong>Psychological Safety</strong> — fostering belonging and challenge</li>
          <li><strong>Continuous Improvement</strong> — incremental growth</li>
          <li><strong>Decision Making</strong> — building consensus</li>
          <li><strong>Ownership</strong> — taking and transferring ownership</li>
          <li><strong>Agility</strong> — adaptation and nimbleness</li>
        </ul>
      </Card>

      <Card className="p-5 space-y-3">
        <h3 className="text-base font-semibold text-foreground">
          The other components of empowered team success
        </h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Practices sit alongside 12 other framework concepts that describe how teams learn,
          work, and grow. Together they form a single connected ontology:
        </p>
        <div className="grid sm:grid-cols-3 gap-3 text-sm">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Foundational</p>
            <ul className="space-y-0.5 text-foreground">
              <li>Technical &amp; Interpersonal Skills</li>
              <li>Team Practices</li>
              <li>Activities</li>
              <li>Job Duties</li>
              <li>Deliverables</li>
            </ul>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Project Context</p>
            <ul className="space-y-0.5 text-foreground">
              <li>Project Milestones</li>
              <li>Projects</li>
              <li>Tools</li>
              <li>Stakeholders</li>
            </ul>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Career Context</p>
            <ul className="space-y-0.5 text-foreground">
              <li>Specializations</li>
              <li>Job Titles</li>
              <li>Roles</li>
              <li>Resources</li>
            </ul>
          </div>
        </div>
      </Card>

      <Card className="p-5 space-y-3">
        <h3 className="text-base font-semibold text-foreground">
          What is this data used for in Tech Fleet?
        </h3>
        <ul className="space-y-2 text-sm text-foreground list-disc list-inside marker:text-primary">
          <li><strong>Standardize training:</strong> onboarding, user guides, agile coaching, and templates all use the same vocabulary.</li>
          <li><strong>Measure readiness:</strong> assess and track skills, beliefs, and behaviors over time.</li>
          <li><strong>Match talent to projects:</strong> connect members to training and paid work that fits their growth path.</li>
          <li><strong>Power Fleety:</strong> Tech Fleet&apos;s assistant uses framework relationships to answer questions about what&apos;s needed for any role.</li>
        </ul>
      </Card>

      <Card className="p-5 space-y-3">
        <h3 className="text-base font-semibold text-foreground">
          What can I do in this section of Resources?
        </h3>
        <ul className="space-y-2 text-sm text-foreground">
          <li>
            <button
              type="button"
              onClick={() => onNavigate("browse")}
              className="font-semibold text-primary hover:underline"
            >
              Browse
            </button>{" "}
            — explore every entity (skills, practices, activities, duties, deliverables, tools, projects, milestones, stakeholders, specializations, job titles, roles, and resources). Search and filter within each.
          </li>
        </ul>
      </Card>

      <Card className="p-4 bg-muted/30 border-dashed">
        <p className="text-xs text-muted-foreground leading-relaxed">
          Read more from Tech Fleet:{" "}
          <a
            href="https://techfleet.medium.com/practices-the-invisible-components-that-drive-empowered-teamwork-5ee345fc10bd"
            target="_blank"
            rel="noopener noreferrer"
            className="underline text-primary hover:text-primary/80"
          >
            Practices: The Invisible Components
          </a>
          {" · "}
          <a
            href="https://techfleet.medium.com/a-comprehensive-tech-skills-information-architecture-for-new-grads-and-career-changers-57a9b747582d"
            target="_blank"
            rel="noopener noreferrer"
            className="underline text-primary hover:text-primary/80"
          >
            Tech Skills Information Architecture
          </a>
          {" · "}
          <a
            href="https://techfleet.medium.com/how-might-we-make-tech-fleet-talent-more-marketable-43ff3723c3ed"
            target="_blank"
            rel="noopener noreferrer"
            className="underline text-primary hover:text-primary/80"
          >
            Making Tech Fleet Talent More Marketable
          </a>
        </p>
      </Card>
    </div>
  );
}

// ---------- Browse sub-view ----------
function BrowseView() {
  const [selected, setSelected] = useState<FrameworkEntity>("skills");
  const [search, setSearch] = useState("");

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
      <ScrollArea className="lg:max-h-[60vh] lg:pr-2">
        <nav className="space-y-4" aria-label="Framework entities">
          {FRAMEWORK_GROUPS.map((g) => (
            <div key={g.label}>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                {g.label}
              </h3>
              <ul className="space-y-1">
                {g.entities.map((e) => (
                  <li key={e}>
                    <button
                      type="button"
                      onClick={() => setSelected(e)}
                      aria-pressed={selected === e}
                      className={`w-full text-left text-sm px-3 py-2 rounded-md transition-colors ${
                        selected === e
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-muted text-foreground"
                      }`}
                    >
                      {FRAMEWORK_LABELS[e]}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </ScrollArea>

      <div className="space-y-4 min-w-0">
        <header>
          <h2 className="text-xl font-semibold text-foreground">{FRAMEWORK_LABELS[selected]}</h2>
          <p className="text-sm text-muted-foreground mt-1">{FRAMEWORK_DEFINITIONS[selected]}</p>
        </header>
        <Input
          placeholder={`Search ${FRAMEWORK_LABELS[selected]}…`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label={`Search ${FRAMEWORK_LABELS[selected]}`}
        />
        <EntityList entity={selected} search={search} />
      </div>
    </div>
  );
}

function EntityList({ entity, search }: { entity: FrameworkEntity; search: string }) {
  const refEntity = FRAMEWORK_TO_REFERENCE[entity];
  const q = useQuery<ReferenceItem[]>({
    queryKey: ["reference", refEntity],
    queryFn: () => listReference(refEntity),
    staleTime: 1000 * 60 * 60 * 24,
  });

  if (q.isLoading) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
  if (q.isError)
    return <p className="text-sm text-destructive">Failed to load. Try again later.</p>;

  const items = (q.data ?? []).filter((i) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return i.name.toLowerCase().includes(s) || i.description.toLowerCase().includes(s);
  });

  if (items.length === 0) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        No items to display yet. Please check back soon.
      </Card>
    );
  }

  return (
    <>
      <p className="text-xs text-muted-foreground">{items.length} item{items.length === 1 ? "" : "s"}</p>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {items.map((i) => (
          <li key={i.id}>
            <Card className="p-3 h-full">
              <div className="flex items-start justify-between gap-2 mb-1">
                <h4 className="text-sm font-medium text-foreground">{i.name}</h4>
                {i.category && <Badge variant="outline" className="text-xs shrink-0">{i.category}</Badge>}
              </div>
              {i.description && (
                <p className="text-xs text-muted-foreground line-clamp-3">{i.description}</p>
              )}
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}
