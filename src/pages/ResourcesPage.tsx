import { useState } from "react";
import { BookOpen, Wrench } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ResourceCard from "@/components/resources/ResourceCard";
import ResourceDetailPanel from "@/components/resources/ResourceDetailPanel";
import { handbooks, handbookCategoryColors, type Handbook } from "@/data/handbooks";
import { workshops, workshopCategoryColors, type Workshop } from "@/data/workshops";

export default function ResourcesPage() {
  const [selectedHandbook, setSelectedHandbook] = useState<Handbook | null>(null);
  const [selectedWorkshop, setSelectedWorkshop] = useState<Workshop | null>(null);

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

        {/* ── Handbooks Tab ── */}
        <TabsContent value="handbooks">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {handbooks.map((hb) => (
              <ResourceCard
                key={hb.name}
                name={hb.name}
                category={hb.category}
                categoryColorClass={handbookCategoryColors[hb.category] ?? ""}
                description={hb.description}
                onView={() => setSelectedHandbook(hb)}
              />
            ))}
          </div>
        </TabsContent>

        {/* ── Workshops Tab ── */}
        <TabsContent value="workshops">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {workshops.map((ws) => (
              <ResourceCard
                key={ws.name}
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

      {/* ── Handbook Detail Panel ── */}
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
          { label: "Target Audience", value: selectedHandbook?.targetAudience },
          { label: "Table of Contents", value: selectedHandbook?.contents },
        ]}
      />

      {/* ── Workshop Detail Panel ── */}
      <ResourceDetailPanel
        open={!!selectedWorkshop}
        onOpenChange={(open) => !open && setSelectedWorkshop(null)}
        title={selectedWorkshop?.name ?? ""}
        category={selectedWorkshop?.category ?? ""}
        categoryColorClass={workshopCategoryColors[selectedWorkshop?.category ?? ""] ?? ""}
        externalLink={selectedWorkshop?.figmaLink}
        externalLinkLabel="Open Figma Template"
        fields={[
          { label: "Description", value: selectedWorkshop?.description },
          { label: "Led By", value: selectedWorkshop?.ledBy },
          { label: "Resulting Deliverables", value: selectedWorkshop?.deliverables },
          { label: "Accountable Function", value: selectedWorkshop?.accountableFunction },
          { label: "Functions Involved", value: selectedWorkshop?.functionsInvolved },
          { label: "Stakeholders", value: selectedWorkshop?.stakeholders },
          { label: "Timing", value: selectedWorkshop?.timing },
          { label: "Milestones", value: selectedWorkshop?.milestones },
          { label: "Project Types", value: selectedWorkshop?.projectTypes },
          { label: "Skills Involved", value: selectedWorkshop?.skills },
          { label: "Company Types", value: selectedWorkshop?.companyTypes },
        ]}
      />
    </div>
  );
}
