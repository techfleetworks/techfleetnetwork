import { useSearchParams } from "react-router-dom";
import { ResponsiveTabs, ResponsiveTabsList, ResponsiveTabsContent, type TabItem } from "@/components/ui/responsive-tabs";
import { ClientsTab } from "@/components/clients/ClientsTab";
import { ProjectsTab } from "@/components/clients/ProjectsTab";

const clientTabs: TabItem[] = [
  { value: "clients", label: "Clients" },
  { value: "projects", label: "Projects" },
];

export default function ClientsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") === "projects" ? "projects" : "clients";

  // Admin access is enforced by AdminRoute wrapper

  return (
    <div className="container-app py-8 sm:py-12 space-y-6">
      <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Clients & Projects</h1>

      <ResponsiveTabs value={activeTab} onValueChange={(v) => setSearchParams({ tab: v })}>
        <ResponsiveTabsList tabs={clientTabs} value={activeTab} onValueChange={(v) => setSearchParams({ tab: v })} />
        <ResponsiveTabsContent value="clients">
          <ClientsTab />
        </ResponsiveTabsContent>
        <ResponsiveTabsContent value="projects">
          <ProjectsTab />
        </ResponsiveTabsContent>
      </ResponsiveTabs>
    </div>
  );
}
