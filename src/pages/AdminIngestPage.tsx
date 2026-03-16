import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";

const CSV_DATASETS = [
  { file: "/data/job-industries.csv", name: "Job Industries" },
  { file: "/data/company-types.csv", name: "Company Types" },
  { file: "/data/tools.csv", name: "Tools" },
  { file: "/data/agile-methods.csv", name: "Agile Methods" },
  { file: "/data/job-specializations.csv", name: "Job Specializations" },
  { file: "/data/milestones.csv", name: "Milestones" },
  { file: "/data/deliverables.csv", name: "Deliverables" },
  { file: "/data/deliverables-2.csv", name: "Deliverables (Extended)" },
  { file: "/data/skills-framework.csv", name: "Skills Framework Data Types" },
  { file: "/data/tech-job-categories.csv", name: "Tech Job Categories" },
  { file: "/data/team-functions.csv", name: "Team Functions" },
  { file: "/data/duties.csv", name: "Duties" },
  { file: "/data/activities.csv", name: "Activities" },
  { file: "/data/practices.csv", name: "Practices" },
  { file: "/data/skills.csv", name: "Skills" },
  { file: "/data/workshops-detailed.csv", name: "Workshops (Detailed)" },
  { file: "/data/handbooks-detailed.csv", name: "Handbooks (Detailed)" },
];

type Status = "idle" | "loading" | "done" | "error";

export default function AdminIngestPage() {
  const [statuses, setStatuses] = useState<Record<string, { status: Status; detail?: string }>>(
    Object.fromEntries(CSV_DATASETS.map((d) => [d.name, { status: "idle" as Status }]))
  );
  const [running, setRunning] = useState(false);

  const ingestOne = async (file: string, name: string) => {
    setStatuses((prev) => ({ ...prev, [name]: { status: "loading" } }));
    try {
      const res = await fetch(file);
      const csvText = await res.text();

      const { data, error } = await supabase.functions.invoke("ingest-csv-knowledge", {
        body: { csv_text: csvText, dataset_name: name },
      });

      if (error) throw new Error(error.message);
      setStatuses((prev) => ({
        ...prev,
        [name]: { status: "done", detail: `${data.inserted} entries inserted` },
      }));
    } catch (err: any) {
      setStatuses((prev) => ({
        ...prev,
        [name]: { status: "error", detail: err.message },
      }));
    }
  };

  const ingestAll = async () => {
    setRunning(true);
    for (const ds of CSV_DATASETS) {
      await ingestOne(ds.file, ds.name);
    }
    setRunning(false);
    toast.success("All datasets processed!");
  };

  return (
    <div className="container-app py-8 max-w-2xl">
      <h1 className="text-2xl font-bold mb-2">Knowledge Base Ingestion</h1>
      <p className="text-muted-foreground mb-6">
        Load team practices CSV data into the Fleety knowledge base.
      </p>

      <Button onClick={ingestAll} disabled={running} className="mb-6">
        {running ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Ingesting...
          </>
        ) : (
          "Ingest All Datasets"
        )}
      </Button>

      <div className="space-y-2">
        {CSV_DATASETS.map((ds) => {
          const st = statuses[ds.name];
          return (
            <div key={ds.name} className="flex items-center gap-3 p-3 border rounded-lg">
              {st.status === "idle" && <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30" />}
              {st.status === "loading" && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
              {st.status === "done" && <CheckCircle2 className="h-5 w-5 text-green-500" />}
              {st.status === "error" && <AlertCircle className="h-5 w-5 text-destructive" />}
              <div className="flex-1">
                <p className="text-sm font-medium">{ds.name}</p>
                {st.detail && <p className="text-xs text-muted-foreground">{st.detail}</p>}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => ingestOne(ds.file, ds.name)}
                disabled={running || st.status === "loading"}
              >
                Ingest
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
