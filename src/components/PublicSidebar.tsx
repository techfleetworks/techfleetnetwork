import { memo } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import techFleetLogo from "@/assets/tech-fleet-logo.svg";
import { PUBLIC_NAV_ITEMS } from "./PublicNavItems";

// Desktop sidebar for logged-out visitors (public-access B8).
//
// Mirrors AppSidebar's chrome (logo + collapse trigger + theme-aware tokens) but
// carries ONLY the public nav items. It deliberately does NOT reuse AppSidebar:
// that component runs auth/admin/teacher hooks and a pending-classes query that
// must never execute for an anonymous visitor. The public surface is single-
// sourced in PublicNavItems (hrefs authorized by the A5 public-nav policy).
export const PublicSidebar = memo(function PublicSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();

  const isActive = (href: string) =>
    href === "/"
      ? location.pathname === "/"
      : location.pathname === href || location.pathname.startsWith(href + "/");

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
                <span className="font-bold text-sm text-sidebar-foreground truncate" data-no-translate>
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
              {PUBLIC_NAV_ITEMS.map(({ label, href, icon: Icon }) => (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton asChild isActive={isActive(href)} tooltip={label}>
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
    </Sidebar>
  );
});
