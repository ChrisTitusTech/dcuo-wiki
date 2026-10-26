# Identifying missing equipment

Open `/equipment-identification/` from a player profile, the account page, or the community menu. The public queue combines repeated item IDs from saved Census equipment and augments. It shows character counts, last-seen dates and pending evidence counts without exposing account identities. Load more scans the next group of observations; known items do not appear.

## Submit evidence

1. Sign in with Discord and save a Census-matched character.
2. Refresh equipment on your account after changing gear. Submissions require an observed item or augment in a snapshot less than 24 hours old.
3. Click **Identify this item**, or choose an unknown item from your character on the identification page.
4. Enter the exact tooltip name, crop a PNG/JPEG screenshot to the tooltip, and explain the match. Include the item variant, level, relevant stats, capture time and source links. If uncertain, change one equipped item, wait for Census to update, and compare the before/after IDs. Do not rely on transmog appearance or assume that a slot number is its name.
5. Submit for review. The server attaches the saved character/world, snapshot timestamp and raw equipment. A Census character match does not prove ownership. Screenshots are limited to 256 KB after browser resizing and metadata removal; the original input may be up to 10 MB. Evidence is accessible only to its submitter and configured Discord moderators.

## Review and publication

Existing moderators open **Review item evidence** on the same page. Expand **Tooltip and saved equipment**, compare exact names and variants, and require an explicit ID source or a convincing before/after observation when needed. The screenshot itself does not expose an ID automatically.

Publish a verified name, optionally link an existing substantive wiki article by its slug, and optionally add concise verified details with the variant and source. These notes are static evidence, not inferred current character stats. Do not publish tooltip screenshots as item icons: crop game art separately and follow the existing R2 image workflow. Where an article already exists, update its full editor with sourced details and use its approved R2 images.

Approval updates the shared D1 identity lookup immediately for all cached profiles. Competing approvals cannot overwrite an existing name. Rejection retains the evidence and explanation. Select **Published mappings** to revoke an incorrect mapping, give a reason, and return that ID to the unknown queue. The original evidence and append-only review decisions remain in D1. Existing source-backed mappings cannot be replaced by this flow.

## Maintenance and rollback

Apply additive migration `migrations/0006_item_identifications.sql` before deploying the new Worker. It creates the evidence, identity and review-history tables plus queue indexes. Existing profiles and snapshots are preserved. Reverting the Worker leaves submitted evidence intact; do not drop the new tables. Approval/revocation is transactional and does not require rebuilding the site. No new secrets, permissions or R2 bucket are needed.

Run `node scripts/research-unknown-items.mjs PUBLIC_PROFILE_ID` to research remaining IDs with the configured Firecrawl key. Searches are cached under `.import-cache/census-items/unknown-search/`, paced seven seconds apart, and retry rate limits/connection failures after five minutes. Ambiguous POST timeouts stop for inspection instead of silently creating paid requests. Results are research candidates only, never automatic mappings.

The October 25 research checked 24 distinct unresolved IDs: 23 equipped item IDs plus one augment. Search candidates only exposed numeric loadouts and did not establish any additional exact name/ID pairs. The structured audit is in `data/census-item-research.json`. These IDs require additional primary identity data or in-game evidence; no names, icons, current stats or empty articles were invented.

## Character sheet

The game-style equipment view places the saved player image (or a neutral silhouette) between two selectable slot rails. Additional equipment appears below; the complete Census table remains in an expandable list. Selecting a slot opens item details over the portrait. Close or Escape returns focus to the selected slot. Phone layouts retain both rails and wrap the lower slots.

Slot positions are a visual arrangement, not an inferred body-slot taxonomy. Historical and third-party slot mappings disagree with modern data, and Census no longer exposes the definition collection. Unknown items keep their actual slot numbers and neutral icons. No rarity, item level, weapon stats or gear totals are invented. `public/equipment-art.json` is generated from existing, title-matched article images and points only to the approved R2 mirror endpoints; unrelated release icons are excluded. If no matching artwork exists, the neutral icon remains. Approved equipment and augment notes appear in both the inspection panel and full list.

## Rich companion catalog contributions

Companion capture now enriches known items as well as missing names. Loaded
catalog batches can create substantive new item pages and update existing
captured definitions/artwork directly. See [the capture contract](overlay-item-capture.md).
The catalog is at `/companion-items/`; existing source mappings retain their
original articles. Equipped base stats remain character/slot-specific and are
not copied into global item definitions.
