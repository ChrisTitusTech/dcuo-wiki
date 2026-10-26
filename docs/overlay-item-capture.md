# Companion item capture

DCUO Companion (the DCUO-Overlay repository) can resolve missing equipped item
names from its supported client's loaded item-definition tree. Capture is
read-only and on demand, using the existing selected session reader. It does not
open the Broker or send game input.

## Player workflow

1. Sign in with Discord, link a character through Census and refresh equipment
   on the wiki account page.
2. Open `/equipment-identification/#overlay-access` and create a companion token.
3. In Companion, select the same character/world reference and open **Wiki items**.
4. Paste the token, refresh wiki items, capture names, then inspect the preview.
5. Choose **Send names to wiki**. Published names appear on every
   profile without resyncing the equipment snapshot.

Only definitions currently loaded by the game can be captured. Missing definitions
remain unresolved. This captures exact item IDs and names, not unproven item
stats, icons, acquisition sources or character ownership. Existing tooltip
submissions remain available for additional evidence.

Tokens are character-bound, expire after 30 days, and authorize only viewing
missing equipment IDs and publishing captured item names. Creation replaces the
previous token; revoke it from the same page. Tokens are stored hashed on the
server and only in memory in Companion. They cannot edit articles, moderate other contributions, access screenshots,
or authenticate as a Discord browser session.
Changing the linked character invalidates the token.

## API contract

Cookie-authenticated same-origin `POST /api/items/overlay-token` creates a token;
`DELETE` revokes it. Both require the normal Discord session. The creation
response contains `token` and Unix-seconds `expiresAt` and is never cached.

Native requests use `Authorization: Bearer <64 lowercase hex characters>` and
never fall back to browser cookies:

- `GET /api/overlay/items` returns `character: {id,name,worldId}` and
  `items: [{itemId}]`. IDs are strings. Saved equipment must be less than 24 hours
  old. Includes unknown augments, deduplicates IDs, and caps each list at 50.
- `POST /api/overlay/items` accepts `schemaVersion: 1`, `character`, `build`
  (executable SHA-256), `profile: "item-names-v1"`, Unix-seconds `capturedAt`, and
  `items: [{itemId,name}]`. Returns HTTP 201 with `{submitted,skipped}` counts.
  Repeating published items skips duplicates. IDs must belong to the linked
  character's fresh snapshot; unknown IDs are published directly with capture history.

Requests are bounded and rate limited. Writes recheck token, character, snapshot
and existing identity. Captures contain no raw addresses, memory dumps, chat,
positions or account tokens. Build/profile metadata is client-provided provenance,
not remote attestation. Captured names publish directly from linked player accounts; the existing
audit history records the publisher and capture provenance. Corrections and
revocations remain available.

## Deployment

Apply `migrations/0007_overlay_items.sql` before deploying this worker. It adds a
scoped token table and capture metadata columns without changing existing
screenshots or published mappings. Deploy the companion with the matching API
contract. No Daybreak or Discord secret is included in the companion.
