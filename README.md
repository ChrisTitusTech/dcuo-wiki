# DCUO Wiki

An exploratory Astro wiki for https://dcuo-wiki.com. Twelve curated starter guides, not a full Fandom mirror. Quest pilot: Grab and Smash, with five source map references and an explicitly documented unsuccessful YouTube match search.

## Develop and validate

Node.js 24 is required.

```sh
npm ci
npm run dev
npm run validate
npx playwright install chromium
npm run test:browser
npm run deploy:check
npm run test:cloudflare
```

`npm run build` validates published content, builds Astro, and counts every output file. It fails above 18,000 files (2,000 below Cloudflare's free 20,000-file ceiling), or if any asset exceeds 25 MiB. Search currently filters published guides and their location tables locally; a sharded full-text index is future work.

## Import and review

```sh
export FIRECRAWL_API_KEY='your-key'
npm run import -- https://dcuniverseonline.fandom.com/wiki/Powers
```

For a bounded, resumable batch from the canonical inventory:

```sh
# Preview the next uncached candidates without an API key or network requests:
npm run import -- --inventory 25 --dry-run
# Stage at most 25 uncached candidates (requires FIRECRAWL_API_KEY):
npm run import -- --inventory 25
```

Batches accept 1-100 attempted fetches, skip published and cached records, and never auto-publish. Rerunning advances past successful cached pages; failed pages remain eligible for retry. Refresh requires explicit URLs. A real API key is needed only for uncached network work; connector access does not automatically configure the shell environment.

The importer uses Firecrawl v2, retries failures, and resumes from `.import-cache/`. It stages data only, never publishes automatically. Use `npm run import -- --refresh <URL>` to deliberately refresh an entry. Corrupt or incomplete cached entries are fetched again; writes replace cache files atomically. Authentication failures are not retried. Markdown, HTML, and links are retained for review of tables and infoboxes. Keep keys out of source control. Local `.env` files are not automatically loaded by this command.

Review staged content against its source before adding a record to `src/data/articles.json`. Keep source and history attribution, retrieval date, substantive sections, and review status. Do not infer facts. Quest records require sourced location information or a researched limitation, plus a dated YouTube search. Videos require explicit quest-match evidence. Semantic quality still requires human/editorial judgment; automated rules are guardrails, not proof.

## Discovery and inventory

`data/discovery.json` holds Firecrawl link observations, page provenance, and exact continuation URLs. `data/inventory.json` is the derived inventory. The completed traversal covers 84 sequential All Pages batches, ending at the final Z entries, and records 28,636 unique article candidates plus 12 supporting pages. Twelve guides are published. The inventory exhaustiveness flag means the source main-namespace pagination chain ended; it does not mean every candidate is substantive, current, or imported. Redirects and semantically duplicate titles still require resolution, and supporting namespaces have not been comprehensively enumerated.

```sh
npm run inventory
npm run inventory:check
# Uses FIRECRAWL_API_KEY and resumes from the saved continuation:
npm run discover -- 5
```

Discovery commits a checkpoint after each successful page. It follows the source's Next page link rather than guessing alphabet ranges. URL normalization preserves case, parentheses, Unicode, and meaningful title prefixes such as Collections:. File and Category pages are retained as supporting sources; user and discussion namespaces are excluded. Inventory checks fail when published content or discovery changes without regenerating the inventory.

`data/exploration.json` remains the historical pilot record. Its Markdown-derived candidate links may be malformed and are not consumed by the new inventory. Only Firecrawl's structured link observations seed the new workflow. No complete-content or future hosting-fit claim is made. One static file per candidate alone would exceed the free 20,000-file limit. The useful-page total remains unknown until quality review; do not drop useful material just to fit a hosting tier.

## Cloudflare Git integration

For a Cloudflare Pages project, connect ChrisTitusTech/dcuo-wiki, select main, set build command `npm run build`, and output directory `dist`. Use Node 24. Add dcuo-wiki.com through the project's custom domains flow and verify its DNS and HTTPS status. Owning the domain does not automatically connect the project.

The selected hosting path is static Astro on Cloudflare Workers, using the included `wrangler.jsonc`. With Workers Builds, connect this GitHub repository on main, use `npm run build` as build command and `npx wrangler deploy` as deploy command. Wrangler is pinned in the lockfile, so this uses the tested version. Keep Node 24. Add dcuo-wiki.com as a Worker custom domain and verify DNS and HTTPS. The Pages instructions above remain an alternative.

Stay on Workers Free while the output fits the existing 18,000-file safety budget. Workers Free allows 20,000 files; Workers Paid starts at $5/month and allows 100,000 files. Static asset serving is free and unlimited. Keep rendering and search static; no database or per-visit Worker execution is needed. Domain renewal and build usage beyond included allowances are separate. Before approaching the safety budget, measure the complete output, explicitly activate the paid account plan if needed, and then update the guard for the confirmed tier. Do not drop useful guides to fit the free tier. No paid subscription has been activated.

Pricing checked October 20, 2026: [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [file limits](https://developers.cloudflare.com/workers/platform/limits/), [static asset billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/).

### Activation handoff

The initial deployment is live at https://dcuo-wiki.com. Cloudflare Workers Builds is connected to this repository on main, with Node 24 and a dedicated build token. Preview builds are disabled. The custom domain is declared in wrangler.jsonc; workers.dev and preview URLs are explicitly disabled. No paid plan was activated.

For recreating this setup: In Cloudflare Workers & Pages, create a Worker from the GitHub repository `ChrisTitusTech/dcuo-wiki`, select `main`, and use the build/deploy commands above. Keep the free plan. After the first successful deployment, attach `dcuo-wiki.com` under the Worker's custom domains. Confirm there is no conflicting existing DNS record before replacing anything.

If deploying from this workstation instead, authenticate with `npx wrangler login`, then run `npm run deploy`. Do not paste API tokens into chat or commit them. The workstation CLI remains unauthenticated; production deployment uses Cloudflare Workers Builds. No temporary preview account was created.

`npm run deploy:check` builds and validates the deployment package without uploading. `npm run test:cloudflare` exercises the built assets using local Wrangler: article responses, alias redirects, a real missing-page 404, sitemap URLs, and absence of source/cache files. Run it after building. These checks do not prove live DNS or HTTPS. For subsequent changes, verify the same URLs over HTTPS on the real domain and check the GitHub-triggered Cloudflare build.

Do not replace the build command with plain `astro build`: that would skip publication and file-budget checks. No Cloudflare credentials or account configuration are included. Repository publication does not confirm a live deployment.

## Rollback and refresh

Revert the offending commit on main and let Cloudflare rebuild, or restore a previous successful deployment in Cloudflare. Content updates are reviewed commits; no scheduled crawling is enabled. Content classification, automated enrichment, media mirroring, and live hosting activation remain future milestones.

## Attribution

Article text is condensed and adapted from DC Universe Online Wiki contributors on Fandom. Each article links its source and contributor history. Adaptations retain the applicable source CC-BY-SA license; see https://www.fandom.com/licensing and per-source exceptions. This is not a blanket license for game imagery, trademarks, or repository code. Map screenshots are linked to their file pages, not redistributed. This fan site is unaffiliated with DC, Daybreak, or Fandom.
