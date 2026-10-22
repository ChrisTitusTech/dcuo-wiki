# Remaining category imports

The category foundation expansion adds 71 canonical source articles and 14 Base
Items continuation pages. The 1,586 earlier article records and their section
positions are preserved. Character, Combat, Equipment, Locations, Collectibles,
Instances and Guides now have their missing category foundations. Feats, Story
and Quests retain their existing content.

This is not a complete migration of every source item page. The main-namespace
inventory has 28,636 candidate URLs, including redirects and pages that may lack
substantive information. Downloads are staged and never publish automatically.

## Download and resume

`node scripts/download-catalog.mjs --limit 100` previews a batch without using
credits. Add `--write` to download it with Firecrawl. The key is read from the
existing environment or ignored `.env` and is never written to the manifests.

`node scripts/download-all-catalog.mjs` previews the remaining download plan.
`node scripts/download-all-catalog.mjs --write` runs sequential 100-URL batches
until captures are available or a batch requires attention. Run it on a machine
that will remain awake. The account's concurrency limit controls throughput;
no subscription upgrade is made. No more than one batch is queued at a time.

Bulk progress is isolated from the committed snapshot:

- `.import-cache/catalog/download-all-state.json`: process, status and totals.
- `.import-cache/catalog/download-all.log`: progress and failures.
- `.import-cache/catalog/download-progress.json`: per-source download records.
- `.import-cache/catalog/background-job.json`: resumable remote batch state.
- `.import-cache/catalog/download-all.lock`: active bulk runner's process ID.

Stop the recorded runner process with SIGTERM to stop submitting new batches.
Already accepted remote work can finish; retain its job record for resumption.
The lock is removed on a normal stop. After a machine crash, verify that the
recorded process is absent before removing a stale lock. Do not run a foreground
writer while the bulk runner is active. Failed captures are held for review,
not repeatedly resubmitted by the bulk runner. A terminal batch that omits a
source records that source as failed, and stops for inspection.

## Review and publish

1. Preserve the bulk progress file, then stop the runner before foreground work.
   Merge its reviewed download records into `data/catalog-downloads.json` when
   preparing a new publication batch. Verify cached HTML hashes and source URLs.
2. Run `node scripts/stage-catalog.mjs`. Output is
   `.import-cache/catalog/staged.json`; nothing is published. This stage currently
   handles the explicit category foundations. Deeper item, mission and character
   pages require category-specific review and conversion before being added.
3. Review the full source text, tables, images and canonical redirects. Do not
   publish disambiguation pages, empty fields or incomplete artifact effects.
   Quest pages retain their separate location and video-research requirements.
4. Copy new image originals and previews to R2 using [MEDIA.md](MEDIA.md), update
   their provenance catalog, and verify every public original and preview URL.
5. Run `node scripts/publish-catalog.mjs` for a preview. Add `--write` only after
   editorial review. Large catalogs are split into linked, editable parts.
   Existing article records are skipped. A write-ahead journal recovers an
   interrupted four-file publication; it refuses unrelated file changes.
6. Run `node scripts/inventory.mjs`, `npm run validate`,
   `npm run test:browser`, `npm run test:cloudflare` and `npm run deploy:check`.
   Complete independent review, commit, and deploy within the owner's approval.
7. Check the actual deployment, new pages, local links, release filters, image
   popouts and preserved community corrections. Keep the file-budget guard.
   The full candidate inventory exceeds the free static-file allowance; determine
   qualifying content and storage architecture before publishing at that scale.
