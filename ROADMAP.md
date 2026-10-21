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
