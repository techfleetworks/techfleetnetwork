import { useState, Fragment, memo, useCallback } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Menu,
  X,
  BookOpen,
  GraduationCap,
  LayoutDashboard,
  LogIn,
  LogOut,
  UserPen,
  MessageCircle,
  CalendarDays,
  Megaphone,
  ClipboardList,
  Handshake,
  Map,
  MessageSquarePlus,
  ShieldCheck,
  Activity,
  Building2,
  Users,
} from "lucide-react";
import { Button } from "./ui/button";
import { ThemeToggle } from "./ThemeToggle";

import { ProfileSetupDialog } from "./ProfileSetupDialog";
import { useAuth } from "@/contexts/AuthContext";
import { useAdmin } from "@/hooks/use-admin";
import { PageHeaderProvider, usePageHeader } from "@/contexts/PageHeaderContext";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAnnouncementRealtime } from "@/hooks/use-announcement-realtime";
import { useNotificationRealtime } from "@/hooks/use-notifications";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList,
  BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import techFleetLogo from "@/assets/tech-fleet-logo.svg";
import { UniversalSearch } from "./UniversalSearch";
import { NotificationBell } from "./NotificationBell";
import { AnnouncementBanner } from "./AnnouncementBanner";
import { FleetyChatWidget } from "./FleetyChatWidget";
import type { Profile } from "@/services/profile.service";
import type { User } from "@supabase/supabase-js";

const CURRENT_BANNER = {
  id: "alpha-welcome-v1",
  title: "Welcome to Tech Fleet Network Alpha Platform!",
  message:
    "We're excited to build the ship as we fly the ship, so they say. This is the platform that Tech Fleet members can use to onboard, get guidance, track progress, apply, and register for training opportunities. Our entire community rallies around this. Please enjoy what's here, and know that it's being built while you use it, so there will be bugs, and not everything is complete.\n\nPlease give us feedback in the Feedback section of the app!",
} as const;

function ProfileDropdown({
  profile,
  user,
  onEditProfile,
  onSignOut,
}: {
  profile: Profile | null;
  user: User | null;
  onEditProfile: () => void;
  onSignOut: () => void;
}) {
  const avatarInitials = profile
    ? `${(profile.first_name?.[0] || "").toUpperCase()}${(profile.last_name?.[0] || "").toUpperCase()}` || "U"
    : (user?.user_metadata?.full_name?.[0] || "U").toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-2 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Account menu"
        >
          <Avatar className="h-8 w-8 cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all">
            <AvatarImage src={profile?.avatar_url || undefined} alt="Profile" />
            <AvatarFallback className="text-xs">{avatarInitials}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <div className="px-2 py-1.5">
          <p className="text-sm font-medium truncate">
            {profile?.first_name || profile?.display_name || "Profile"}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {profile?.email || user?.email || ""}
          </p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onEditProfile}>
          <UserPen className="h-4 w-4 mr-2" />
          Edit Profile
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onSignOut}>
          <LogOut className="h-4 w-4 mr-2" />
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ── Desktop header with optional page context ────────── */
function DesktopHeader({
  profile,
  user,
  onEditProfile,
  onSignOut,
}: {
  profile: Profile | null;
  user: User | null;
  onEditProfile: () => void;
  onSignOut: () => void;
}) {
  const { header } = usePageHeader();

  return (
    <header
      className="sticky top-0 z-40 flex items-center justify-between border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4"
      role="banner"
      style={{ minHeight: header ? undefined : "3rem" }}
    >
      {/* Left: page context */}
      {header ? (
        <div className="flex flex-col justify-center py-1.5 min-w-0 mr-4">
          {header.breadcrumbs && header.breadcrumbs.length > 0 && (
            <Breadcrumb>
              <BreadcrumbList className="text-xs">
                {header.breadcrumbs.map((crumb, i) => (
                  <Fragment key={i}>
                    {i > 0 && <BreadcrumbSeparator />}
                    <BreadcrumbItem>
                      {crumb.href ? (
                        <BreadcrumbLink href={crumb.href}>{crumb.label}</BreadcrumbLink>
                      ) : (
                        <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                      )}
                    </BreadcrumbItem>
                  </Fragment>
                ))}
              </BreadcrumbList>
            </Breadcrumb>
          )}
          <div className="flex items-center gap-2">
            {header.title && (
              <h1 className="text-sm font-semibold text-foreground truncate">{header.title}</h1>
            )}
            {header.description && (
              <span className="text-xs text-muted-foreground truncate hidden sm:inline">
                — {header.description}
              </span>
            )}
            {header.badge && <div className="shrink-0">{header.badge}</div>}
          </div>
        </div>
      ) : (
        <div />
      )}

      {/* Right: controls */}
      <div className="flex items-center gap-3 shrink-0">
        <UniversalSearch />
        <ThemeToggle />
        <NotificationBell />
        <div className="ml-1">
          <ProfileDropdown
            profile={profile}
            user={user}
            onEditProfile={onEditProfile}
            onSignOut={onSignOut}
          />
        </div>
      </div>
    </header>
  );
}

interface AppLayoutProps {
  children: React.ReactNode;
}

const mobileNavLinks = [
  { label: "Home", href: "/dashboard", icon: LayoutDashboard },
  { label: "Announcements", href: "/updates", icon: Megaphone },
  { label: "Applications", href: "/applications", icon: ClipboardList },
  { label: "Courses", href: "/courses", icon: GraduationCap },
  { label: "Events", href: "/events", icon: CalendarDays },
  { label: "Feedback", href: "/feedback", icon: MessageSquarePlus },
  { label: "Guidance", href: "/resources?tab=guidance", icon: MessageCircle },
  { label: "My Journey", href: "/my-journey", icon: Map },
  { label: "Project Openings", href: "/project-openings", icon: Handshake },
  { label: "Resources", href: "/resources", icon: BookOpen },
];

const mobileAdminLinks = [
  { label: "Activity Log", href: "/admin/activity-log", icon: Activity },
  { label: "Clients & Projects", href: "/admin/clients", icon: Building2 },
  { label: "Recruiting Center", href: "/admin/roster", icon: Users },
  { label: "User Admin", href: "/admin/users", icon: ShieldCheck },
];

export function AppLayout({ children }: AppLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, loading, signOut } = useAuth();
  const { isAdmin } = useAdmin();
  const isMobile = useIsMobile();
  useAnnouncementRealtime();
  useNotificationRealtime();

  const isActive = (href: string) =>
    location.pathname === href || location.pathname.startsWith(href + "/");

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
    setMobileMenuOpen(false);
  };

  // Public pages (no sidebar)
  const isPublicPage =
    !user ||
    ["/", "/login", "/register", "/forgot-password", "/reset-password"].includes(
      location.pathname
    );

  if (isPublicPage) {
    return (
      <div className="min-h-screen flex flex-col bg-background text-foreground">
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <header
          className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
          role="banner"
        >
          <nav
            className="container-app flex h-16 items-center justify-between"
            aria-label="Main navigation"
          >
            <Link
              to="/"
              className="flex items-center gap-2 font-bold text-lg"
              aria-label="Tech Fleet Home"
            >
              <img
                src={techFleetLogo}
                alt="Tech Fleet"
                className="h-8 w-8 dark:invert"
                width={32}
                height={32}
              />
              <span className="hidden sm:inline">Tech Fleet</span>
            </Link>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              {!loading && !user && (
                <Link to="/login">
                  <Button variant="outline" size="sm">
                    <LogIn className="h-4 w-4 mr-1" />
                    Connect
                  </Button>
                </Link>
              )}
            </div>
          </nav>
        </header>
        <main id="main-content" className="flex-1" role="main" tabIndex={-1}>
          {children}
        </main>
        <ProfileSetupDialog />
        <footer className="border-t bg-card" role="contentinfo">
          <div className="container-app py-8">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <img
                  src={techFleetLogo}
                  alt=""
                  className="h-6 w-6 dark:invert"
                  width={24}
                  height={24}
                  aria-hidden="true"
                />
                <span className="text-sm text-muted-foreground">
                  © {new Date().getFullYear()} Tech Fleet. All rights reserved.
                </span>
              </div>
              <nav
                aria-label="Footer navigation"
                className="flex gap-4 text-sm text-muted-foreground"
              >
                <a
                  href="https://techfleet.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-foreground transition-colors"
                >
                  Website
                </a>
              </nav>
            </div>
          </div>
        </footer>
      </div>
    );
  }

  // Authenticated: sidebar on desktop, hamburger on mobile
  if (isMobile) {
    return (
      <div className="min-h-screen flex flex-col bg-background text-foreground">
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <header
          className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
          role="banner"
        >
          <nav
            className="container-app flex h-14 items-center justify-between"
            aria-label="Main navigation"
          >
            <Link
              to="/dashboard"
              className="flex items-center gap-2 font-bold text-base"
              aria-label="Tech Fleet Home"
            >
              <img
                src={techFleetLogo}
                alt="Tech Fleet"
                className="h-7 w-7 dark:invert"
                width={28}
                height={28}
              />
              <span>Tech Fleet</span>
            </Link>
            <div className="flex items-center gap-1">
              <UniversalSearch />
              <ThemeToggle />
              <NotificationBell />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                aria-expanded={mobileMenuOpen}
                aria-controls="mobile-menu"
                aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
              >
                {mobileMenuOpen ? (
                  <X className="h-5 w-5" />
                ) : (
                  <Menu className="h-5 w-5" />
                )}
              </Button>
            </div>
          </nav>
          {mobileMenuOpen && (
            <div
              id="mobile-menu"
              className="border-t animate-fade-in max-h-[calc(100vh-4rem)] overflow-y-auto"
              role="menu"
            >
              <div className="container-app py-4 space-y-1">
                {mobileNavLinks.map(({ label, href, icon: Icon }) => (
                  <Link
                    key={href}
                    to={href}
                    className={`flex items-center gap-3 px-3 py-3 rounded-md text-sm font-medium transition-colors ${
                      isActive(href)
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent"
                    }`}
                    onClick={() => setMobileMenuOpen(false)}
                    aria-current={isActive(href) ? "page" : undefined}
                    role="menuitem"
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </Link>
                ))}
                {isAdmin && (
                  <>
                    <div className="pt-3 border-t">
                      <p className="px-3 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Admin</p>
                    </div>
                    {mobileAdminLinks.map(({ label, href, icon: Icon }) => (
                      <Link
                        key={href}
                        to={href}
                        className={`flex items-center gap-3 px-3 py-3 rounded-md text-sm font-medium transition-colors ${
                          isActive(href)
                            ? "bg-primary/10 text-primary"
                            : "text-muted-foreground hover:text-foreground hover:bg-accent"
                        }`}
                        onClick={() => setMobileMenuOpen(false)}
                        aria-current={isActive(href) ? "page" : undefined}
                        role="menuitem"
                      >
                        <Icon className="h-4 w-4" />
                        {label}
                      </Link>
                    ))}
                  </>
                )}
                <div className="pt-3 border-t space-y-2">
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => {
                      navigate("/profile/edit");
                      setMobileMenuOpen(false);
                    }}
                  >
                    <UserPen className="h-4 w-4 mr-2" />
                    Edit Profile
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={handleSignOut}
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    Sign Out
                  </Button>
                </div>
              </div>
            </div>
          )}
        </header>
        <AnnouncementBanner {...CURRENT_BANNER} />
        <main id="main-content" className="flex-1" role="main" tabIndex={-1}>
          {children}
        </main>
        <ProfileSetupDialog />
        <FleetyChatWidget />
      </div>
    );
  }

  // Desktop: sidebar layout
  return (
    <PageHeaderProvider>
      <SidebarProvider defaultOpen={true}>
        <div className="min-h-screen flex w-full bg-background text-foreground">
          <a href="#main-content" className="skip-link">
            Skip to main content
          </a>
          <AppSidebar />
          <div className="flex-1 flex flex-col min-w-0">
            <DesktopHeader
              profile={profile}
              user={user}
              onEditProfile={() => navigate("/profile/edit")}
              onSignOut={handleSignOut}
            />
            <AnnouncementBanner {...CURRENT_BANNER} />
            <main
              id="main-content"
              className="flex-1"
              role="main"
              tabIndex={-1}
            >
              {children}
            </main>
          </div>
        </div>
        <ProfileSetupDialog />
        <FleetyChatWidget />
      </SidebarProvider>
    </PageHeaderProvider>
  );
}
