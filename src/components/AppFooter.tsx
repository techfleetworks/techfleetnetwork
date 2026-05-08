import { Link } from "react-router-dom";
import { PrivacyFooterLinks } from "./PrivacyFooterLinks";
import techFleetLogo from "@/assets/tech-fleet-logo.svg";

/**
 * Global site footer with policy links. Rendered on every page (public and
 * authenticated) so users can always reach Terms, Privacy, Cookies, and
 * Accessibility from anywhere in the app — required by GDPR / CCPA / WCAG.
 */
export function AppFooter() {
  return (
    <footer className="border-t bg-card mt-auto" role="contentinfo">
      <div className="container-app py-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img
              src={techFleetLogo}
              alt=""
              className="h-5 w-5 dark:invert"
              width={20}
              height={20}
              aria-hidden="true"
            />
            <span className="text-xs text-muted-foreground">
              © {new Date().getFullYear()} Tech Fleet
            </span>
          </div>
          <nav
            aria-label="Footer navigation"
            className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground"
          >
            <Link to="/terms" className="hover:text-foreground transition-colors">
              Terms &amp; Conditions
            </Link>
            <Link to="/terms-of-use" className="hover:text-foreground transition-colors">
              Terms of Use
            </Link>
            <PrivacyFooterLinks />
            <Link to="/accessibility" className="hover:text-foreground transition-colors">
              Accessibility
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
