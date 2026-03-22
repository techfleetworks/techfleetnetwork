import { QueryClient, QueryClientProvider } from "@/lib/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AuthProvider } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { IdleTimeoutGuard } from "@/components/IdleTimeoutGuard";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Suspense, lazy } from "react";

// Eagerly loaded routes (critical path)
import Index from "./pages/Index";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import NotFound from "./pages/NotFound";

// Lazily loaded routes (reduce initial JS bundle)
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const ForgotPasswordPage = lazy(() => import("./pages/ForgotPasswordPage"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));
const ProfileSetupPage = lazy(() => import("./pages/ProfileSetupPage"));
const FirstStepsPage = lazy(() => import("./pages/FirstStepsPage"));
const SecondStepsPage = lazy(() => import("./pages/SecondStepsPage"));
const ThirdStepsPage = lazy(() => import("./pages/ThirdStepsPage"));
const ProjectTrainingPage = lazy(() => import("./pages/ProjectTrainingPage"));
const VolunteerTeamsPage = lazy(() => import("./pages/VolunteerTeamsPage"));
const DiscordCoursePage = lazy(() => import("./pages/DiscordCoursePage"));
const TrainingPage = lazy(() => import("./pages/TrainingPage"));
const ResourcesPage = lazy(() => import("./pages/ResourcesPage"));
const ChatPage = lazy(() => import("./pages/ChatPage"));
const EventsPage = lazy(() => import("./pages/EventsPage"));
const AdminIngestPage = lazy(() => import("./pages/AdminIngestPage"));
const ApplicationsPage = lazy(() => import("./pages/ApplicationsPage"));
const GeneralApplicationPage = lazy(() => import("./pages/GeneralApplicationPage"));
const MyProjectApplicationsPage = lazy(() => import("./pages/MyProjectApplicationsPage"));
const ProjectOpeningsPage = lazy(() => import("./pages/ProjectOpeningsPage"));
const UserAdminPage = lazy(() => import("./pages/UserAdminPage"));
const ConfirmAdminPage = lazy(() => import("./pages/ConfirmAdminPage"));
const ActivityLogPage = lazy(() => import("./pages/ActivityLogPage"));
const ApplicationSubmissionDetailPage = lazy(() => import("./pages/ApplicationSubmissionDetailPage"));
const UpdatesPage = lazy(() => import("./pages/UpdatesPage"));
const ClientsPage = lazy(() => import("./pages/ClientsPage"));
const ProjectFormPage = lazy(() => import("./pages/ProjectFormPage"));
const ProjectApplicationPage = lazy(() => import("./pages/ProjectApplicationPage"));
const ProjectOpeningDetailPage = lazy(() => import("./pages/ProjectOpeningDetailPage"));
const EditProfilePage = lazy(() => import("./pages/EditProfilePage"));
const ProjectAnalysisDetailPage = lazy(() => import("./pages/ProjectAnalysisDetailPage"));
const FeedbackPage = lazy(() => import("./pages/FeedbackPage"));
const AdminRosterPage = lazy(() => import("./pages/AdminRosterPage"));
const MyJourneyPage = lazy(() => import("./pages/MyJourneyPage"));
const ObserverCoursePage = lazy(() => import("./pages/ObserverCoursePage"));

function RouteFallback() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,       // 5 min — avoid refetching on every mount
      gcTime: 10 * 60 * 1000,         // 10 min — keep cache warm
      retry: (failureCount, error) => {
        // Don't retry on auth errors (401/403) or validation errors (400)
        if (error instanceof Error) {
          const msg = error.message.toLowerCase();
          if (msg.includes("unauthorized") || msg.includes("forbidden") || msg.includes("not authenticated")) {
            return false;
          }
        }
        return failureCount < 2;        // Up to 2 retries for transient failures
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 15_000), // Exponential backoff, max 15s
      refetchOnWindowFocus: false,     // Prevent refetch storms on tab switch
      structuralSharing: true,         // Prevent unnecessary re-renders at scale
    },
    mutations: {
      retry: false,                    // Never auto-retry mutations
    },
  },
});


const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider defaultTheme="dark">
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <ErrorBoundary>
              <AppLayout>
                <IdleTimeoutGuard />
                <Suspense fallback={<RouteFallback />}>
                  <Routes>
                    <Route path="/" element={<Index />} />
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/register" element={<RegisterPage />} />
                    <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                    <Route path="/reset-password" element={<ResetPasswordPage />} />
                    <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
                    <Route path="/profile-setup" element={<ProtectedRoute><ProfileSetupPage /></ProtectedRoute>} />
                    <Route path="/my-journey" element={<ProtectedRoute><MyJourneyPage /></ProtectedRoute>} />
                    <Route path="/courses" element={<ProtectedRoute><TrainingPage /></ProtectedRoute>} />
                    <Route path="/courses/onboarding" element={<ProtectedRoute><FirstStepsPage /></ProtectedRoute>} />
                    <Route path="/courses/agile-mindset" element={<ProtectedRoute><SecondStepsPage /></ProtectedRoute>} />
                    <Route path="/courses/discord-learning" element={<ProtectedRoute><DiscordCoursePage /></ProtectedRoute>} />
                    <Route path="/courses/agile-teamwork" element={<ProtectedRoute><ThirdStepsPage /></ProtectedRoute>} />
                    <Route path="/courses/project-training" element={<ProtectedRoute><ProjectTrainingPage /></ProtectedRoute>} />
                    <Route path="/courses/volunteer-teams" element={<ProtectedRoute><VolunteerTeamsPage /></ProtectedRoute>} />
                    <Route path="/courses/observer" element={<ProtectedRoute><ObserverCoursePage /></ProtectedRoute>} />
                    <Route path="/events" element={<ProtectedRoute><EventsPage /></ProtectedRoute>} />
                    <Route path="/resources" element={<ProtectedRoute><ResourcesPage /></ProtectedRoute>} />
                    <Route path="/chat" element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />
                    <Route path="/applications" element={<ProtectedRoute><ApplicationsPage /></ProtectedRoute>} />
                    <Route path="/applications/general" element={<ProtectedRoute><GeneralApplicationPage /></ProtectedRoute>} />
                    <Route path="/applications/projects" element={<ProtectedRoute><MyProjectApplicationsPage /></ProtectedRoute>} />
                    <Route path="/project-openings" element={<ProtectedRoute><ProjectOpeningsPage /></ProtectedRoute>} />
                    <Route path="/project-openings/:projectId" element={<ProjectOpeningDetailPage />} />
                    <Route path="/project-openings/:projectId/apply" element={<ProtectedRoute><ProjectApplicationPage /></ProtectedRoute>} />
                    <Route path="/admin/ingest" element={<ProtectedRoute><AdminIngestPage /></ProtectedRoute>} />
                    <Route path="/admin/users" element={<ProtectedRoute><UserAdminPage /></ProtectedRoute>} />
                    <Route path="/admin/activity-log" element={<ProtectedRoute><ActivityLogPage /></ProtectedRoute>} />
                    <Route path="/admin/applications/analysis/:projectId" element={<ProtectedRoute><ProjectAnalysisDetailPage /></ProtectedRoute>} />
                    <Route path="/admin/applications/:applicationId" element={<ProtectedRoute><ApplicationSubmissionDetailPage /></ProtectedRoute>} />
                    <Route path="/admin/clients" element={<ProtectedRoute><ClientsPage /></ProtectedRoute>} />
                    <Route path="/admin/clients/projects/new" element={<ProtectedRoute><ProjectFormPage /></ProtectedRoute>} />
                    <Route path="/admin/clients/projects/:id/edit" element={<ProtectedRoute><ProjectFormPage /></ProtectedRoute>} />
                    <Route path="/updates" element={<ProtectedRoute><UpdatesPage /></ProtectedRoute>} />
                    <Route path="/profile/edit" element={<ProtectedRoute><EditProfilePage /></ProtectedRoute>} />
                    <Route path="/feedback" element={<ProtectedRoute><FeedbackPage /></ProtectedRoute>} />
                    <Route path="/admin/feedback" element={<ProtectedRoute><FeedbackPage /></ProtectedRoute>} />
                    <Route path="/admin/roster" element={<ProtectedRoute><AdminRosterPage /></ProtectedRoute>} />
                    <Route path="/confirm-admin" element={<ConfirmAdminPage />} />
                    {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </Suspense>
              </AppLayout>
            </ErrorBoundary>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;