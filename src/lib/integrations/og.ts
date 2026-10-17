import "server-only";

/**
 * Finds a source page's own preview image (og:image / twitter:image), so
 * editorial cards use real photography from the cited article.
 */
export async function findOgImage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000), redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 (compatible; SEAN-OS/1.0)", Accept: "text/html" } });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return null;
    const html = (await res.text()).slice(0, 200_000);
    const m =
      html.match(/<meta[^>]+(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image)["'][^>]*content=["']([^"']+)["']/i) ??
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image|twitter:image)["']/i);
    if (!m) return null;
    const abs = new URL(m[1].replace(/&amp;/g, "&"), res.url).toString();
    return abs.startsWith("https://") ? abs : null;
  } catch {
    return null;
  }
}

export async function firstOgImage(urls: string[], max = 3): Promise<string | null> {
  for (const u of urls.slice(0, max)) {
    const img = await findOgImage(u);
    if (img) return img;
  }
  return null;
}
