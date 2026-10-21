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
