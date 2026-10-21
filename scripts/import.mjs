// Staging only: scraped content never becomes a published article automatically.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const urls = process.argv.slice(2);
if (!urls.length)
  throw new Error(
    "Usage: npm run import -- https://dcuniverseonline.fandom.com/wiki/Article",
  );
const key = process.env.FIRECRAWL_API_KEY;
if (!key)
  throw new Error("Set FIRECRAWL_API_KEY in the environment; never commit it.");
await mkdir(".import-cache", { recursive: true });
let failed = 0;
for (const raw of urls) {
  const url = new URL(raw);
  if (
    url.origin !== "https://dcuniverseonline.fandom.com" ||
    !url.pathname.startsWith("/wiki/")
  )
    throw new Error("Only DCUO Fandom wiki URLs are allowed.");
  url.search = "";
  url.hash = "";
  const id = createHash("sha256").update(url.href).digest("hex");
  const file = `.import-cache/${id}.json`;
  try {
    await readFile(file);
    console.log(`Cached: ${url.pathname}`);
    continue;
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  let saved = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: url.href,
          formats: ["markdown"],
          includeTags: [".mw-parser-output"],
          onlyMainContent: true,
        }),
        signal: AbortSignal.timeout(60000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      if (!body.success || !body.data?.markdown)
        throw new Error("No article content returned");
      await writeFile(
        file,
        JSON.stringify(
          {
            url: url.href,
            retrieved: new Date().toISOString(),
            status: "needs-review",
            ...body.data,
          },
          null,
          2,
        ),
      );
      saved = true;
      console.log(`Staged: ${url.pathname}`);
      break;
    } catch (e) {
      console.error(`Attempt ${attempt + 1}: ${e.message}`);
      if (attempt < 2)
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
  if (!saved) failed++;
}
if (failed) process.exitCode = 1;
