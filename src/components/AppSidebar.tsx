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

const mainNav = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Updates", href: "/updates", icon: Megaphone },
  { label: "My Journey", href: "/my-journey", icon: Map },
  { label: "Courses", href: "/courses", icon: GraduationCap },
  { label: "Project Openings", href: "/project-openings", icon: Handshake },
  { label: "Applications", href: "/applications", icon: ClipboardList },
  { label: "Resources", href: "/resources", icon: BookOpen },
  { label: "Events", href: "/events", icon: CalendarDays },
  { label: "Fleety", href: "/chat", icon: Bot },
  { label: "Feedback", href: "/feedback", icon: MessageSquarePlus },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { user } = useAuth();
  const { isAdmin } = useAdmin();

  const isActive = (href: string) =>
    location.pathname === href || location.pathname.startsWith(href + "/");

  if (!user) return null;

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        {/* Logo + collapse trigger */}
        <div className="flex flex-col items-center px-4 py-4 gap-2">
          <div className="flex items-center w-full justify-between">
            <div className="flex items-center gap-2">
              <img
                src={techFleetLogo}
                alt="Tech Fleet"
                className="h-7 w-7 dark:invert shrink-0"
                width={28}
                height={28}
              />
              {!collapsed && (
                <span className="font-bold text-sm text-sidebar-foreground truncate">
                  Tech Fleet
                </span>
              )}
            </div>
            {!collapsed && <SidebarTrigger className="shrink-0" />}
          </div>
          {collapsed && <SidebarTrigger className="shrink-0" />}
        </div>

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNav.map(({ label, href, icon: Icon }) => (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(href)}
                    tooltip={label}
                  >
                    <Link to={href}>
                      <Icon className="h-4 w-4" />
                      <span>{label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

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
