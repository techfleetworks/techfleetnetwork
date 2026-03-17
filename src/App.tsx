import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AuthProvider } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { IdleTimeoutGuard } from "@/components/IdleTimeoutGuard";
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
const ProjectOpeningsPage = lazy(() => import("./pages/ProjectOpeningsPage"));

function RouteFallback() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

const queryClient = new QueryClient();


const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider defaultTheme="dark">
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
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
                  <Route path="/courses" element={<ProtectedRoute><TrainingPage /></ProtectedRoute>} />
                  <Route path="/courses/onboarding" element={<ProtectedRoute><FirstStepsPage /></ProtectedRoute>} />
                  <Route path="/courses/agile-mindset" element={<ProtectedRoute><SecondStepsPage /></ProtectedRoute>} />
                  <Route path="/courses/discord-learning" element={<ProtectedRoute><DiscordCoursePage /></ProtectedRoute>} />
                  <Route path="/courses/agile-teamwork" element={<ProtectedRoute><ThirdStepsPage /></ProtectedRoute>} />
                  <Route path="/courses/project-training" element={<ProtectedRoute><ProjectTrainingPage /></ProtectedRoute>} />
                  <Route path="/courses/volunteer-teams" element={<ProtectedRoute><VolunteerTeamsPage /></ProtectedRoute>} />
                  <Route path="/events" element={<ProtectedRoute><EventsPage /></ProtectedRoute>} />
                  <Route path="/resources" element={<ProtectedRoute><ResourcesPage /></ProtectedRoute>} />
                  <Route path="/chat" element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />
                  <Route path="/applications" element={<ProtectedRoute><ApplicationsPage /></ProtectedRoute>} />
                  <Route path="/applications/general" element={<ProtectedRoute><GeneralApplicationPage /></ProtectedRoute>} />
                  <Route path="/project-openings" element={<ProtectedRoute><ProjectOpeningsPage /></ProtectedRoute>} />
                  <Route path="/admin/ingest" element={<ProtectedRoute><AdminIngestPage /></ProtectedRoute>} />
                  {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </AppLayout>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;