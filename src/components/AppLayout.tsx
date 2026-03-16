import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Menu, X, Rocket, BookOpen, GraduationCap, LayoutDashboard, LogIn, LogOut, UserPen, MessageCircle } from "lucide-react";
import { Button } from "./ui/button";
import { ThemeToggle } from "./ThemeToggle";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { ProfileEditPanel } from "./ProfileEditPanel";
import { useAuth } from "@/contexts/AuthContext";
import techFleetLogo from "@/assets/tech-fleet-logo.svg";

interface AppLayoutProps {
  children: React.ReactNode;
}

const navLinks = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "My Journey", href: "/journey/first-steps", icon: Rocket },
  { label: "Training", href: "/training", icon: GraduationCap },
  { label: "Resources", href: "/resources", icon: BookOpen },
  { label: "Ask TF", href: "/chat", icon: MessageCircle },
];

export function AppLayout({ children }: AppLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileEditOpen, setProfileEditOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, loading, signOut } = useAuth();

  const isActive = (href: string) => location.pathname === href || location.pathname.startsWith(href + "/");

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
    setMobileMenuOpen(false);
  };

  const avatarInitials = profile
    ? `${(profile.first_name?.[0] || "").toUpperCase()}${(profile.last_name?.[0] || "").toUpperCase()}` || "U"
    : (user?.user_metadata?.full_name?.[0] || "U").toUpperCase();

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60" role="banner">
        <nav className="container-app flex h-16 items-center justify-between" aria-label="Main navigation">
          <Link to="/" className="flex items-center gap-2 font-bold text-lg" aria-label="Tech Fleet Home">
            <img src={techFleetLogo} alt="Tech Fleet" className="h-8 w-8 dark:invert" />
            <span className="hidden sm:inline">Tech Fleet</span>
          </Link>

          {/* Desktop nav — only show when logged in */}
          {user && (
            <div className="hidden md:flex items-center gap-1" role="menubar">
              {navLinks.map(({ label, href, icon: Icon }) => (
                <Link
                  key={href}
                  to={href}
                  className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive(href)
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  }`}
                  aria-current={isActive(href) ? "page" : undefined}
                  role="menuitem"
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <ThemeToggle />
            {!loading && !user && (
              <Link to="/login" className="hidden md:inline-flex">
                <Button variant="outline" size="sm">
                  <LogIn className="h-4 w-4 mr-1" />
                  Connect
                </Button>
              </Link>
            )}
            {!loading && user && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="hidden md:inline-flex rounded-full">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={profile?.avatar_url || undefined} alt="Profile" />
                      <AvatarFallback className="text-xs">{avatarInitials}</AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem onClick={() => setProfileEditOpen(true)}>
                    <UserPen className="h-4 w-4 mr-2" />
                    Edit Profile
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut}>
                    <LogOut className="h-4 w-4 mr-2" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-menu"
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </nav>

        {mobileMenuOpen && (
          <div id="mobile-menu" className="md:hidden border-t animate-fade-in" role="menu">
            <div className="container-app py-4 space-y-1">
              {user && navLinks.map(({ label, href, icon: Icon }) => (
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
                {!user ? (
                  <Link to="/login" onClick={() => setMobileMenuOpen(false)}>
                    <Button variant="outline" className="w-full justify-start">
                      <LogIn className="h-4 w-4 mr-2" />
                      Connect
                    </Button>
                  </Link>
                ) : (
                  <>
                    <Button variant="outline" className="w-full justify-start" onClick={() => { setProfileEditOpen(true); setMobileMenuOpen(false); }}>
                      <UserPen className="h-4 w-4 mr-2" />
                      Edit Profile
                    </Button>
                    <Button variant="outline" className="w-full justify-start" onClick={handleSignOut}>
                      <LogOut className="h-4 w-4 mr-2" />
                      Sign Out
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </header>

      <main id="main-content" className="flex-1" role="main" tabIndex={-1}>
        {children}
      </main>

      <ProfileEditPanel open={profileEditOpen} onOpenChange={setProfileEditOpen} />

      <footer className="border-t bg-card" role="contentinfo">
        <div className="container-app py-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <img src={techFleetLogo} alt="" className="h-6 w-6 dark:invert" aria-hidden="true" />
              <span className="text-sm text-muted-foreground">
                © {new Date().getFullYear()} Tech Fleet. All rights reserved.
              </span>
            </div>
            <nav aria-label="Footer navigation" className="flex gap-4 text-sm text-muted-foreground">
              <a href="https://techfleet.org" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
                Website
              </a>
              <Link to="/resources" className="hover:text-foreground transition-colors">Resources</Link>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}
