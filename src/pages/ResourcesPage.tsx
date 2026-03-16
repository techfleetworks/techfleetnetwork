import { useState, useEffect } from "react";
import { BookOpen, Wrench, Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

  if (loading) {
    return (
      <div className="container-app py-8 sm:py-12 flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

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

      <Tabs defaultValue="handbooks" className="space-y-6">
        <TabsList>
          <TabsTrigger value="handbooks" className="gap-1.5">
            <BookOpen className="h-4 w-4" />
            Handbooks
          </TabsTrigger>
          <TabsTrigger value="workshops" className="gap-1.5">
            <Wrench className="h-4 w-4" />
            Workshop Templates
          </TabsTrigger>
        </TabsList>

        <TabsContent value="handbooks">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {handbooks.map((hb) => (
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
        </TabsContent>

        <TabsContent value="workshops">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {workshops.map((ws) => (
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
