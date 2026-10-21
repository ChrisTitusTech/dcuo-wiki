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

Implemented and locally validated. See VALIDATION.md for tests, independent review, output size, and explicit limitations. GitHub publication is the final step of this milestone; Cloudflare activation remains separate.
