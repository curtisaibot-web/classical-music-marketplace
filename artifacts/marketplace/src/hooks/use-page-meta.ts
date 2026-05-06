import { useEffect } from "react";

interface PageMetaOptions {
  title: string;
  description?: string;
  imageUrl?: string;
  type?: string;
  canonicalUrl?: string;
}

function setMetaTag(property: string, content: string, isName = false) {
  const attr = isName ? "name" : "property";
  let el = document.querySelector(`meta[${attr}="${property}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, property);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

export function usePageMeta({ title, description, imageUrl, type = "website", canonicalUrl }: PageMetaOptions) {
  useEffect(() => {
    const siteTitle = "Classical Music Marketplace";
    const fullTitle = title ? `${title} | ${siteTitle}` : siteTitle;

    document.title = fullTitle;

    setMetaTag("og:title", fullTitle);
    setMetaTag("og:type", type);
    if (description) {
      setMetaTag("description", description, true);
      setMetaTag("og:description", description);
    }
    if (imageUrl) {
      setMetaTag("og:image", imageUrl);
    }
    if (canonicalUrl) {
      setMetaTag("og:url", canonicalUrl);
    }

    return () => {
      document.title = siteTitle;
    };
  }, [title, description, imageUrl, type, canonicalUrl]);
}
