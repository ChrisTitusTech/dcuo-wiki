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
- [x] Convert all captures, preserving objectives, substantive tables, source links and useful imagery.
- [x] Resolve canonical aliases and record explicit publication/hold dispositions.
- [x] Research exact-title YouTube references across all 1,107 titles and verify accepted metadata matches.
- [x] Copy mission images to R2, byte-verify public originals/previews and update D1 attribution.
- [x] Prepare substantive guides and preserve existing editable parts.
- [x] Complete final independent review, push main and verify production.

Final candidate disposition: 1,012 new guides, seven existing mission guides
retained, two canonical aliases and 86 held sources. The library contains 1,047
articles. Source gaps, insufficient objectives and contradictory prerequisites
remain explicit holds, not empty published pages. All raw captures remain cached.
This completes the direct Missions category pass, not the full 28,636-page migration.

Of the new guides, 944 have source-backed location context, 101 include source
maps and 319 contain 461 verified-title video references. A named area/instance
is distinct from an exact map pin. YouTube titles and availability are verified;
full gameplay, route, faction/version and timestamps are not implied.

Copied 942 additional images (1,884 original/preview objects), all byte-verified
from the public R2 domain. D1 confirms 1,361 attribution records; total catalog
original/preview size is 265,333,760 bytes. No article image hotlinks remain.
All 535 original editable parts across 35 earlier guides are unchanged; the
missing selectable-reward table was appended to Bane Brought Down. Library
pagination shows 48 results while search covers the full dataset.

Independent review findings corrected before publication:
- Opposing-faction video titles are rejected in search and YouTube metadata;
  accepted matches follow stable search-result order.
- Research accepts environment-only credentials and reuses complete caches
  without credentials or a local .env file.
- Source form labels (Intro Message, Outro Message, Description) are removed
  before substantive-content counting.
- Journal instructions count as location evidence only for explicit menu claims.
  Master of Disguise instead cites its linked Space/Off mission, which places
  Jimmy Olsen in Death Metal Washington, D.C.; no exact spawn point is claimed.
- Equipment brands and episode names cannot become destinations. Geographic
  wording is required; named open-world variants and geographic subregions retain
  their source context. Scavenger Hunt uses Stryker's Island, and Enchanted Coral
  uses its menu reward objective rather than the Atlantis episode title.

Manual desktop/mobile inspection confirmed inline owned maps, the three-image
popout, next/close behavior, restored article position and no mobile overflow.
Validation and production evidence are recorded below after the final regeneration.

Final local gates: 67 unit tests, 13 browser tests, eight Cloudflare account/editing
integration tests, content/type checks and the production build passed. Build:
1,063 files / 17,981,991 bytes against 18,000 internal / 20,000 platform file limits.
Map captions now retain meaningful source labels rather than reused filenames.

The final location-name review also found prefix truncation. Location names are
now matched longest first, preserving Downtown Metropolis Battlezone and specific
Police Station/Nightclub destinations. All guides were regenerated with stable
counts; regression cases cover these distinct zones and safehouses.

Menu classification now checks every objective and gives explicit physical base
instructions precedence over inventory steps. Lock and Load correctly points to
the player's base. Automatic Journal gifts and explicit inventory claims retain
menu context; beta preorder instructions are explicitly labeled historical.

The expanded corpus exposed an account-page bundle regression. Account lookup now
uses an escaped inline title/slug index, leaving all article bodies out of client
account JavaScript. The account script is 5,630 bytes (7,841 bytes including the
shared layout script), with 74,515 bytes of account HTML. An eighth Cloudflare test
checks the return-to-editor link, index schema/coverage and script size budget.
All final local gates passed after this change.

Released to main in 0b490b2 (guide batch f6fb723; reviewed fixes 1e06f4b,
e5e3140, c93b6c1, 6f56e93 and 13eba08). The final full Codex review reported no
actionable regressions. GitHub validation run 39699533212 and Cloudflare Workers
Build 59821cf9-c3c1-41a6-9e41-e153c2533d75 both succeeded for that exact commit.
Deployment dry run: 7,690.49 KiB raw / 924.26 KiB compressed.

Production checks (2026-10-22 00:26 UTC): eight representative routes returned
200, all 1,047 article URLs appeared in the sitemap, and a held source returned a
real 404. All 66 previously captured public editable parts in Powers, Grab and
Smash and Viva la Lucha Libre retained their text and revision values, including
the existing Powers revision. Local comparison separately preserved all 535
original editable parts across 35 guides.

Live browsing confirmed 48 cards per page, 22 library pages, next-page navigation,
full-text search and opening Sea Change from its matching results. Its three R2
maps appear once; the overlay advanced from image 2 to 3 and closed back to the
article. [Sea Change](https://dcuo-wiki.com/wiki/Sea_Change/#location) is a live
example. No paid hosting tier was activated. The 86 held sources and the broader
wiki migration remain explicit outstanding coverage, not published placeholders.

## Guides hub and release navigation (authorized October 21, 2026)

- [x] Build sourced Episode/DLC, story-arc/chapter and event release catalog.
- [x] Assign every published mission using source badges, explicit introductions and verified content/mission relationships; record unresolved cases without guessing.
- [x] Add a dedicated Guides hub, release/chapter filters, release landing pages and article release navigation.
- [x] Preserve all existing editable content and keep account/browser bundles lightweight.
- [x] Pass local gates, independent review, main deployment and live navigation checks.

Validation before deployment: all 1,047 guides (1,006 quests) have audited assignments across 75 catalog groups. The catalog includes 48 Episodes, six chapters, two parent arcs, seasonal/special events and core/system content. There are 59 populated release landing pages; 16 unpopulated catalog entries link to source details without empty pages. Source capture hashes verified for 85 release/context pages. All article JSON remains unchanged, preserving editable part hashes. Astro check: 0 errors; 69 unit tests, 15 browser tests and 9 Cloudflare integration tests passed. Deployment dry run passed at 1,124 generated files and 946.83 KiB compressed Worker. Independent Codex review completed with no actionable findings; it independently repeated type, unit, build and browser checks. Production commit `81ea7fb` passed GitHub validation and Cloudflare Workers Builds. Live browser checks confirmed the Guides hub, all 75 catalog rows, the seven-guide Fight for the Light landing page and the six-guide Raging Night chapter filter. Public HTTP checks confirmed the hub, catalog, Episode/chapter/arc landing pages and article release links; uncovered release pages correctly return 404. All 66 sampled live article parts, including the Powers revision, were unchanged across deployment. Screenshot: `.import-cache/proofs/release-guides-live.jpg`; production evidence: `.import-cache/releases/production-verification.json`.

## Release gaps and reward currencies (authorized October 21, 2026)

- [x] Identify missing Episode coverage beyond Category:Missions.
- [x] Import 29 specific instance guides, Patrol Catastrophe, and two Children of Krypton chapter guides; retain source catalog provenance and title-verified video references.
- [x] Restore source icon-only reward currency labels and render names/icons without changing any existing editable parts.
- [x] Upload and verify new R2 artwork/currency icons and mirror image provenance to D1.
- [x] Pass validation, independent review, main deployment and live checks.

Local acceptance: 1,079 articles across all 75 populated release groups, including
all 48 Episodes and six chapters. The 32 additions include 29 title-verified
YouTube references. All 11,814 existing editable parts across 1,047 articles are
unchanged. Reward rendering covers 84 named currencies with 81 sourced icons;
28 icon-only reward items in 25 guides recover their missing currency labels.
Source context is applied only to unchanged baseline text. Corrected amounts are
preserved and escaped before display. D1 contains all 1,715 image records,
including the 354 new records. All 708 new public R2 objects matched their local
SHA-256 hashes after upload and cache refresh. Local gates passed: Astro check (0 errors), 74
unit tests, 16 browser tests, 10 Cloudflare integration tests and deployment dry
run (1,172 asset files, 1,094.60 KiB compressed Worker).

Independent Codex review found two source-conversion defects: conflicting
currency icons appended an extra label, and short image captions became guide
summaries. Both are fixed with regression coverage. The final review found no
actionable regressions and independently passed nine focused tests.

Production commit `610cf26` passed GitHub validation run `39709239020` and
Cloudflare build `3d7f0526-7a9a-43ae-8ba0-3b31c0b079c5`. All 75 release landing
pages returned 200 with the expected guide counts; all 66 sampled public live
parts retained their text, base hashes and revision IDs. Browser acceptance
confirmed Episode 13's six guides, the R2 map overlay's next/close behavior in
Return to the Nexus, and loaded Cash/Source Mark icons on New Genesis Protector.
The corrected Wayne Manor Gala summary and conflicting-currency case also
passed production checks. Evidence: `.import-cache/release-guides/production-verification.json`,
`.import-cache/release-guides/media-verification.json`, and
`.import-cache/proofs/reward-currencies-live.jpg`.

## Full-article visual editing (authorized October 21, 2026)

- [x] Replace the section selector with a full-page visual editor, HTML source, preview, formatting, tables, wiki images/maps and YouTube insertion.
- [x] Preserve effective legacy edits and attribution when creating the initial complete document; retain old drafts and public revision history.
- [x] Publish title, summary and body in one Census-checked, conditional revision; handle whole-article conflicts without losing the draft.
- [x] Render complete revisions in live HTML, contents, metadata, guide cards and search, and restore earlier full documents as drafts.
- [x] Complete release validation, independent review, deployment and live acceptance.

The document format uses the existing revision table, so no additional D1
migration or editor service is required. Imported article JSON is unchanged.
All 1,079 articles convert successfully; the largest document exceeds 400 KB
and passes the complete visual/source/preview flow. Drafts are local to the
browser tab. Canonical documents allow 250,000 text characters and 512 KiB of
JSON while bounding nested structure, links, tables and media. Source HTML is
parsed into the supported editor schema; the server independently validates
that schema and renders safe HTML. Existing R2 provenance remains attached.

Local acceptance: all 1,079 articles convert; 85 unit tests, 16 site browser
tests and 14 Cloudflare integration tests pass. The largest article completes
the visual/source/preview flow, and published fixture headings, tables, media,
history restore and deliberately reviewed conflict publishing are covered.
Desktop visual inspection and a 390 by 844 viewport check confirm the complete
editor fits its viewport. The initial independent review identified long legacy
summaries, fully spanned empty table rows, and generated section anchors; all
three now have regression coverage. Legacy summaries up to 7,000 characters
are retained, while full article bodies use the larger document limit.

The completed follow-up navigation review found no actionable regressions.
Reward currency decoration is limited to reward sections, explicit reward
paragraphs and currency/reward tables, preserving the earlier currency work
without adding currency icons to ordinary narrative words. The editor build
contains 1,174 assets, well below the 20,000 platform limit.

Final focused review found no actionable regressions and independently passed
all seven rich-document tests. Whole-document guide-card titles, summaries and
body search are covered by the Cloudflare fixture tests. Final local gates:
85 unit, 16 site browser, 14 Cloudflare integration tests; deploy dry run at
9,074.95 KiB raw / 1,100.62 KiB compressed.

Implementation commits `edea7b3` and `326c050` are deployed. GitHub validation
run `39714557352` and Cloudflare build `2d338eba-e869-4da8-90ae-af40af22f70c`
passed for the deployed head. Production checks preserved all 66 sampled live
parts and revision IDs, confirmed active Discord/Census configuration, rejected
an unauthenticated full-article publish with 401, and successfully previewed
both Return to the Nexus and the 437,792-byte Collections document. Native
browser inspection confirmed the complete visual editor, full HTML source with
maps/gallery/videos, and rendered preview. No production test edit was created.
Evidence: `.import-cache/editor/production-acceptance.json` and
`.import-cache/proofs/full-article-editor-live.jpg`.

## Complete feat catalog (authorized October 21, 2026)

- [x] Rename Progression navigation to Feats and provide a dedicated searchable catalog.
- [x] Download linked feat source pages with Firecrawl, record coverage, and omit empty pages.
- [x] Preserve every substantive feat requirement, reward points and source notes; add completion guidance and links to matching mission guides.
- [x] Show a separate five-step estimated difficulty meter with an explanation; never derive it from feat stars/points.
- [x] Validate import coverage, content/editor compatibility and browser/mobile filters.
- [x] Complete independent review, deployment and live acceptance.

Keep grouped feat articles editable through the existing whole-article editor.
Use stable anchors for individual feats and keep imported source attribution.
Do not invent missing requirements or claim source completion strategies where
only a requirement is documented. Publish only after local gates and review;
verify Cloudflare and GitHub checks at the deployed main commit.

Additional acceptance requested during import: organize feat farming into useful
sessions, cross-reference matching mission guides, and check YouTube coverage.
Show prerequisites, exact success/failure conditions, repeat/currency/event
constraints and point rewards before the attempt. Keep long counters and costly
or random collections out of the quick-objective queue. Rank by documented
requirements and clearly label estimated effort; do not invent points per minute,
compatibility between contradictory objectives or video timestamps.

Local acceptance: 5,801 feat entries in 94 groups, 436 new articles including
160 individual walkthroughs, and 310 prose item-list supplements. The complete
Firecrawl manifest covers 424 URLs: 342 successful captures and 82 confirmed
HTTP 404 pages omitted. Eleven rows without substantive source requirements
are rejected. Existing 1,079 articles retain their content; Feats changes only
its category and appends an explanation without moving existing sections.

The resource audit links 367 entries to mission/instance guides, three to
feat-named video titles and 305 to explicitly labeled instance overviews. One
preparation video's automatic transcript supports five checked chapter links.
These are documented planning methods, not measured points-per-minute claims.
The session checklist excludes exact duplicates and historical entries from
its total and keeps repeat counters and preparation out of the quick queue.

Validation: 101 unit, 19 browser and 14 Cloudflare integration tests pass.
The deploy dry run succeeds at 1,614 static files and 1,664.92 KiB compressed
Worker size. All 686 new R2 objects pass public SHA-256 checks, and D1 mirrors
all 2,058 media records. Binary media and raw captures remain outside Git.

Independent review found and verified fixes for same-name guide mismatches,
missing summary instructions, serialized capture progress, source extra-column
constraints, separated reward numbers, category-link checklist mismatches,
empty image parts and quick-queue counters. The completed follow-up review
found no remaining material regressions. A final Name-order correction sorts
before pagination and has browser assertions for switching order modes; its
separate review found no actionable defects. All local gates pass again.

Implementation `33bba3c` is live. GitHub run `39720687349` and Cloudflare build
`6591e283-d071-435e-bef8-000290c01d9f` passed. Production acceptance preserved
88 pre-existing live parts/revision hashes, confirmed all 5,801 catalog entries,
previewed three complete documents with difficulty meters, rejected anonymous
publishing, and confirmed active Discord/Census settings. Native browser checks
confirmed R2 map viewing and a 100-point session persisted after reload; the
acceptance checklist was cleared afterward. Evidence:
`.import-cache/feats/production-acceptance.json`,
`.import-cache/feats/media-verification.json`, and
`.import-cache/proofs/feats-live.png`. The small sorting follow-up receives a
fresh deployment/check run; content and database state are unchanged by it.

## Story navigation (authorized October 22, 2026)

- [x] Add a compact Story navigation tab with original campaign, mentor paths, classic arcs, numbered Episodes and released chapters.
- [x] Reuse source captures, fill missing story sources with Firecrawl, and record provenance. Include substantive narrative and mission links; omit future unnamed chapters and empty entries.
- [x] Provide readable story pages and release-order navigation without implying that parallel classic arcs have one mandatory order.
- [x] Validate complete coverage, guide links, search/filter behavior, mobile layout, existing article preservation and independent review.
- [ ] Push to main and verify the live Story tab, article editor and existing edits.

Scope: story summaries and source-documented mission/instance sequences, not a
transcript of every conversation or an invented universal mission order.
Preserve existing editable articles and source attributions. Reuse R2 artwork
where already credited; do not hotlink new third-party art. Verify all 48
Episodes, the six currently named chapters, and all source-listed classic arcs
and mentor paths. Future named releases require source verification.

Local acceptance: 75 source captures produce 73 story entries: the original
invasion, six mentor paths, 11 classic arcs, 48 Episodes, The Death of Superman,
and six named chapters. Seventy-one new editable articles are added; the two
existing Children of Krypton chapter guides are reused. All 1,515 prior article
records remain unchanged. Generation reproduces all four output files
identically on an in-memory rerun. Existing R2 images are reused; no new media
objects, account changes or database migrations are needed.

The Story index supports era/full-text filters and shared URLs, works without
JavaScript, and reflects published corrections through the existing live index
renderer. The first review identified lost empty mentor-level parents and
omitted Chapter Missions; heading context now preserves all level boundaries,
and all chapter mission sections are retained. Regression tests cover both.
Final full-feature and sitemap reviews found no actionable defects.

Local gates pass: 105 unit tests, 22 browser tests, 15 Cloudflare integration
tests, Astro checks, and deployment dry run. Output has 1,686 files against the
20,000 platform limit; Worker gzip size is 1,757.71 KiB. Local browser inspection
confirmed Story navigation, original-game layout, mentor level 5/15/30 labels
and the numbered Murder in Kaznia / Dead Reckoning chapter chains. Release
checks compare 152 pre-existing live parts across six sampled articles.
