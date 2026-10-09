import { useNavigate } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/design-system";
import { useAdmin } from "@/hooks/use-admin";
import { useAllClasses, useMyClasses } from "@/hooks/use-classes";
import { useCohortsForScope } from "@/hooks/use-cohorts";
import { ClassList } from "@/components/classes/ClassList";
import { CohortList } from "@/components/classes/CohortList";

/**
 * Class Admin (ADR-0067) — the single, role-aware home for managing classes and cohorts, replacing the
 * old split of admin "All Classes" (/admin/classes) and teacher "My Classes" (/teach/classes). Admins
 * see and manage everything; teachers see only their own. Two tabs, each a real route
 * (/class-admin/classes, /class-admin/cohorts) so they're deep-linkable and back-button friendly.
 * Access + the role-aware 2FA gate are enforced by <ClassAdminRoute> around this page (App.tsx).
 */
export default function ClassAdminPage({ tab }: { tab: "classes" | "cohorts" }) {
  const navigate = useNavigate();
  const { isAdmin } = useAdmin();
  const mode = isAdmin ? "admin" : "mine";

  // Only the role-appropriate class query runs; the other is disabled. Admins see all classes,
  // teachers only their own — that same list also feeds the "Add cohort" class picker.
  const adminClasses = useAllClasses(isAdmin);
  const myClasses = useMyClasses(!isAdmin);
  const classesQuery = isAdmin ? adminClasses : myClasses;
  const classes = classesQuery.data ?? [];

  const cohortsQuery = useCohortsForScope();
  const cohorts = cohortsQuery.data ?? [];

  return (
    <div className="container-app py-8 sm:py-12 space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Class Admin</h1>
        <p className="text-muted-foreground mt-1">
          {isAdmin
            ? "Review, publish, and manage every class and cohort across all teachers."
            : "Author, publish, and manage your classes and their cohorts."}
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => navigate(`/class-admin/${v}`)} className="space-y-6">
        <TabsList aria-label="Class Admin sections">
          <TabsTrigger value="classes">Classes</TabsTrigger>
          <TabsTrigger value="cohorts">Cohorts</TabsTrigger>
        </TabsList>
        <TabsContent value="classes">
          <ClassList mode={mode} classes={classes} isLoading={classesQuery.isLoading} />
        </TabsContent>
        <TabsContent value="cohorts">
          <CohortList cohorts={cohorts} isLoading={cohortsQuery.isLoading} classes={classes} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
