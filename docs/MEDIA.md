# Guide image storage

R2 bucket: `dcuo-wiki-images`. Public domain: `https://images.dcuo-wiki.com`.
The render catalog contains 2,834 credited source-image records, including guide maps, source artwork, and currency icons. Full-resolution downloaded bytes and compact previews are retained; Fandom's CDN may return WebP for a URL ending in .jpg or .png. The release-gap/reward batch added 354 records and 708 original/preview objects. The feat batch adds 343 credited records and 686 original/preview objects, including location maps and collection checklists. The category foundations add 776 credited records and 1,552 original/preview objects. Binary files stay outside Git and Astro assets.

`data/media-sources.json` records reviewed source URLs and attribution.
`data/media.json` is the versioned render catalog. D1 `media_assets` mirrors
provenance for administration. Rendering uses the bundled catalog, avoiding a
D1 read per image. Original article references remain unchanged so community
revision hashes remain valid. Both static and live-edited maps use one renderer.
Unknown URLs remain links until reviewed and imported; they are not hotlinked.

## Import more images

1. Retrieve the source article and image evidence with Firecrawl. Review the
   actual image, source, credit and rights; do not assume the text license applies.
2. Add the full-resolution source to `data/media-sources.json`.
3. Run `node scripts/import-media.mjs --new-only` (requires ImageMagick `magick`). Downloads
   are bounded, restricted to the reviewed Fandom image host, and cached locally.
   SHA-256 filenames reuse identical originals. Binaries stay out of Git.
4. Upload only the `key` and `previewKey` files listed in `data/media.json` from
   `.import-cache/media/` to the root of the R2 bucket. Do not upload `.download`
   cache files. Use the Cloudflare dashboard's multiple-file upload, or an
   authenticated Wrangler `r2 object put` command with `--remote --file` and the
   appropriate `--content-type`. Keep the custom domain enabled.
   Dashboard uploads allow 100 files per batch. After completion, refresh the
   page before selecting another batch. Do not use the upload panel's `Remove
   all` control: it removes the uploaded objects as well as clearing the list.
5. Apply D1 migrations, run `node scripts/media-catalog.mjs`, then execute
   `.import-cache/media-catalog.sql` against `dcuo-wiki-accounts`. This upserts
   metadata only; it does not modify player data.
6. Verify each public image URL and preview before deploying the catalog. Run
   `npm run validate`, `npm run test:browser`, `npm run test:cloudflare`, and
   `npm run deploy:check`. Visually check maps at desktop and mobile widths.

R2 objects do not count toward the site's 20,000 static-file limit. R2 usage is
shared across the account; other buckets already exceed its free storage tier.
Profile screenshot storage and unrelated site artwork are unchanged.
