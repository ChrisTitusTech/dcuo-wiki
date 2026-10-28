# Companion item capture

DCUO Companion (DCUO-Overlay) captures loaded item definitions and equipped values
from its exact supported game build. The existing selected-session reader performs
bounded, read-only captures. It never opens inventory/Broker, loads definitions,
invokes game functions or sends input for this feature.

## Player workflow

1. Sign in with Discord, link a Census character and refresh wiki equipment.
2. Create a token at `/equipment-identification/#overlay-access`.
3. Open **Wiki items** in Companion and paste the token. Account details load
   automatically; no separate reference lookup is needed.
4. With the matching supported game character connected, updated Companion
   source versions automatically check loaded item IDs and upload unknown
   definitions/icons in batches, at least 90 seconds apart, on any tab. Use
   **Pause automatic missing-item uploads** in the Wiki tab to pause this work.
5. Manual equipment/catalog capture and preview remain available for explicit
   enrichment of known items. Send or clear a manual preview before continuing.

Automatic uploads require both the updated server and companion. The original
v0.1.0 installer still uses the manual workflow.

Equipment capture fills existing names, icons, definitions and slot-specific base
stats. Loaded catalog capture also creates or updates non-equipped items actually
observed in the game's loaded definition cache. It processes at most 50 IDs per
batch, without loading absent items. A batch is not a complete game database.
Missing/unsupported icons do not discard valid definitions; publication reports
uploaded and missing artwork counts. No generated placeholder artwork is used.

The public [companion catalog](https://dcuo-wiki.com/companion-items/) links exact
source IDs to their existing wiki articles. Substantive new definitions receive
`/wiki/Item_<ID>/` articles with the full wiki editor. Names or raw enum IDs alone
do not create empty articles. Existing source articles receive a clearly labelled
captured-definition supplement; community corrections and history are preserved.

## Fields and artwork

Definition fields include independently proven name, description, icon resource,
style when available, base level/CR requirements and raw category/quality IDs.
Descriptions become plain text; game markup is not trusted. Category/quality
labels are not guessed. Artwork resolves the exact GFX symbol and texture export,
then decodes the installed game texture to a bounded PNG. Startup libraries and
separate icon packages are supported. Image names or texture order never establish
an item association. PNGs are content-addressed and displayed from the wiki's R2
bucket through `/api/item-icons/<SHA256>`.

Equipped item level, effects and numeric **base stats** are stored separately by
character, world, slot and item ID. Identical augment IDs in multiple slots retain
different values. Base stats exclude socket/conditional bonuses and are labelled
accordingly, with capture time. Replaced items never inherit another item's data.
Acquisition locations, prices and other unproven fields are not invented.

## Tokens and API

Tokens expire after 30 days and are stored hashed on the server. Updated
Companion source versions save tokens separately from preferences (user-bound
DPAPI on Windows, a private user-owned file on Linux) and restore them at startup.
Clear token removes that saved copy; the original v0.1.0 keeps tokens in memory. Creating a token replaces the previous one; revoke on the same
page. Changing/deleting the linked profile revokes it permanently. Tokens allow
item contributions from that linked session; they do not authenticate as Discord,
access screenshots, moderate others or grant general article-editing access.
Census confirms a character record, not ownership or remote memory attestation.

Cookie-authenticated, same-origin `POST /api/items/overlay-token` creates a token;
`DELETE` revokes it. Native requests use `Authorization: Bearer <64 lowercase hex
characters>` and never fall back to cookies.

- `GET /api/overlay/items`: character `{id,name,worldId}` and up to 50 deduplicated
  equipped/augment IDs, including already named items. Saved equipment must be
  less than 24 hours old. The optional `ids=7,8` query checks 1-50 unique,
  canonical positive u32 IDs from any observed catalog batch and returns only IDs
  without a known wiki identity, including skipping name-only identities. It
  cannot be combined with `cursor`. Responses include `missingOnlySupported:true`;
  clients must require this marker before enabling automatic publication.
- `POST /api/overlay/items`: schema version 2, profile `item-details-v1`, scope
  `equipment` or `catalog`, character, executable SHA-256 `build`, Unix-seconds
  `capturedAt`, and `items: [{itemId,name,details}]`. IDs are canonical strings.
  Details may contain the fields above and a base64 `iconPng` tied to its captured
  resource. Optional `equipped` records contain slot, itemId, itemLevel, effects
  and `baseStats: [{name,value}]`.
- For automatic missing-only catalog publication, send `missingOnly:true` with
  version 2 and scope `catalog`. Existing identities, including source-backed
  names without articles, are skipped. The transaction also checks for concurrent
  identities or definitions so an automatic upload cannot overwrite them. The
  response includes `missingOnlySupported:true`; submitted/skipped totals include
  these skips. Other flag types and `true` with other versions/scopes are rejected.
  Manual submissions retain their existing create/update behavior.
- Equipment records must match the linked character's saved Census slot/ID.
  Catalog definitions may be non-equipped, but require substantive captured data.
  Newer captures supersede older definitions; an older batch cannot overwrite
  newer data. Writes, provenance and contribution history commit together.
- HTTP 201 returns `submitted`, `skipped`, `iconsUploaded`, `iconsMissing`.
  Version 1 `item-names-v1` remains compatible and skips existing identities.
- Public `GET /api/companion/items?cursor=<ID>` paginates 50 catalog entries.

Bodies, strings, images, dimensions, traversals and request rates are bounded.
Overlay lookup and submission together allow at most 120 requests per hour per IP.
Automatic clients must pace requests, suppress repeats, stop on authentication or
character mismatches, and require a server advertising missing-only support.
Icons allow PNG only (256 x 256 maximum, 64 KiB) with validated structure/checksums;
clients cannot upload a remote URL. No raw memory, addresses, personal snapshots,
chat, location or account tokens are published. Build/profile metadata is
client-provided provenance, not server attestation.

## Deployment and rollback

Apply migrations `0007_overlay_items.sql` and `0008_item_details.sql` before the
matching Worker. Existing screenshots, mappings and history remain intact.
Publish through the repository's main deployment, then install the matching
Companion. Do not restart an existing Companion process silently. The original v0.1.0
keeps its token only in memory and requires pasting it again after restart.

Rollback the Worker/Companion commit together; the additive tables can remain.
Use D1 Time Travel before a maintenance backfill. Native definition seeds contain
only sanitized public item data and decoded icons; character snapshots remain
private and are never committed.

## October 26 acceptance evidence

Read-only live capture resolved 32 parent definitions across all 35 occupied
slots, with 31 distinct decoded icon PNGs. Per-slot implant levels remain
independent; weapon base stats match the owner's in-game screenshot. Production
D1 contains these definitions/slot observations and the additive revocation
trigger. Personal capture payloads remain private. Artwork copies to R2 on first
view through the content-addressed endpoint.

Local checks pass: 220 unit, 39 browser and 25 Cloudflare tests, including native
PNG upload, catalog creation/update, dynamic article/editor/preview, real D1,
revocation and equipment pagination. Full article correction/history is also
covered with a mocked Census response. Independent Codex review is clean.
Current output is 16,195 static files and 2,888.13 KiB gzip Worker code. Workers
Paid was confirmed active in the account dashboard; its file allowance is
100,000. The existing build guard remains a conservative 19,500 files.

## Automatic missing-item source validation (October 27)

The bounded lookup and atomic missing-only write changes pass 224 Node tests,
26 local Cloudflare tests, type checking (zero errors/warnings) and the site
build/budget check (16,195 files). Actual local D1 tests cover known/static skips,
repeat contributions and concurrent submissions with one insert and one skip.
Independent Codex review found no actionable regressions. No production deployment
or real-token automatic upload was performed for this change.
