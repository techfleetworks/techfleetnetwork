import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@/lib/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Handshake, ExternalLink, LayoutGrid, List, Loader2, Send, Pencil,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  PROJECT_TYPES, PROJECT_PHASES, PROJECT_STATUSES,
} from "@/data/project-constants";

interface OpenProject {
  id: string;
  client_id: string;
  project_type: string;
  phase: string;
  project_status: string;
  team_hats: string[];
  current_phase_milestones: string[];
}

interface ClientInfo {
  id: string;
  name: string;
}

const SECTION_LABELS = [
  "Introduction",
  "Profile Review",
  "Engagement History",
  "Agile Mindset",
  "Servant Leadership",
];

export default function ProjectOpeningsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [view, setView] = useState<"card" | "table">("card");
  const [gateDialogOpen, setGateDialogOpen] = useState(false);
  const [appSection, setAppSection] = useState(1);
  const [hasApp, setHasApp] = useState(false);

  // Fetch apply_now projects (RLS filters to only apply_now for non-admins)
  const { data: projects = [], isLoading: projLoading } = useQuery({
    queryKey: ["project-openings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, client_id, project_type, phase, project_status, team_hats, current_phase_milestones")
        .eq("project_status", "apply_now")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as OpenProject[];
    },
  });

  // Fetch active clients for name display
  const clientIds = useMemo(() => [...new Set(projects.map((p) => p.client_id))], [projects]);
  const { data: clients = [] } = useQuery({
    queryKey: ["project-opening-clients", clientIds],
    queryFn: async () => {
      if (clientIds.length === 0) return [];
      const { data, error } = await supabase
        .from("clients")
        .select("id, name")
        .in("id", clientIds);
      if (error) throw error;
      return (data ?? []) as ClientInfo[];
    },
    enabled: clientIds.length > 0,
  });

  const clientMap = useMemo(() => new Map(clients.map((c) => [c.id, c.name])), [clients]);

  // Fetch user's general application status
  const { data: genApp } = useQuery({
    queryKey: ["general-app-status", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("general_applications")
        .select("id, status, current_section")
        .eq("user_id", user!.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Fetch user's existing project applications to know which projects they already applied to
  const { data: myProjectApps = [] } = useQuery({
    queryKey: ["my-project-apps-for-openings", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_applications")
        .select("id, project_id, status")
        .eq("user_id", user!.id);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const appliedProjectIds = useMemo(
    () => new Set(myProjectApps.map((a) => a.project_id)),
    [myProjectApps]
  );

  const isAppCompleted = genApp?.status === "completed";

  const handleApply = (projectId: string) => {
    if (isAppCompleted) {
      navigate(`/project-openings/${projectId}/apply`);
      return;
    }
    // Show gate dialog
    setHasApp(!!genApp);
    setAppSection(genApp?.current_section ?? 1);
    setGateDialogOpen(true);
  };

  const handleGoToApp = () => {
    setGateDialogOpen(false);
    if (hasApp) {
      navigate(`/applications/general`);
    } else {
      navigate("/applications/general");
    }
  };

  const typeLabel = (v: string) => PROJECT_TYPES.find((t) => t.value === v)?.label ?? v;
  const phaseLabel = (v: string) => PROJECT_PHASES.find((p) => p.value === v)?.label ?? v;
  const statusLabel = (v: string) => PROJECT_STATUSES.find((s) => s.value === v)?.label ?? v;

  return (
    <div className="container-app py-8 sm:py-12">
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
          Project Openings
        </h1>
        <p className="text-muted-foreground mt-1">
          Browse current openings for client project training and volunteer teams.
        </p>
      </div>

      <Tabs defaultValue="client" className="w-full">
        <TabsList className="w-full sm:w-auto mb-6">
          <TabsTrigger value="client" className="flex-1 sm:flex-none">
            Client Project Openings
          </TabsTrigger>
          <TabsTrigger value="volunteer" className="flex-1 sm:flex-none">
            Volunteer Openings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="client">
          {/* View toggle */}
          {projects.length > 0 && (
            <div className="flex justify-end mb-4">
              <div className="flex border rounded-md overflow-hidden">
                <Button variant={view === "card" ? "default" : "ghost"} size="sm" onClick={() => setView("card")} aria-label="Card view">
                  <LayoutGrid className="h-4 w-4" />
                </Button>
                <Button variant={view === "table" ? "default" : "ghost"} size="sm" onClick={() => setView("table")} aria-label="Table view">
                  <List className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {projLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : projects.length === 0 ? (
            <div className="rounded-lg border bg-card p-8 text-center">
              <Handshake className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h2 className="text-lg font-semibold text-foreground mb-2">
                No Openings Right Now
              </h2>
              <p className="text-muted-foreground max-w-md mx-auto mb-4">
                There are no client projects currently accepting applications. Check back soon or visit the guide for more details.
              </p>
              <a
                href="https://guide.techfleet.org/training-openings/current-and-upcoming-program-openings/project-training-openings"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="outline">
                  <ExternalLink className="h-4 w-4 mr-1.5" />
                  View on Guide
                </Button>
              </a>
            </div>
          ) : view === "card" ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((p) => (
                <Card key={p.id} className="flex flex-col">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-lg leading-tight">
                          {clientMap.get(p.client_id) ?? "Client"}
                        </CardTitle>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {typeLabel(p.project_type)}
                        </p>
                      </div>
                      <Badge className="bg-warning/10 text-warning border-warning/20 shrink-0">
                        {statusLabel(p.project_status)}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 space-y-3 text-sm">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Phase</p>
                      <Badge variant="secondary" className="text-xs">{phaseLabel(p.phase)}</Badge>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Team Hats</p>
                      <div className="flex flex-wrap gap-1">
                        {p.team_hats.map((h) => (
                          <Badge key={h} variant="outline" className="text-xs">{h}</Badge>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter className="pt-3 border-t">
                    <Button className="w-full gap-2" onClick={() => handleApply(p.id)}>
                      <Send className="h-4 w-4" />
                      Apply
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Project Type</TableHead>
                    <TableHead>Phase</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Team Hats</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projects.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{clientMap.get(p.client_id) ?? "Client"}</TableCell>
                      <TableCell className="text-sm">{typeLabel(p.project_type)}</TableCell>
                      <TableCell><Badge variant="secondary" className="text-xs">{phaseLabel(p.phase)}</Badge></TableCell>
                      <TableCell><Badge className="bg-warning/10 text-warning border-warning/20">{statusLabel(p.project_status)}</Badge></TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {p.team_hats.slice(0, 3).map((h) => (
                            <Badge key={h} variant="outline" className="text-xs">{h}</Badge>
                          ))}
                          {p.team_hats.length > 3 && <Badge variant="outline" className="text-xs">+{p.team_hats.length - 3}</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" className="gap-1.5" onClick={() => handleApply(p.id)}>
                          <Send className="h-3.5 w-3.5" />
                          Apply
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="volunteer">
          <div className="rounded-lg border bg-card p-8 text-center">
            <Handshake className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-lg font-semibold text-foreground mb-2">
              Volunteer Openings
            </h2>
            <p className="text-muted-foreground max-w-md mx-auto mb-4">
              View current volunteer team opportunities to support Tech Fleet's mission and operations.
            </p>
            <a
              href="https://guide.techfleet.org/training-openings/current-and-upcoming-program-openings/volunteer-project-openings"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline">
                <ExternalLink className="h-4 w-4 mr-1.5" />
                View on Guide
              </Button>
            </a>
          </div>
        </TabsContent>
      </Tabs>

      {/* Gate Dialog — General App not completed */}
      <Dialog open={gateDialogOpen} onOpenChange={setGateDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Complete Your General Application</DialogTitle>
            <DialogDescription>
              Before you can apply to project openings, you need to complete the General Application first.
            </DialogDescription>
          </DialogHeader>
          <div className="py-3">
            {hasApp ? (
              <div className="rounded-md border bg-muted/30 p-4 space-y-2">
                <p className="text-sm font-medium text-foreground">
                  You're currently on <span className="text-primary font-semibold">Section {appSection} of 5</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {SECTION_LABELS[appSection - 1] ?? "Unknown Section"} — pick up where you left off.
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                You haven't started a General Application yet. Start one now to unlock project applications.
              </p>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setGateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleGoToApp}>
              {hasApp ? "Continue Application" : "Start Application"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
