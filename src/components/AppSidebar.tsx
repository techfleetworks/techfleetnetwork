import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  GraduationCap,
  BookOpen,
  Bot,
  CalendarDays,
  ClipboardList,
  Handshake,
  ShieldCheck,
  Activity,
  Megaphone,
  Building2,
  MessageSquarePlus,
  Users,
  Map,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/contexts/AuthContext";
import { useAdmin } from "@/hooks/use-admin";
import techFleetLogo from "@/assets/tech-fleet-logo.svg";

const communityNav = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Events", href: "/events", icon: CalendarDays },
  { label: "Feedback", href: "/feedback", icon: MessageSquarePlus },
  { label: "Updates", href: "/updates", icon: Megaphone },
];

const trainingNav = [
  { label: "Applications", href: "/applications", icon: ClipboardList },
  { label: "Courses", href: "/courses", icon: GraduationCap },
  { label: "My Journey", href: "/my-journey", icon: Map },
  { label: "Project Openings", href: "/project-openings", icon: Handshake },
];

const supportNav = [
  { label: "Get Help", href: "/chat", icon: LifeBuoy },
  { label: "Resources", href: "/resources", icon: BookOpen },
];

const navSections = [
  { label: "Community", items: communityNav },
  { label: "Training", items: trainingNav },
  { label: "Support", items: supportNav },
];

        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive("/admin/users")}
                    tooltip="User Admin"
                  >
                    <Link to="/admin/users">
                      <ShieldCheck className="h-4 w-4" />
                      <span>User Admin</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive("/admin/clients")}
                    tooltip="Clients and Projects"
                  >
                    <Link to="/admin/clients">
                      <Building2 className="h-4 w-4" />
                      <span>Clients and Projects</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive("/admin/activity-log")}
                    tooltip="Activity Log"
                  >
                    <Link to="/admin/activity-log">
                      <Activity className="h-4 w-4" />
                      <span>Activity Log</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive("/admin/roster")}
                    tooltip="Project Roster"
                  >
                    <Link to="/admin/roster">
                      <Users className="h-4 w-4" />
                      <span>Project Roster</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
    </Sidebar>
  );
}
