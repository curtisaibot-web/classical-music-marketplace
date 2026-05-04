export function resolveImageUrl(
  url: string | null | undefined,
  basePath: string,
): string | null {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  const base = basePath.replace(/\/$/, "");
  return `${base}${url}`;
}
