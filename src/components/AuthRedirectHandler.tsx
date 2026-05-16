import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { normalizeSafeRedirectTarget } from "@/lib/security";

const AUTH_REDIRECT_KEY = "auth_redirect";

export function AuthRedirectHandler() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (loading || !user) return;
    const storedRedirect = sessionStorage.getItem(AUTH_REDIRECT_KEY) ?? localStorage.getItem(AUTH_REDIRECT_KEY);
    if (!storedRedirect) return;

    sessionStorage.removeItem(AUTH_REDIRECT_KEY);
    localStorage.removeItem(AUTH_REDIRECT_KEY);
    const target = normalizeSafeRedirectTarget(storedRedirect);
    const current = `${location.pathname}${location.search}${location.hash}`;
    if (target !== current) navigate(target, { replace: true });
  }, [loading, user, navigate, location.pathname, location.search, location.hash]);

  return null;
}