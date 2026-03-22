import { useState, useEffect, useMemo } from "react";
import { BookOpen, Wrench, Loader2, Filter, X, Sparkles } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ExploreTab from "@/components/resources/ExploreTab";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import ResourceCard from "@/components/resources/ResourceCard";
import ResourceDetailPanel from "@/components/resources/ResourceDetailPanel";
import { fetchHandbooks, handbookCategoryColors, type Handbook } from "@/data/handbooks";
import { fetchWorkshops, workshopCategoryColors, type Workshop } from "@/data/workshops";
import { toast } from "@/hooks/use-toast";

export default function ResourcesPage() {
  const [handbooks, setHandbooks] = useState<Handbook[]>([]);
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedHandbook, setSelectedHandbook] = useState<Handbook | null>(null);
  const [selectedWorkshop, setSelectedWorkshop] = useState<Workshop | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const [hb, ws] = await Promise.all([fetchHandbooks(), fetchWorkshops()]);
        setHandbooks(hb);
        setWorkshops(ws);
      } catch {
        toast({ title: "Failed to load resources", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Collect all unique categories across both handbooks and workshops
  const allCategories = useMemo(() => {
    const cats = new Set<string>();
    handbooks.forEach((h) => cats.add(h.category));
    workshops.forEach((w) => cats.add(w.category));
    return Array.from(cats).sort();
  }, [handbooks, workshops]);

  const hasFilter = selectedCategories.length > 0;

  const filteredHandbooks = useMemo(
    () => hasFilter ? handbooks.filter((h) => selectedCategories.includes(h.category)) : handbooks,
    [handbooks, selectedCategories, hasFilter],
  );

  const filteredWorkshops = useMemo(
    () => hasFilter ? workshops.filter((w) => selectedCategories.includes(w.category)) : workshops,
    [workshops, selectedCategories, hasFilter],
  );

  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
  };

  const resetFilters = () => setSelectedCategories([]);

  if (loading) {
    return (
      <div className="container-app py-8 sm:py-12 flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const countBadge = (count: number) => (
    <span
      className={`ml-1.5 inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold leading-none ${
        count > 0
          ? "bg-[hsl(221,83%,53%)] text-white"
          : "bg-muted text-muted-foreground"
      }`}
    >
      {count}
    </span>
  );

  return (
    <div className="container-app py-8 sm:py-12">
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
          Resources
        </h1>
        <p className="text-muted-foreground mt-1">
          Handbooks, workshop templates, and reference materials for your Tech Fleet journey.
        </p>
      </div>

      <Tabs defaultValue="explore" className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <TabsList>
            <TabsTrigger value="explore" className="gap-1.5">
              <Sparkles className="h-4 w-4" />
              Explore
            </TabsTrigger>
            <TabsTrigger value="handbooks" className="gap-1.5">
              <BookOpen className="h-4 w-4" />
              Handbooks
              {countBadge(filteredHandbooks.length)}
            </TabsTrigger>
            <TabsTrigger value="workshops" className="gap-1.5">
              <Wrench className="h-4 w-4" />
              Workshop Templates
              {countBadge(filteredWorkshops.length)}
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Filter className="h-4 w-4" />
                  Category
                  {hasFilter && (
                    <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs">
                      {selectedCategories.length}
                    </Badge>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel>Filter by Category</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {allCategories.map((cat) => (
                  <DropdownMenuCheckboxItem
                    key={cat}
                    checked={selectedCategories.includes(cat)}
                    onCheckedChange={() => toggleCategory(cat)}
                    onSelect={(e) => e.preventDefault()}
                  >
                    {cat}
                  </DropdownMenuCheckboxItem>
                ))}
                {allCategories.length === 0 && (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">No categories</div>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {hasFilter && (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetFilters}
                className="gap-1 text-muted-foreground hover:text-foreground"
                aria-label="Reset category filters"
              >
                <X className="h-3.5 w-3.5" />
                Reset
              </Button>
            )}
          </div>
        </div>

        <TabsContent value="handbooks">
          {filteredHandbooks.length === 0 ? (
            <p className="text-muted-foreground text-sm py-8 text-center">
              No handbooks match the selected categories.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredHandbooks.map((hb) => (
                <ResourceCard
                  key={hb.id}
                  name={hb.name}
                  category={hb.category}
                  categoryColorClass={handbookCategoryColors[hb.category] ?? ""}
                  description={hb.description}
                  onView={() => setSelectedHandbook(hb)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="workshops">
          {filteredWorkshops.length === 0 ? (
            <p className="text-muted-foreground text-sm py-8 text-center">
              No workshops match the selected categories.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredWorkshops.map((ws) => (
                <ResourceCard
                  key={ws.id}
                  name={ws.name}
                  category={ws.category}
                  categoryColorClass={workshopCategoryColors[ws.category] ?? ""}
                  description={ws.description}
                  onView={() => setSelectedWorkshop(ws)}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <ResourceDetailPanel
        open={!!selectedHandbook}
        onOpenChange={(open) => !open && setSelectedHandbook(null)}
        title={selectedHandbook?.name ?? ""}
        category={selectedHandbook?.category ?? ""}
        categoryColorClass={handbookCategoryColors[selectedHandbook?.category ?? ""] ?? ""}
        externalLink={selectedHandbook?.link}
        externalLinkLabel="Read Handbook"
        fields={[
          { label: "Description", value: selectedHandbook?.description },
          { label: "Target Audience", value: selectedHandbook?.target_audience },
          { label: "Table of Contents", value: selectedHandbook?.contents },
        ]}
      />

      <ResourceDetailPanel
        open={!!selectedWorkshop}
        onOpenChange={(open) => !open && setSelectedWorkshop(null)}
        title={selectedWorkshop?.name ?? ""}
        category={selectedWorkshop?.category ?? ""}
        categoryColorClass={workshopCategoryColors[selectedWorkshop?.category ?? ""] ?? ""}
        externalLink={selectedWorkshop?.figma_link}
        externalLinkLabel="Open Figma Template"
        fields={[
          { label: "Description", value: selectedWorkshop?.description },
          { label: "Led By", value: selectedWorkshop?.led_by },
          { label: "Resulting Deliverables", value: selectedWorkshop?.deliverables },
          { label: "Accountable Function", value: selectedWorkshop?.accountable_function },
          { label: "Functions Involved", value: selectedWorkshop?.functions_involved },
          { label: "Stakeholders", value: selectedWorkshop?.stakeholders },
          { label: "Timing", value: selectedWorkshop?.timing },
          { label: "Milestones", value: selectedWorkshop?.milestones },
          { label: "Project Types", value: selectedWorkshop?.project_types },
          { label: "Skills Involved", value: selectedWorkshop?.skills },
          { label: "Company Types", value: selectedWorkshop?.company_types },
        ]}
      />
    </div>
  );
}
