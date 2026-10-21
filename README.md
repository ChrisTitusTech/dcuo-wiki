# DCUO Wiki

An exploratory Astro wiki for https://dcuo-wiki.com. Eight curated starter guides, not a full Fandom mirror. Quest pilot: Grab and Smash, with five source map references and an explicitly documented unsuccessful YouTube match search.

## Develop and validate

Node.js 24 is required.

```sh
npm ci
npm run dev
npm run validate
npx playwright install chromium
npm run test:browser
```

`npm run build` validates published content, builds Astro, and counts every output file. It fails above 18,000 files (2,000 below Cloudflare's free 20,000-file ceiling), or if any asset exceeds 25 MiB. Search currently filters published guides and their location tables locally; a sharded full-text index is future work.

## Import and review

```sh
export FIRECRAWL_API_KEY='your-key'
npm run import -- https://dcuniverseonline.fandom.com/wiki/Powers
```

The importer uses Firecrawl v2, retries failures, and resumes from `.import-cache/`. It stages data only, never publishes automatically. Use `npm run import -- --refresh <URL>` to deliberately refresh an entry. Corrupt or incomplete cached entries are fetched again; writes replace cache files atomically. Authentication failures are not retried. Markdown, HTML, and links are retained for review of tables and infoboxes. Keep keys out of source control. Local `.env` files are not automatically loaded by this command.

Review staged content against its source before adding a record to `src/data/articles.json`. Keep source and history attribution, retrieval date, substantive sections, and review status. Do not infer facts. Quest records require sourced location information or a researched limitation, plus a dated YouTube search. Videos require explicit quest-match evidence. Semantic quality still requires human/editorial judgment; automated rules are guardrails, not proof.

## Discovery and inventory

`data/discovery.json` holds Firecrawl link observations, page provenance, and exact continuation URLs. `data/inventory.json` is the derived inventory. It currently covers 2,159 article candidates from six sequential All Pages batches and linked sources, with eight published guides. It is explicitly partial: the next index starts at Base Items: Cinema. Redirects and semantically duplicate titles still require resolution.

```sh
npm run inventory
npm run inventory:check
# Uses FIRECRAWL_API_KEY and resumes from the saved continuation:
npm run discover -- 5
```

Discovery commits a checkpoint after each successful page. It follows the source's Next page link rather than guessing alphabet ranges. URL normalization preserves case, parentheses, Unicode, and meaningful title prefixes such as Collections:. File and Category pages are retained as supporting sources; user and discussion namespaces are excluded. Inventory checks fail when published content or discovery changes without regenerating the inventory.

`data/exploration.json` remains the historical pilot record. Its Markdown-derived candidate links may be malformed and are not consumed by the new inventory. Only Firecrawl's structured link observations seed the new workflow. No complete-site or future hosting-fit claim is made.

## Cloudflare Git integration

For a Cloudflare Pages project, connect ChrisTitusTech/dcuo-wiki, select main, set build command `npm run build`, and output directory `dist`. Use Node 24. Add dcuo-wiki.com through the project's custom domains flow and verify its DNS and HTTPS status. Owning the domain does not automatically connect the project.

Alternatively, the included `wrangler.jsonc` supports static Workers hosting. With Workers Builds, use `npm run build` as build command and `npx wrangler deploy` as deploy command. Review account quotas before changing hosting architecture.

Do not replace the build command with plain `astro build`: that would skip publication and file-budget checks. No Cloudflare credentials or account configuration are included. Repository publication does not confirm a live deployment.

## Rollback and refresh

Revert the offending commit on main and let Cloudflare rebuild, or restore a previous successful deployment in Cloudflare. Content updates are reviewed commits; no scheduled crawling is enabled. Full inventory, automated enrichment, media mirroring, and large-scale hosting selection remain future milestones.

## Attribution

Article text is condensed and adapted from DC Universe Online Wiki contributors on Fandom. Each article links its source and contributor history. Adaptations retain the applicable source CC-BY-SA license; see https://www.fandom.com/licensing and per-source exceptions. This is not a blanket license for game imagery, trademarks, or repository code. Map screenshots are linked to their file pages, not redistributed. This fan site is unaffiliated with DC, Daybreak, or Fandom.
