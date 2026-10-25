# Complete catalog filing

`data/migration/catalog.json` accounts for the entire bulk download manifest.
Each record carries its source URL/hash, original cache file, category and subtype,
classification evidence, canonical source and disposition. Per-category ledgers
are in `data/migration/filed/`. These record held sources as well as converted ones;
a held source is not a published placeholder. Raw captures stay in ignored cache.

`content/catalog/` contains converted source text, tables, images and attribution.
The original `src/data/articles.json` remains unchanged to preserve player revision
keys. New content uses the same article route and complete player editor.

To reproduce from the existing complete local download cache:

```bash
node scripts/sort-catalog.mjs --write
node scripts/prepare-catalog.mjs
node scripts/refine-catalog.mjs
node scripts/finalize-catalog.mjs
node scripts/file-catalog-captures.mjs
node scripts/file-prior-captures.mjs
node scripts/verify-catalog-filing.mjs
node scripts/inventory.mjs
npm run validate
npm run test:browser
npm run test:cloudflare
npx wrangler deploy --dry-run
```

Sorting is source-backed and conservative: quests without location/video research,
empty items, incomplete artifact effects, ambiguous/disambiguation captures and
unsupported source structures are filed for follow-up. Do not mark these as fully
migrated or fabricate fields. The source's recurring navigation templates are
removed before assessing substance. Source release badges/introduction links,
not incidental navigation links, determine release membership.

The build pre-renders every article. Most retain a static HTML file; Housing HTML
is stored in the same 256 packed assets as source records and editor documents.
The Worker serves that exact HTML at the usual wiki URL. Use the Cloudflare
preview for those pages; the plain Astro preview cannot run Worker routes.
Line markers are exact slug/type pairs; JSON escapes embedded newlines. Only the
requested record is parsed. Pristine editor documents are returned as prepared
JSON; an existing D1 revision always takes precedence. The internal file ceiling
is 19,500 against the platform's 20,000 limit. Packed source files contain public
wiki material only, never player data, credentials or database snapshots.

New images use `/api/catalog-media/<source-url-hash>`. That route permits only
manifest-listed Fandom game images, validates real JPEG/PNG/WebP/GIF signatures,
limits source bytes, and stores the original in `dcuo-wiki-images/catalog/` with
MIME type and attribution. It then redirects to `images.dcuo-wiki.com`. The
`/source` suffix redirects to the credited source File page. Existing originals
and previews remain reused. Newly mirrored originals are lazy-loaded; separate
resized preview generation can be added later without changing article URLs.

No authentication token is exposed to browsers. The public route cannot accept a
remote URL or arbitrary object key. Retryable upstream failures do not store an
error page in R2. Conditional writes preserve an existing stored image.

The full cache archive is `.import-cache/filed/<category>/<disposition>/`, with
human-readable filenames and category indexes. Verified hard links preserve the
exact original captures without duplicating their bytes. Earlier partial captures,
source indexes and research are included in `prior-captures.json`. The compact
`data/migration/summary.json` reports counts and physical archive verification.

The generator commands above are initial-migration tools, not a routine live
content refresh. Later imports must preserve published slugs, section keys and
source baselines so existing player corrections remain attached to their pages.
Use targeted staging for updates; never replace a live source catalog blindly.

After the reviewed main deployment, pre-copy the approved image set resumably:

```bash
node scripts/warm-catalog-media.mjs
node scripts/warm-catalog-media.mjs --write
```

The dry run lists pending work. The writer uses four concurrent requests and an
exclusive lock. Progress is in `.import-cache/catalog/media-progress.json`; retry
messages identify a five-minute network wait. Missing or unsupported images stay
recorded for follow-up. Normal article image requests also perform the same
bounded copy on demand. No Cloudflare token is sent to the browser.
