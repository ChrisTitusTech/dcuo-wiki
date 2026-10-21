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
