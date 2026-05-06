import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export interface OrgBranding {
  slug: string;
  name: string;
  logoUrl: string | null;
  description: string | null;
  isPublicMarketplace: boolean;
}

interface OrgContextValue {
  org: OrgBranding | null;
  orgSlug: string | null;
  isLoading: boolean;
}

const OrgContext = createContext<OrgContextValue>({ org: null, orgSlug: null, isLoading: false });

// Known non-org hostnames / patterns that should never be treated as org slugs
const NON_ORG_HOSTS = new Set(["localhost", "www", "harmonia", "127"]);
// Replit dev domains contain a period-separated UUID-like segment; detect by checking for known suffixes
function isDevHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname.startsWith("127.") ||
    hostname.endsWith(".replit.dev") ||
    hostname.endsWith(".repl.co") ||
    hostname.endsWith(".replit.app") ||
    /^\d+\.\d+\.\d+\.\d+$/.test(hostname) // bare IP
  );
}

function detectOrgSlug(): string | null {
  const params = new URLSearchParams(window.location.search);
  const param = params.get("org");
  if (param) return param;
  // Only use subdomain-based detection on real production custom domains,
  // never on localhost or Replit dev/preview hosts.
  const hostname = window.location.hostname;
  if (isDevHost(hostname)) return null;
  const subdomain = hostname.split(".")[0];
  if (subdomain && !NON_ORG_HOSTS.has(subdomain) && subdomain.length > 2) {
    return subdomain;
  }
  return null;
}

export function OrgProvider({ children }: { children: ReactNode }) {
  const [org, setOrg] = useState<OrgBranding | null>(null);
  const [orgSlug, setOrgSlug] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const slug = detectOrgSlug();
    if (!slug) {
      setOrgSlug(null);
      setOrg(null);
      return;
    }
    setOrgSlug(slug);
    setIsLoading(true);
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    fetch(`${base}/api/orgs/${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { org: OrgBranding } | null) => {
        if (data?.org) {
          setOrg(data.org);
          document.title = data.org.name;
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  return <OrgContext.Provider value={{ org, orgSlug, isLoading }}>{children}</OrgContext.Provider>;
}

export function useOrg() {
  return useContext(OrgContext);
}
