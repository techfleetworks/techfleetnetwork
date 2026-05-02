// Skills & Practices Framework tab — Browse / Map / Relationships sub-views.
// Backed by reference_relationships and the per-entity reference_* tables.
import { lazy, Suspense, useMemo, useState } from "react";
import { Loader2, Network, BookOpen, GitBranch } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  FRAMEWORK_ENTITIES,
  FRAMEWORK_LABELS,
  FRAMEWORK_DEFINITIONS,
  FRAMEWORK_GROUPS,
  FRAMEWORK_TO_REFERENCE,
  type FrameworkEntity,
} from "@/services/framework.service";
import { listReference, type ReferenceItem } from "@/services/reference.service";
import { useFrameworkRelationships } from "@/hooks/use-framework";

const MapView = lazy(() => import("./skills-practices/MapView"));

export default function SkillsPracticesTab() {
  const [sub, setSub] = useState("browse");
  const rels = useFrameworkRelationships();

  return (
    <div className="space-y-6">
      <Card className="p-4 bg-muted/30 border-dashed">
        <p className="text-sm text-muted-foreground leading-relaxed">
          The <strong className="text-foreground">Skills & Practices Framework</strong> connects
          13 concepts that describe how Tech Fleet members learn, work, and grow.
          Browse the data, see the visual map of how each concept connects, or read the
          two-way relationships between any two pieces. Read the vision in the{" "}
          <a
            href="https://techfleet.medium.com/how-might-we-make-tech-fleet-talent-more-marketable-43ff3723c3ed"
            target="_blank"
            rel="noopener noreferrer"
            className="underline text-primary hover:text-primary/80"
          >
            Tech Fleet Medium article
          </a>.
        </p>
      </Card>

      <Tabs value={sub} onValueChange={setSub} className="space-y-4">
        <TabsList>
          <TabsTrigger value="browse"><BookOpen className="h-4 w-4 mr-1.5" />Browse</TabsTrigger>
          <TabsTrigger value="map"><Network className="h-4 w-4 mr-1.5" />Map</TabsTrigger>
          <TabsTrigger value="relationships"><GitBranch className="h-4 w-4 mr-1.5" />Relationships</TabsTrigger>
        </TabsList>

        <TabsContent value="browse">
          <BrowseView />
        </TabsContent>

        <TabsContent value="map">
          <Suspense fallback={<Loader2 className="h-6 w-6 animate-spin mx-auto my-12 text-muted-foreground" />}>
            <MapView relationships={rels.data ?? []} loading={rels.isLoading} />
          </Suspense>
        </TabsContent>

        <TabsContent value="relationships">
          <RelationshipsView />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------- Browse sub-view ----------
function BrowseView() {
  const [selected, setSelected] = useState<FrameworkEntity>("skills");
  const [search, setSearch] = useState("");

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
      {/* Entity rail */}
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

      {/* Entity contents */}
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
        No items yet. Admins can populate this table at{" "}
        <a href="/admin/ingest" className="underline text-primary">/admin/ingest</a>.
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

// ---------- Relationships sub-view ----------
function RelationshipsView() {
  const [from, setFrom] = useState<FrameworkEntity>("skills");
  const [to, setTo] = useState<FrameworkEntity>("activities");
  const rels = useFrameworkRelationships();

  const forward = useMemo(
    () => rels.data?.find((r) => r.from_entity === from && r.to_entity === to),
    [rels.data, from, to]
  );
  const reverse = useMemo(
    () => rels.data?.find((r) => r.from_entity === to && r.to_entity === from),
    [rels.data, from, to]
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <EntitySelect label="Entity A" value={from} onChange={setFrom} />
        <EntitySelect label="Entity B" value={to} onChange={setTo} />
      </div>

      {from === to ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Pick two different entities to see how they relate.
        </Card>
      ) : rels.isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <RelationshipCard
            from={from}
            to={to}
            description={forward?.description ?? null}
            allDescriptions={forward?.all_descriptions ?? []}
          />
          <RelationshipCard
            from={to}
            to={from}
            description={reverse?.description ?? forward?.inverse_description ?? null}
            allDescriptions={reverse?.all_descriptions ?? []}
          />
        </div>
      )}
    </div>
  );
}

function EntitySelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: FrameworkEntity;
  onChange: (v: FrameworkEntity) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</label>
      <Select value={value} onValueChange={(v) => onChange(v as FrameworkEntity)}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {FRAMEWORK_ENTITIES.map((e) => (
            <SelectItem key={e} value={e}>{FRAMEWORK_LABELS[e]}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function RelationshipCard({
  from,
  to,
  description,
  allDescriptions,
}: {
  from: FrameworkEntity;
  to: FrameworkEntity;
  description: string | null;
  allDescriptions: string[];
}) {
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        <span className="text-foreground">{FRAMEWORK_LABELS[from]}</span>
        <span aria-hidden="true">→</span>
        <span className="text-foreground">{FRAMEWORK_LABELS[to]}</span>
      </div>
      {description ? (
        <p className="text-sm text-foreground leading-relaxed">{description}</p>
      ) : (
        <p className="text-sm text-muted-foreground italic">No relationship recorded in this direction.</p>
      )}
      {allDescriptions.length > 1 && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer hover:text-foreground">
            {allDescriptions.length - 1} alternate phrasing{allDescriptions.length === 2 ? "" : "s"}
          </summary>
          <ul className="mt-2 space-y-1 list-disc list-inside">
            {allDescriptions.slice(1).map((d, i) => <li key={i}>{d}</li>)}
          </ul>
        </details>
      )}
    </Card>
  );
}
