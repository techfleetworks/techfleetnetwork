import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { usePageHeader } from "@/contexts/PageHeaderContext";
import ProjectAnalysisContent from "@/components/admin/ProjectAnalysisContent";

/**
 * Standalone route for /admin/applications/analysis/:projectId
 * Now delegates to the shared ProjectAnalysisContent component.
 */
export default function ProjectAnalysisDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { setHeader } = usePageHeader();

  useEffect(() => {
    setHeader({
      breadcrumbs: [
        { label: "Recruiting Center", href: "/admin/roster" },
        { label: "Application Analysis" },
      ],
      title: "Application Analysis",
    });
    return () => setHeader(null);
  }, [setHeader]);

  if (!projectId) return null;

  return (
    <div className="container-app py-8 sm:py-12 space-y-8">
      <ProjectAnalysisContent projectId={projectId} />
    </div>
  );
}
