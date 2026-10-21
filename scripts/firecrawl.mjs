export async function scrape(
  url,
  {
    key,
    fetcher = fetch,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
    includeTags = [
      ".mw-parser-output",
      ".mw-allpages-body",
      ".mw-allpages-nav",
    ],
  } = {},
) {
  if (!key) throw new Error("Set FIRECRAWL_API_KEY in the environment.");
  for (let attempt = 0; attempt < 3; attempt++) {
    let res;
    try {
      res = await fetcher("https://api.firecrawl.dev/v2/scrape", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url,
          formats: ["markdown", "links", "html"],
          includeTags,
          onlyMainContent: true,
        }),
        signal: AbortSignal.timeout(60000),
      });
    } catch {
      if (attempt === 2)
        throw new Error("Firecrawl request failed after three attempts");
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      if (attempt === 2) throw new Error(`Firecrawl HTTP ${res.status}`);
      const retryAfter = Number(res.headers?.get("retry-after"));
      await sleep(
        res.status === 429
          ? Math.min(
              60000,
              Math.max(1000, retryAfter > 0 ? retryAfter * 1000 : 60000),
            )
          : 1000 * 2 ** attempt,
      );
      continue;
    }
    if (!res.ok) {
      const error = new Error(`Firecrawl HTTP ${res.status}`);
      error.status = res.status;
      throw error;
    }
    const body = await res.json();
    if (
      !body.success ||
      (body.data?.metadata?.statusCode !== undefined &&
        body.data.metadata.statusCode !== 200) ||
      typeof body.data?.markdown !== "string" ||
      !body.data.markdown.trim()
    )
      throw new Error("No article content returned");
    return body.data;
  }
}
