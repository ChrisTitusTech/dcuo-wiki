# Delivery roadmap

## Foundation scope

- Astro static site with responsive navigation, search, filters, article contents, source attribution, and a 404 page.
- Four curated guides based on Firecrawl retrieval, including one quest with documented landmark locations and linked maps.
- Staging-only importer, publication checks, output-size guard, tests, and CI.
- Commit and push validated foundation to main.

## Follow-up milestones (not completed)

1. Establish canonical inventory using sitemaps, all-pages enumeration, categories, and link discovery; record exclusions and duplicates.
2. Expand representative samples across mission types, equipment, feats, maps, and faction variants. Verify extraction of tables and infoboxes before bulk importing.
3. Enrich quests with map evidence and exact-quest YouTube matching. Retain research evidence and reject incidental phrase matches.
4. Measure qualifying page count, media volume, search index size, and build time. Choose static or server-rendered storage architecture without dropping useful content to fit limits.
5. Connect and verify Cloudflare deployment and domain once account access is available. Test actual live HTTPS, URLs, and rollback.

## Acceptance boundaries

No placeholders or name-only entries. No invented locations. No automatic publication from scraped content. Missing exact locations may be disclosed for otherwise useful guides after research. Full content coverage and the future 20,000-file fit are not established by this pilot.

## Foundation status

Implemented and locally validated. See VALIDATION.md for tests, independent review, output size, and explicit limitations. Foundation published as bad07c3; its GitHub CI passed. Cloudflare activation remains separate.

## Discovery and enrichment increment

- Six sequential All Pages batches retrieved through Firecrawl; 2,159 article candidates tracked with supporting pages and exclusions. Continuation is saved; enumeration is not exhaustive.
- Canonical URL inventory and resumable discovery command implemented. Legacy malformed Markdown candidates are not consumed.
- Four additional guides cover Cape Carmine Lighthouse, Viva la Lucha Libre, Out in the Streets, and House of Venom. Tables, related guides, location evidence links, and verified video chapter links are supported.
- Video matching uses retrieved title and description evidence; footage has not been independently reviewed. Map references describe source landmarks and do not invent exact coordinates.
- Full inventory, redirect resolution, bulk quality review, equipment/infobox extraction validation, and Cloudflare activation remain open.

## Main-namespace enumeration complete

- Followed all 84 All Pages batches to the terminal Zod Emblem batch, which has no next-page link.
- Derived inventory contains 28,636 unique article candidates and 12 supporting pages. The main-namespace enumeration flag is complete; content review/import and comprehensive supporting-namespace discovery are not.
- A page-per-candidate static deployment cannot fit the 20,000-file free limit. Quality-filtered size is still unknown; decide between static and server-rendered hosting after classification, without excluding useful content merely to fit the limit.
- Next work: resolve redirect targets, triage empty and duplicate content, validate representative infobox/table extraction, and expand reviewed quest coverage.

## Static hosting decision and representative content batch

- Selected static Astro on Workers: free initially, with a $5/month base paid tier if the reviewed output exceeds the free file allowance. Keep the current 18,000-file guard until an account upgrade is confirmed. No subscription changes made.
- Published Feats, Equipment, and Weapon Mastery after Firecrawl source review; 11 guides total. Preserved the complete 11-row mastery combo table and four feat reward tiers.
- Omitted dated equipment purchase prices and reconciled contradictory feat prose against the explicit four-star table.
- Held The Strategist Card for further extraction: article-body retrieval omitted artifact stats, so the equipment infobox milestone remains open. A guessed Strategist_Card URL returned 404; the inventory provided the correct The_Strategist_Card page.
- Next: inventory-driven staging and redirect/placeholder triage, full infobox extraction, additional quest map/video research, and live Cloudflare connection. The hosting decision supersedes the earlier open static-versus-server-rendered decision.

## Activation preparation

- Added pinned Wrangler, guarded deploy/dry-run commands, and a local Cloudflare serving test. Free-tier file guard stays unchanged.
- Added inventory-driven import batches with a network-free preview, cache resume, and a 100-attempt ceiling. Error HTTP pages cannot be reused as successful cache entries.
- Published the Artifacts overview as guide 12; the confirmed Artifact alias redirects to it. No duplicate guide is generated.
- Rechecked The Strategist Card and Page of Destiny with a wider content selector: returned HTML still lacks stat infoboxes. Held both. Artifact - The Strategist Card also contains conflicting intro/objective instance names, so it remains unpublished.
- Bounded crawl attempts returned zero pages from the redirect root and only the canonical overview from the corrected root. They do not establish bulk content coverage.
- Account action now required for deployment: Wrangler reports unauthenticated, and Cloudflare token/account environment variables are absent. Connect the GitHub repository in Cloudflare or authenticate this workstation, then verify live deployment and domain. No account or paid-plan changes made.
- Full review of the 28,636 candidates remains a separate ongoing content task; activation can publish the reviewed subset now.

## Initial live deployment

- Created the approved dedicated dcuo-wiki build token through Cloudflare Workers Builds and connected ChrisTitusTech/dcuo-wiki on main. Cloudflare's generated token has its standard account-level build permissions; its name does not imply worker-only permission scope.
- Initial Cloudflare build e554f334-7eb6-4d8c-bebd-87e949fdc003 completed successfully. One asset-upload retry recovered.
- Connected the existing root domain dcuo-wiki.com to production. HTTPS now serves all 12 reviewed guides. No paid subscription was activated.
- Added the custom-domain route to wrangler.jsonc and explicitly disabled workers.dev and preview URLs to preserve intended routing on future deployments.
- Bulk content review remains unfinished. This is the reviewed starter site, not the full 28,636-candidate wiki.

Git automation blocker: Cloudflare reports the Git account disconnected after the initial manual build. GitHub sign-in is required to inspect/reconnect the installation. The site is live, but automatic deploy-on-push and deployment of commit 4f7f0e4 remain pending.

## Player accounts increment

- Owner selected Discord sign-in, character details, and an optional screenshot.
- Owner explicitly chose Census character-name matching as sufficient, without ownership challenges. This does not establish that a Discord user owns the character; UI labels this as Census matched.
- Added account/profile UI, Discord OAuth, D1 schema, exact-name Census matching, bounded screenshots, and pending contribution review queue. Account features fail closed until production bindings and provider secrets are configured.
- Activation instructions and privacy/operational limitations are in docs/ACCOUNTS.md. Real Discord/Census/D1 production acceptance remains pending. No paid plan activated.
- GitHub installation was missing this repository. The change is prepared, and the owner chose to save it themselves; deployment-on-push still needs verification after that save.

The owner saved GitHub installation access. Cloudflare settings no longer report a disconnected Git account; verify the next push-triggered deployment.

Commit cb23314 passed GitHub CI and deployed automatically in Cloudflare build 4371cf08-2257-4159-a0de-afa0943a7f26 (version 954a5593-f823-4abe-905a-47327e4068c2). Live /api/status confirms login and Census matching remain disabled until activation; /account/ and existing articles respond successfully. GitHub deployment automation is restored.

## Production database activation

Created dcuo-wiki-accounts in the existing Cloudflare account on the free allocation. Applied 0001_accounts.sql through the D1 console, verified all six application tables and five indexes, and recorded the migration in Wrangler-compatible d1_migrations. Added the permanent DB binding to wrangler.jsonc. All four production secrets are configured; approved Census service ID and numeric moderator ID were updated separately. Deployment and real Discord sign-in acceptance must be verified after this binding is published.

## Direct player corrections

The owner confirmed real Discord sign-in and explicitly authorized every Census-matched player to edit and publish existing article content without moderator approval. This supersedes review-only publication for corrections. New-guide proposals continue through the existing review queue.

Implement section editing in the article, immediate D1-backed publication, public revision history attributed to the character, source/reason requirements, Census revalidation, and optimistic concurrency. Keep original source attribution. Validate anonymous/unmatched/stale/Census-failed writes, safe rendering, search updates, and restoring earlier text. Apply additive migration 0002 before deployment; preserve history on rollback.

Direct corrections implementation and local validation are complete, with the additive production revision-history migration applied. Final review passed after conflict-recovery and pending-publication draft fixes. Live deployment verification follows the main push; full candidate import remains separate.

## First bounded conversion batch

Downloaded the first 25 unreviewed inventory URLs using the owner's local
Firecrawl key. All succeeded after bounded retries of rate-limited pages. These
resolve to 20 unique canonical pages. `data/import-batches/001.json` preserves
source URLs, retrieval IDs, content hashes and review decisions.

Converted the two 'Til Death Do Us Part briefing episodes into complete six-stop
location guides, with 24 copied map/location screenshots in R2. Four alternate
URLs resolve to the first briefing guide and do not create duplicate articles.
The remaining 19 requested URLs are staged with explicit hold reasons; they are
not all placeholders and still need focused conversion/review. Existing player
correction baselines are unchanged. Fourteen reviewed guides are now prepared.

The importer accepts FIRECRAWL_KEY from ignored .env, stops after rejected
credentials, and waits on rate limits. The next inventory batch reuses existing
cached records. Automated review/conversion of every wiki type is not complete.

## Coverage correction (2026-10-20)

Powers expanded from its pilot summary to the full source-page section scope,
with inline R2 artwork and original live revisions preserved. Before another
broad import, fill the Collections, Artifacts, Investigations and Feats gaps
recorded in `data/coverage-audit.json` and `docs/CONTENT-COVERAGE.md`.

## Active quest-first completion pass (2026-10-21)

Owner requested sustained implementation and deployment, with quest walkthroughs,
map points and exact-match YouTube guides ahead of reference directories. This
supersedes the reference-first order in the previous coverage correction.

- [x] Complete existing three quests and four mapped location/collectible guides:
  missing route images, objectives/context, exact-name video research, chapters.
- [x] Expand a connected set of additional quest walkthroughs with sourced maps
  and matching videos; record researched exclusions instead of publishing stubs.
- [x] Add further mapped collectible guides with source-complete node coverage.
- [x] Restore Collections, Artifacts, Investigations and Feats reference coverage,
  then remaining Equipment/Weapon Mastery details.
- [x] Convert individual power ability lists after the practical guide work.
- [x] Resume bounded inventory imports with section/image coverage evidence.

Each completed batch must preserve live revisions, copy/verify images through R2,
pass content/build/browser/Cloudflare checks and Codex review, then push main and
verify production. Completion means the recorded scope passed, not that every
one of the 28,636 candidate URLs has been converted. That original full-wiki
objective remains open until candidate disposition and coverage are established.

Quest-first batch 1: added 21 scene screenshots (42 R2 objects with previews),
source-backed mission context and exact-match videos for Viva la Lucha Libre,
Cape Carmine Lighthouse and both Til Death briefing episodes. All twelve briefing
chapters match wiki token identity, including the different Episode I video order.
Grab and Smash has a documented no-match search; unrelated videos were rejected.
Existing editable baselines remain unchanged. R2 objects were byte-compared with
local files and their attribution catalog updated in D1. Validation: type checking,
35 unit tests, production build, 9 browser tests, 7 Cloudflare integration tests,
and independent Codex review passed. Build contains 30 files against 18,000 budget.

Quest-first batch 2: Punks 'n Robbers, Poisoned Bait, Beatdown for Bane and
Bane Brought Down now include sourced map context and exact-title video matches.
The Precipice of Fear and Gorilla Bomb Components retain all six nodes, alternate
locations, recording text, rewards and verified video coverage. Nineteen new
images (38 R2 objects) supplement reused maps; decorative mail/investigation icons
and empty trivia headings are intentionally omitted. Bane's Back hero/villain
pages remain held: thin introductory content and conflicting level information
need further evidence. Bane Brought Down video is labeled broader mission footage;
no precise turn-in timestamp is claimed. Validation passed (35 unit, 9 browser,
build/type checks); independent review's stale quest-count finding was fixed and
retested. Existing Cloudflare integration evidence applies to unchanged runtime.

Reference batch: restored 379 collection table entries, 82 artifact entries, 126
investigation directory entries, feat categories and point/replay-badge tables,
Equipment detail and Weapon Mastery context. Existing combo table retained.
Copied 34 additional reference images and verified all 68 R2 objects; D1 catalog
updated. Long detail-link lists are collapsible. Embedded video captions without
verified video targets, decorative badges and navigation templates are recorded
as omitted. The source's conflicting artifact slot count is explicitly flagged.
All 213 existing editable baselines remain unchanged. Type/build, 10 browser and
7 Cloudflare integration checks passed. Converter regression tests cover table
splitting, content after TOC, actual headers and multi-row directories. Independent
review found a directory/header ambiguity; the parser now promotes only recognized
replacement header rows, with a regression test. Full wiki import remains open.

Power-list and bounded-import completion: added all 15 power-set pages, preserving
465 source ability/role rows, interaction tables and the available combo tables.
Light's 42 construct rows were reconstructed from HTML rowspans; Celestial's
three malformed Markdown interaction rows were reconstructed from source HTML.
The converter now rejects malformed table prose for explicit review. Added 292
credited images (584 R2 objects), including legitimate small ability icons.
All 295 earlier editable baselines remain unchanged. The site now has 35 reviewed
articles and 419 image records. Validation: 43 unit tests, 12 browser tests, seven
Cloudflare integration tests, production build and deployment dry run passed.
Build budget: 51 files of 18,000 internal / 20,000 platform limit. Worker upload:
1,470.91 KiB raw / 180.71 KiB compressed. Review's Celestial table finding is fixed
and covered by a browser regression test.

Inventory import resumed for 25 new URLs, reusing 23 cached records, with zero
failed requests. Every capture has a recorded canonical URL, hash, retrieval ID
and review requirement in data/import-batches/002.json. They remain staged because
item infoboxes, historical acquisition or map evidence still need conversion.
This completes the six-step priority pass above, not the full 28,636-page migration.

All 584 new power-image objects were byte-verified against local files. Cloudflare
D1 reports 419 image catalog records after the six successful metadata batches.

## Complete mission guide conversion (authorized October 21, 2026)

- [x] Download and hash-verify every direct Missions category article (1,107).
- [x] Stage all mission source conversions, preserving objectives, tables, source links and useful imagery.
- [ ] Resolve source warnings, thin pages, canonical aliases and missing location context.
- [ ] Research exact-title YouTube references across the mission inventory and verify accepted matches.
- [ ] Copy mission images to R2, verify public objects, and update the attribution catalog.
- [ ] Publish substantive guides with documented source coverage; preserve existing live-edit baselines.
- [ ] Pass content/type/build/browser/Cloudflare checks and independent review, push main, and verify production.

The source's empty headings and maintenance templates must not become wiki content. Named area evidence is distinct from an exact map point; historical versions must stay labeled. Unresolved factual gaps require additional evidence, not invented details or placeholder padding.
