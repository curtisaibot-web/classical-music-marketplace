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

function detectOrgSlug(): string | null {
  const params = new URLSearchParams(window.location.search);
  const param = params.get("org");
  if (param) return param;
  const subdomain = window.location.hostname.split(".")[0];
  if (subdomain && subdomain !== "www" && subdomain !== "harmonia" && subdomain.length > 2) {
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
