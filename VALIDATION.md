# Foundation validation

Validated on October 20, 2026, with Node.js 24.

- `npm run validate`: passed Astro type checks (zero diagnostics), five policy/budget tests, article validation, and production build.
- `npm run test:browser`: passed search, category filtering, empty results, quest navigation, five source map links, and 390px mobile overflow checks.
- Desktop homepage and mobile quest screenshots inspected. Mobile navigation spacing corrected and checked again.
- Output: 11 deployment files, 31,154 bytes. Build rejects more than 18,000 files or an asset larger than 25 MiB.
- Independent `codex review --uncommitted`: final review found no actionable defects. Initial findings about rendering location limitations and verified videos were fixed before the final review.
- An optional CodeRabbit attempt inside the review could not run before the repository's initial commit. Independent Codex review completed successfully.

## Limits of this evidence

The Firecrawl connector successfully retrieved the four source pages. The standalone API-key importer is implemented against the documented v2 API; it has not been exercised against a live API key on this host. No full crawl, exact inventory, image redistribution, or current in-game verification was performed. Source map pages are linked, not hosted. No matching YouTube walkthrough was verified for the pilot quest.

Cloudflare account configuration, DNS, live HTTPS, and deployment are not verified by these local checks. GitHub CI evidence is available on the pushed commit. This foundation does not prove that a future complete wiki will fit the free hosting limit.

## Discovery and enrichment increment

Validated on October 20, 2026:

- `npm run validate`: zero Astro diagnostics; 14 tests passed; publication policy and inventory consistency passed; production build passed.
- `npm run test:browser`: two browser tests passed, including exact video chapter URLs, six investigation table rows, related navigation, table-content search, and mobile overflow.
- Mobile investigation screenshot inspected. Fixed table overflow by allowing the article grid child to shrink; the table scrolls within the page.
- Current output: 15 files, 57,260 bytes; the 18,000-file guard remains active.
- Firecrawl retrieved six consecutive All Pages batches, the local sitemap sample, four additional gameplay pages, and a YouTube video title/description. The saved continuation begins at Base Items: Cinema.
- Inventory: 2,159 article candidates, 12 supporting pages, eight published guides, and 23 excluded links. These are partial discovery counts, not a complete set of useful articles.
- Standalone importer behavior was tested with mocked HTTP responses and a temporary cache: retries, authentication errors, resume, canonical URL deduplication, corrupt cache repair, explicit refresh, and enforced needs-review status. No live standalone API key was used.

The Out in the Streets and House of Venom video chapters are verified from the publisher's title and description, not from watching the footage. Source images remain linked rather than redistributed. Exact coordinates, current in-game correctness, full enumeration, bulk extraction fidelity, and Cloudflare activation remain unverified.

Final independent Codex review found no actionable defects after fixing underscore-normalized discussion namespace exclusions and adding regression coverage. Optional CodeRabbit feedback about missing files was checked against the staged new files and passing builds; those files are included in this increment. The House of Venom research note now explicitly records that its video was discovered through the Out in the Streets query.

## Completed main-namespace enumeration

Followed the source's All Pages next-page links through 84 batches to the final Zod Emblem batch. Its 14 returned links include 13 article links and a previous-page link; there is no next-page link. The inventory regenerates deterministically with `exhaustive: true` and `nextPage: null`. This flag applies to the enumerated main namespace, not all supporting namespaces or content quality.

Reconciliation yielded 28,636 unique article candidates, 12 supporting pages, eight published guides, 503 duplicate URL observations, and 113 excluded links. The initial sitemap-only mapping returned zero URLs; pagination supplied the enumeration. Firecrawl rate limiting was handled by slowing requests and resuming from saved checkpoints.

`npm run validate` and both browser tests passed against the completed inventory. Astro checks and the build passed again after updating coverage copy. Current output remains 15 files (57,373 bytes). The candidate manifest is build-time input and is not copied into the deployed site. The useful-page total and the full-site hosting architecture remain undetermined.

Independent review verified that all 84 pagination batches form a continuous chain ending at the terminal page, the generated inventory matches the discovery data, and coverage copy accurately distinguishes enumeration from reviewed content. No actionable findings were reported.

## Static hosting decision and representative content batch

Validated October 20, 2026, on Node 24:

- `npm run validate`: zero Astro diagnostics, all 14 tests passed, inventory consistency and 11 article publication checks passed.
- `npm run test:browser`: all three tests passed. Added mastery-table search, 11-row rendering, and 390px viewport overflow coverage. Quest policy tests now select a quest by slug instead of assuming the last article is a quest.
- Inspected the mobile mastery screenshot: the six-column table scrolls within the page; headings, attribution, and related links remain readable.
- Static output: 18 files, 78,311 bytes. Existing 18,000-file guard unchanged.
- Firecrawl retrieved Feats, Equipment, Weapon Mastery, and The Strategist Card. Published the first three after source review; withheld the artifact because the article-body scrape lacked its stat infobox. The initial guessed Strategist_Card URL returned 404, and the inventory supplied the correct title. No artifact stats or guessed page were published.
- Mastery preserves all 11 source table rows. Feat tiers use the explicit four-star table rather than conflicting older prose that claims a 50-point maximum. Omitted dated equipment access prices.
- Recorded the selected static Workers hosting path: free until needed, paid only after actual output measurement and account upgrade. No Cloudflare subscription, DNS, or deployment changes performed.

Sources remain subject to in-game verification. Full content import, redirect triage, infobox extraction, and live Cloudflare deployment remain incomplete.

Independent `codex review --uncommitted` completed with no actionable defects; it also compared the new guides to cached source material and reran the validation and browser checks successfully.

## Activation preparation

Validated October 20, 2026:

- `npm run validate`: zero Astro diagnostics; 17 tests passed; inventory consistency and all 12 publication checks passed; static build passed.
- `npm run test:browser`: all three browser checks passed.
- `npm run deploy:check`: build and pinned Wrangler 4.151.3 deployment dry run passed without uploading.
- `npm run test:cloudflare`: local Wrangler serving check passed for articles, both Artifact alias spellings, real 404 responses, canonical sitemap entries, and inaccessible inventory/cache paths.
- Output: 20 files, 84,445 bytes. The free-tier safety guard remains unchanged.
- `npm run import -- --inventory 3 --dry-run` selected three uncached candidates without credentials or network requests. Mocked integration coverage proves bounded attempts and cache resume across consecutive batches. Standalone live Firecrawl API-key execution remains unverified; source retrieval used the connected Firecrawl tools.
- `npx wrangler whoami` reported unauthenticated. Cloudflare API token and account ID environment variables are absent. Live deployment, DNS, HTTPS, and Git integration therefore require account activation; no temporary account or paid plan was created.
- Firecrawl source evidence: Artifact resolves to canonical Artifacts. The broader artifact selector still returned no item-stat infobox; The Strategist Card and Page of Destiny remain held. The related acquisition mission contradicts itself about the required instance and remains unpublished. Bounded crawls returned zero and one page respectively, not a complete section crawl.

The npm install completed with no reported vulnerabilities. Package install-script notices did not prevent the actual Wrangler dry run or local serving tests from passing. Full content import and current in-game verification remain unfinished.

Independent review found a source contradiction: its introduction says three artifact slots, while its update history records additional slots in Game Update 155. Removed the numeric count rather than publishing the outdated introduction.

Final independent Codex review found no actionable defects after the artifact-slot correction; all local checks passed again. The in-app Cloudflare dashboard also opens to its sign-in page, confirming that browser access does not currently provide an authenticated alternative.

## Live activation

On October 20, 2026, Cloudflare built main with Node 24.22.0, npm run build, and npx wrangler deploy. Initial build e554f334-7eb6-4d8c-bebd-87e949fdc003 succeeded; asset-upload retry recovered. Dependency install-script notices were non-blocking. Explicit routing settings now remove the observed default workers.dev/preview URL warnings.

Live HTTPS checks on dcuo-wiki.com returned 200 for the homepage, Artifacts guide, and sitemap; 301 from /wiki/Artifact/ to /wiki/Artifacts/; and 404 for an unknown guide and /data/inventory.json. Browser search for Shuriken Storm returned only Weapon Mastery. The homepage shows 12 guides. Live screenshot saved locally in test-results/live-wiki.png.

After adding the production domain configuration, pinned Wrangler's deployment dry run and the local Cloudflare serving test passed. The workstation CLI remains unauthenticated; builds use the Cloudflare-managed dedicated token. No secrets are stored in this repository.

Follow-up blocker: after pushing routing commit 4f7f0e4, Cloudflare's production build settings report "This project is disconnected from your Git account." No automatic build appeared. Manage opens GitHub installation settings behind a sign-in page. Initial deployment remains live, but automatic updates and deployment of the persisted routing settings are not yet verified. User GitHub sign-in/reconnection is required. The initial build enabled default workers.dev and preview URLs; the explicit disable settings are committed but have not yet deployed.

## Discord accounts and Census-matched profiles

Implemented Discord identity sign-in, D1-backed profiles and sessions, optional bounded screenshots, Census character-name matching, server-enforced submission gating, and a private editorial queue. Per explicit owner direction, matching a public name is sufficient; ownership is not claimed. Provider setup is intentionally absent from source control.

Validation on 2026-10-20:

- `npm run validate`: Astro check passed with zero errors/warnings; all 26 unit tests passed; content/inventory validation and build passed. Output: 23 files, 99,400 bytes, below the 18,000 guard and 20,000 platform limit.
- `npm run test:browser`: all 3 existing wiki browser tests passed.
- `npm run test:cloudflare`: all 4 tests passed. A disposable local D1 database exercised session queries, screenshot BLOB round-trip/removal, origin enforcement, missing Census configuration, and static article/redirect/404 routing. Browser checks exercised login visibility, public profile rendering, and a mocked character-save/contribution flow at mobile width.
- `npx wrangler deploy --dry-run`: passed with the API Worker and static asset bindings. No production credentials used.
- Security tests cover single-use browser-bound OAuth state, hashed sessions, logout/expiry, exact Census matching, public-data boundaries, outage handling, rate limits, upload size/type, anonymous/forged submissions, and moderator access.
- Mobile screenshot inspected at `test-results/player-profile-mobile.png`: no horizontal overflow, form labels and actions readable. The screenshot uses test data and is not evidence of live provider activation.

Production Discord sign-in, approved Census service ID, real D1 binding/migration, moderator allowlist, and live user acceptance remain pending. Activation procedure: docs/ACCOUNTS.md. The owner elected to save the prepared GitHub installation access change themselves. No paid plan activated; no full wiki import claimed.

Local Codex review completed. The first review found article context was lost through sign-in; state-bound page-title storage fixed it, with a regression test. Repeat review found no actionable defects. The owner saved GitHub repository access, and refreshed Cloudflare settings no longer show the disconnected warning. Live deployment of this increment still requires verification after push.

Live evidence: cb23314 passed GitHub Actions run 39532602770 and Cloudflare automatic build 4371cf08-2257-4159-a0de-afa0943a7f26. Cloudflare reported deploy success for dcuo-wiki.com and version 954a5593-f823-4abe-905a-47327e4068c2. HTTPS /api/status returns 200 with login=false and census=false; /account/ and /wiki/Artifacts/ return 200. This verifies deployment and the activation lock, not completed provider setup.

## Production D1 setup

Created database 1b3140dd-8d8e-49cc-ab3b-cfd0104efaa9 (dcuo-wiki-accounts) through the Cloudflare dashboard. The console reported successful execution of the existing migration; sqlite_schema confirmed users, oauth_states, sessions, profiles, contributions, rate_limits, and all five application indexes. Migration tracking was initialized with 0001_accounts.sql using the schema expected by pinned Wrangler. No existing database was modified and no paid upgrade was activated.

`npm run deploy:check` passed with env.DB bound to dcuo-wiki-accounts. All four `npm run test:cloudflare` checks passed against the disposable local database. Unchanged application validation evidence is reused. Live OAuth completion requires the account owner to sign into Discord.

## Compact DCUO visual redesign

Replaced the generic landing layout with official-source game artwork, condensed headings, blue/orange accents, persistent search, a compact category sidebar, and article contents beside the text on desktop. Added source provenance in DESIGN.md and the public attribution page. Published article content and account verification rules are unchanged.

Validation: `npm run validate` passed (26 unit tests, Astro check, inventory/content checks, build); `npm run test:browser` passed all 4 tests including cross-page search, category links, theme persistence, and mobile menu behavior; `npm run test:cloudflare` passed all 4 account/routing integration checks; `npm run deploy:check` passed. Desktop dark homepage, mobile light homepage, and mobile quest screenshots were visually inspected. Output contains 25 files, far below the 18,000-file guard and 20,000 platform limit. Full live Discord sign-in remains an owner acceptance step.

Local Codex review found that All guides did not clear same-page filters. Fixed both search and category reset and added regression coverage. The repeat review found no actionable defects. All 26 unit tests and all eight browser/integration checks passed after the fix; the mobile player form screenshot was also inspected.

## Direct article corrections

Owner confirmed Discord sign-in and authorized direct publishing by every Census-matched player. Implemented an article-section editor, D1 revision history, safe live rendering for readers without JavaScript, homepage summary/search updates, conflict detection, and restoring earlier text through a new edit. New-guide proposals retain their existing review queue.

`npm run validate` passed with 29 unit tests. `npm run test:browser` passed four tests. `npm run test:cloudflare` passed six tests, including actual D1 revision rendering, escaping, search propagation, history, editor authentication lock, and preserving a conflicted draft. Unit coverage checks matched publication, unverified/anonymous/cross-origin rejection, stale revisions, Census rechecks, unsafe URLs, restoration, and public history boundaries. `npm run deploy:check` passed. Live content was not changed with test data.

Production migration 0002 executed successfully through the Cloudflare D1 console and was recorded in d1_migrations. Local review found stale-draft reset and in-flight editing races; fixed by fetching fresh content on reset and locking controls during publication. Regression checks passed. Repeat Codex review found no actionable regressions. Final checks: 29 unit tests, four wiki browser tests, six Cloudflare integration tests, Astro/build/content checks, and deploy dry run all passed. Mobile editor screenshot visually inspected after applying shared form styling.

## Article body editor discoverability

User reported that Edit this page appeared to edit only the subtitle. The entry point now selects the first article-body section, exposes the complete section list instead of a collapsed dropdown, and provides direct Edit section/table/map/video links in the article. Drafts are retained when moving between sections. Regression coverage verifies the main entry opens body text, a section link selects its current content, and the summary remains separately editable. All 29 unit tests, four wiki browser tests, and six Cloudflare integration tests passed.
