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
