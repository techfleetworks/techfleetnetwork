import { Link } from "react-router-dom";
import { openCookieSettings } from "./CookieConsentBanner";

/**
 * Footer privacy controls — required everywhere by GDPR/CCPA/etc.
 * Renders inline so it can drop into the existing AppLayout footer nav.
 */
export function PrivacyFooterLinks() {
  return (
    <>
      <Link to="/privacy" className="hover:text-foreground transition-colors">
        Privacy Policy
      </Link>
      <Link to="/cookies" className="hover:text-foreground transition-colors">
        Cookie Policy
      </Link>
      <button
        type="button"
        onClick={() => openCookieSettings()}
        className="hover:text-foreground transition-colors underline-offset-2"
      >
        Cookie Settings
      </button>
      <Link to="/privacy#do-not-sell" className="hover:text-foreground transition-colors">
        Do Not Sell or Share My Personal Information
      </Link>
    </>
  );
}
