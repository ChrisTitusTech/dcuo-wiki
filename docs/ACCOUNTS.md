# Player accounts and activation

## Implemented behavior

- Discord OAuth authorization code flow requests only `identify`. No email, guild, bot, or Daybreak account password is requested.
- Single-use, ten-minute login state is tied to the browser. Sessions use random, hashed tokens in D1 and Secure, HttpOnly, SameSite=Lax cookies with a seven-day lifetime.
- Exact character-name lookup uses Daybreak Census. Players choose a matching character/world, and the server fetches that character again before saving. Public profiles show only a selected set of Census fields, a description, and an optional screenshot.
- Per the owner's explicit decision, a Census name match is sufficient. This is **not character ownership verification**; the public record does not prove ownership. A stable character ID can be linked to only one account at a time, as described under Unique character claims below.
- Every contribution requires a live Census recheck. Missing records, deleted records, errors, timeouts, absent configuration, and forged client flags do not unlock contributions.
- Suggestions for new or existing pages enter a private pending queue. Moderators review sources, make accepted edits in Git, run content checks, and deploy. Marking a submission reviewed does not publish it.
- Moderator access is an exact Discord ID allowlist set in the Worker environment; no user can self-assign that role. Both ordinary accounts and moderators must meet the Census gate to submit suggestions.
- Screenshots are limited to 256 KiB per profile in D1, avoiding an additional object-storage subscription for the initial release. The browser resizes and re-encodes images; the server independently bounds bytes and checks PNG/JPEG signatures. Image responses use fixed image types, nosniff, and a sandbox CSP. Large deployments should move media to object storage after measuring usage.
- Requests changing data require the configured Origin. Database queries bind parameters. User text is rendered as text, not HTML. OAuth responses and account errors do not expose secrets. Rate limits bound account login starts, Census lookups, uploads, profile saves, and submissions.

## Required activation

Production secrets are configured in Cloudflare. The database dcuo-wiki-accounts (1b3140dd-8d8e-49cc-ab3b-cfd0104efaa9) has been created and initialized through the dashboard; its DB binding is persisted in wrangler.jsonc. Migration 0001_accounts.sql is recorded in d1_migrations. The steps below also serve as recreation instructions. Never put secrets in Git or chat.

1. Create an application in the [Discord developer portal](https://discord.com/developers/applications). Add this exact OAuth2 redirect:

   ```text
   https://dcuo-wiki.com/api/auth/callback
   ```

   No bot is needed. Set `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET` as encrypted Worker secrets. The application owner must complete any credential generation or terms acceptance.

2. Register an application service ID with [Daybreak Census](https://census.daybreakgames.com/#devSignup). Set `CENSUS_SERVICE_ID` to the approved alphanumeric value, without the `s:` prefix. The public `example` ID is deliberately rejected by production code. The owner must submit their own contact details and accept any terms.

3. With authenticated Wrangler, create D1 and bind its real returned ID as `DB` in `wrangler.jsonc`:

   ```bash
   npx wrangler d1 create dcuo-wiki-accounts
   ```

   Add the returned binding with `database_name: "dcuo-wiki-accounts"`, `binding: "DB"`, and `migrations_dir: "migrations"`. Do not copy the disposable test database ID.

   ```bash
   npx wrangler d1 migrations apply DB --remote
   npx wrangler secret put DISCORD_CLIENT_ID
   npx wrangler secret put DISCORD_CLIENT_SECRET
   npx wrangler secret put CENSUS_SERVICE_ID
   npx wrangler secret put DISCORD_MODERATOR_IDS
   ```

   `DISCORD_MODERATOR_IDS` is a comma-separated list of approved moderators' numeric Discord user IDs. Leave it absent to deny all moderator access. Do not grant access to an unapproved ID.

4. Preserve `SITE_ORIGIN=https://dcuo-wiki.com`. Commit the non-secret database binding, validate, and deploy through main. Cloudflare's GitHub app must include `ChrisTitusTech/dcuo-wiki` in its selected repositories. The owner elected to save that installation change themselves.

5. Perform a real Discord sign-in and sign-out at `/account/`. Match a real character, save the profile, upload/remove a screenshot, and submit a useful suggestion. Confirm it is visible only to its author and configured moderators and that it does not alter a wiki article. Check declined OAuth, stale session, unknown character, and Census outage behavior.

## Validation and limits

`npm run validate` covers account boundary tests using real SQLite statements and mocked Discord/Census responses. `npm run test:cloudflare` creates a disposable local D1 database, validates real Worker/D1 session and image operations, checks the account UI, and retains static routing checks. No test uses production credentials or remote database writes.

The static file limit is separate from Worker request, database, and storage quotas. These features add dynamic requests and D1 storage; no paid plan is activated by this code. Screenshots do not add build assets. Expired session/state/rate rows are cleaned during successful sign-in; operational retention and account deletion tooling remain future work. Submissions are retained for editorial traceability. Production OAuth, service-ID approval, and live D1 integration require the activation steps above; mocked tests do not prove those account settings.

Rollback: deploy the previous static release to remove account endpoints. Keep the D1 database intact so profiles and pending suggestions are recoverable. Never drop production tables as part of an application rollback.

## Official references checked

- [Discord OAuth2](https://docs.discord.com/developers/topics/oauth2): authorization code flow, identify scope, token endpoint, state and revocation.
- [Daybreak Census](https://census.daybreakgames.com/): public queries, service-ID registration, and game collections. The live public character endpoint returned character data; `auth_character` returned `login_required`, and no supported third-party ownership flow was established. Name matching follows the owner's chosen policy.
- [Cloudflare Worker/static asset routing](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/): selective `/api/*` Worker-first routing.
- [D1 prepared statements](https://developers.cloudflare.com/d1/worker-api/prepared-statements/): parameter binding and result methods.

## Direct article editing

Any Discord-signed-in player with a Census-matched profile can publish a complete article revision. **Edit this page** opens a full-page visual editor. Section edit links open that same document at the selected heading. Players can edit the title, summary, body, headings, formatted paragraphs, lists, links, tables, images/maps from the R2 media library, and YouTube walkthroughs. HTML source mode and a server-rendered preview support larger edits. The formatting engine is self-hosted Tiptap 3; no editor cloud account or paid service is required.

Use the publish details panel to enter an edit explanation and supporting sources, then **Publish changes**. The server rechecks Census on every write and atomically records the complete document. This remains a public-name match, not proof of character ownership. New guide proposals still use the review queue. Image insertion uses the existing reviewed R2 catalog and retains its credits; it does not hotlink arbitrary external images.

The existing `0002_article_revisions.sql` table stores full revisions with `part='document'`; no additional database migration is required for the editor. The first full-article draft includes effective existing section corrections, maps, references, tables, restored reward labels, and videos. Until a player publishes a full document, the existing section overlays continue to render as before. Once a full document is published it takes precedence over imported body content, and stale section-only writes are rejected instead of becoming invisible changes. Imported `articles.json` and existing revision rows are not rewritten.

A complete document can contain up to 250,000 text characters and 512 KiB of canonical JSON, with bounded nesting and tables. Requests allow additional space for editor-only attributes, which the server discards during validation. The old 7,000-character section limit does not apply to full documents. The server validates an explicit node/mark schema, restricts link schemes and media sources, and generates safe HTML independently of the client. Raw HTML and scripts are never accepted as executable content. Title, summary, body, table of contents, guide cards and search reflect published changes for readers without JavaScript.

The revision token covers the entire effective article. Concurrent changes to any section or the full document invalidate an older draft. A conditional D1 insert checks both the article revision and the character profile after Census verification, preventing writes that raced with another edit or profile change. On conflict, the draft is preserved, the latest article is shown for comparison, and the editor must explicitly review/merge it before updating the revision token. Publishing rechecks that token again.

Drafts persist in sessionStorage in the current browser tab and survive reloads and the sign-in round trip. Earlier section-editor drafts remain available as a text backup. Page history lists the latest 50 edits and loads full before/after content only when expanded. Full-document snapshots have rendered comparisons and can be loaded into the editor as a draft, then published as a new revision. Legacy section history remains readable. No credentials or Discord IDs appear in public history.

Ordinary code deployments preserve all live edits. Future imports must reconcile published full documents rather than replacing them with source baselines. For unconverted pages, section overlays still depend on the original section text hash; reconcile those overlays before deliberately changing an edited source section. Back up D1 before content migrations. Rolling application code back to a version without full-document support hides those revisions from that older application; it does not delete them. Keep the database intact and redeploy compatible code to restore their display. Large-scale article expansion will need a more efficient search index than per-edited-article queries.

Official implementation references: [Tiptap vanilla JavaScript](https://tiptap.dev/docs/editor/getting-started/install/vanilla-javascript), [TableKit](https://tiptap.dev/docs/editor/extensions/functionality/table-kit), and [D1 limits](https://developers.cloudflare.com/d1/platform/limits/).

## Unique character claims

A Census character can be linked to one Discord account at a time. Migration `0003_unique_character_claim.sql` enforces uniqueness by stable Census character ID, not display-name spelling. Different characters with matching names on different worlds remain separate. The save operation checks and writes atomically; a conflicting claim returns 409 without altering either existing profile. The current linked account can update its bio or refresh Census details. Switching successfully to another unclaimed character releases the old current link.

Audit for duplicates before applying the migration: `SELECT character_id, COUNT(*) FROM profiles GROUP BY character_id HAVING COUNT(*) > 1;`. If any exist, stop for resolution; the migration does not delete or reassign profiles. Keep the unique index when rolling back application code so the claim restriction remains enforced.
