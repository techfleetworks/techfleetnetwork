import { Outlet, Link } from "react-router-dom";
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import techFleetLogo from "@/assets/tech-fleet-logo.svg";

export function PublicShell() {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <header
        className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
        role="banner"
      >
        <nav className="container-app flex h-16 items-center justify-between" aria-label="Main navigation">
          <a href="https://techfleet.org" className="flex items-center gap-2 font-bold text-lg" aria-label="Tech Fleet Home">
            <img src={techFleetLogo} alt="Tech Fleet" className="h-8 w-8 dark:invert" width={32} height={32} />
          </a>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link to="/login">
              <Button variant="outline" size="sm">
                <LogIn className="h-4 w-4 mr-1" />
                Connect
              </Button>
            </Link>
          </div>
        </nav>
      </header>
      <main id="main-content" className="flex-1" role="main" tabIndex={-1}>
        <Outlet />
      </main>
      <footer className="border-t bg-card" role="contentinfo">
        <div className="container-app py-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <img src={techFleetLogo} alt="" className="h-6 w-6 dark:invert" width={24} height={24} aria-hidden="true" />
              <span className="text-sm text-muted-foreground">© {new Date().getFullYear()} Tech Fleet. All rights reserved.</span>
            </div>
            <nav aria-label="Footer navigation" className="flex gap-4 text-sm text-muted-foreground">
              <a href="https://techfleet.org" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
                Website
              </a>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}