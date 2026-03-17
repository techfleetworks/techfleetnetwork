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
import Index from "./pages/Index";
import DashboardPage from "./pages/DashboardPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import ProfileSetupPage from "./pages/ProfileSetupPage";
import FirstStepsPage from "./pages/FirstStepsPage";
import SecondStepsPage from "./pages/SecondStepsPage";
import ThirdStepsPage from "./pages/ThirdStepsPage";
import ProjectTrainingPage from "./pages/ProjectTrainingPage";
import VolunteerTeamsPage from "./pages/VolunteerTeamsPage";
import TrainingPage from "./pages/TrainingPage";
import ResourcesPage from "./pages/ResourcesPage";
import ChatPage from "./pages/ChatPage";
import EventsPage from "./pages/EventsPage";
import AdminIngestPage from "./pages/AdminIngestPage";
import ApplicationsPage from "./pages/ApplicationsPage";
import ProjectOpeningsPage from "./pages/ProjectOpeningsPage";
import NotFound from "./pages/NotFound";


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
                <Route path="/courses/agile-teamwork" element={<ProtectedRoute><ThirdStepsPage /></ProtectedRoute>} />
                <Route path="/courses/project-training" element={<ProtectedRoute><ProjectTrainingPage /></ProtectedRoute>} />
                <Route path="/courses/volunteer-teams" element={<ProtectedRoute><VolunteerTeamsPage /></ProtectedRoute>} />
                <Route path="/events" element={<ProtectedRoute><EventsPage /></ProtectedRoute>} />
                <Route path="/resources" element={<ProtectedRoute><ResourcesPage /></ProtectedRoute>} />
                <Route path="/chat" element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />
                <Route path="/applications" element={<ProtectedRoute><ApplicationsPage /></ProtectedRoute>} />
                <Route path="/project-openings" element={<ProtectedRoute><ProjectOpeningsPage /></ProtectedRoute>} />
                <Route path="/admin/ingest" element={<ProtectedRoute><AdminIngestPage /></ProtectedRoute>} />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </AppLayout>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
