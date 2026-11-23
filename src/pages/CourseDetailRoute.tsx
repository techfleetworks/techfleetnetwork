// Auth branch for the public Core-course detail (public-access B12), mirroring
// CoursesRoute: an anonymous visitor sees the public outline at /course/:courseKey;
// a signed-in member is redirected to their in-platform course page (the member
// route slug differs from course_key only for the observer course). Members reach
// here only by deep link — the public card that points here is anon-only.
import { Navigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import PublicCourseDetailPage from "./PublicCourseDetailPage";

const MEMBER_COURSE_PATH: Record<string, string> = {
  "agile-mindset": "/courses/agile-mindset",
  "observer-course": "/courses/observer",
  "project-training": "/courses/project-training",
  "volunteer-teams": "/courses/volunteer-teams",
  "discord-learning": "/courses/discord-learning",
  "agile-teamwork": "/courses/agile-teamwork",
};

export default function CourseDetailRoute() {
  const { user } = useAuth();
  const { courseKey } = useParams<{ courseKey: string }>();
  if (user) {
    return <Navigate to={(courseKey && MEMBER_COURSE_PATH[courseKey]) || "/courses"} replace />;
  }
  return <PublicCourseDetailPage />;
}
