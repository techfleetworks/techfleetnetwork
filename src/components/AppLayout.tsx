import { useState } from "react";
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
  Bot,
  CalendarDays,
  Megaphone,
} from "lucide-react";
import { Button } from "./ui/button";
import { ThemeToggle } from "./ThemeToggle";
import { ProfileEditPanel } from "./ProfileEditPanel";
import { ProfileSetupDialog } from "./ProfileSetupDialog";
import { useAuth } from "@/contexts/AuthContext";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import techFleetLogo from "@/assets/tech-fleet-logo.svg";
import { UniversalSearch } from "./UniversalSearch";
import { NotificationBell } from "./NotificationBell";
import type { Profile } from "@/services/profile.service";
import type { User } from "@supabase/supabase-js";

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

interface AppLayoutProps {
  children: React.ReactNode;
}

const mobileNavLinks = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Updates", href: "/updates", icon: Megaphone },
  { label: "Courses", href: "/courses", icon: GraduationCap },
  { label: "Events", href: "/events", icon: CalendarDays },
  { label: "Resources", href: "/resources", icon: BookOpen },
  { label: "Fleety", href: "/chat", icon: Bot },
];

export function AppLayout({ children }: AppLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileEditOpen, setProfileEditOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, loading, signOut } = useAuth();
  const isMobile = useIsMobile();

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
        <ProfileEditPanel open={profileEditOpen} onOpenChange={setProfileEditOpen} />
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
              className="border-t animate-fade-in"
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
                <div className="pt-3 border-t space-y-2">
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => {
                      setProfileEditOpen(true);
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
        <main id="main-content" className="flex-1" role="main" tabIndex={-1}>
          {children}
        </main>
        <ProfileSetupDialog />
        <ProfileEditPanel
          open={profileEditOpen}
          onOpenChange={setProfileEditOpen}
        />
      </div>
    );
  }

  // Desktop: sidebar layout
  return (
    <SidebarProvider defaultOpen={true}>
      <div className="min-h-screen flex w-full bg-background text-foreground">
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header
            className="sticky top-0 z-40 h-12 flex items-center justify-end border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4"
            role="banner"
          >
            <div className="flex items-center">
              <UniversalSearch />
              <ThemeToggle />
              <div className="ml-4">
                <ProfileDropdown
                  profile={profile}
                  user={user}
                  onEditProfile={() => setProfileEditOpen(true)}
                  onSignOut={handleSignOut}
                />
              </div>
            </div>
          </header>
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
      <ProfileEditPanel
        open={profileEditOpen}
        onOpenChange={setProfileEditOpen}
      />
    </SidebarProvider>
  );
}
