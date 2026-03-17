import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  GraduationCap,
  BookOpen,
  Bot,
  CalendarDays,
  ClipboardList,
  Handshake,
  ShieldCheck,
  LogOut,
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
  SidebarFooter,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/contexts/AuthContext";
import techFleetLogo from "@/assets/tech-fleet-logo.svg";

const mainNav = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Courses", href: "/courses", icon: GraduationCap },
  { label: "Applications", href: "/applications", icon: ClipboardList },
  { label: "Project Openings", href: "/project-openings", icon: Handshake },
  { label: "Resources", href: "/resources", icon: BookOpen },
  { label: "Events", href: "/events", icon: CalendarDays },
  { label: "Fleety", href: "/chat", icon: Bot },
];

interface AppSidebarProps {
  onProfileEdit: () => void;
}

export function AppSidebar({ onProfileEdit }: AppSidebarProps) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, signOut } = useAuth();

  const isActive = (href: string) =>
    location.pathname === href || location.pathname.startsWith(href + "/");

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const avatarInitials = profile
    ? `${(profile.first_name?.[0] || "").toUpperCase()}${(profile.last_name?.[0] || "").toUpperCase()}` || "U"
    : (user?.user_metadata?.full_name?.[0] || "U").toUpperCase();

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
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
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
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Edit Profile" onClick={onProfileEdit}>
              <Avatar className="h-5 w-5">
                <AvatarImage src={profile?.avatar_url || undefined} alt="Profile" />
                <AvatarFallback className="text-[10px]">{avatarInitials}</AvatarFallback>
              </Avatar>
              <span className="truncate">
                {profile?.first_name || profile?.display_name || "Profile"}
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Sign Out" onClick={handleSignOut}>
              <LogOut className="h-4 w-4" />
              <span>Sign Out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
