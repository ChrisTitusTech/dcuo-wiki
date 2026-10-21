# Mission source downloads

Run `node scripts/download-missions.mjs` from the repository root to stage the source Missions category. The downloader reads the existing Firecrawl key from `.env`, follows every category continuation, and checks the unique entry count against the source total before fetching articles.

- `data/mission-downloads.json` records the index pages, separate category links, article URLs, retrieval times, content hashes, and failures.
- `.import-cache/<sha256-of-url>.json` retains the Markdown, HTML, links, and source metadata locally. These source captures are ignored by Git and are not deployed as website assets.
- Five requests run concurrently. Existing valid article captures are reused, and completed captures are written atomically. Rerun the command to resume after interruption or retry failed entries.
- Category captures are also cached locally. Remove only `.import-cache/category-*.json` when deliberately requesting a fresh category enumeration.

A download is not publication approval. Review canonical aliases, historical versions, substantive objectives, map/location evidence, and attribution before converting an article. Missing information can be supplemented with an explicitly matching YouTube reference; do not infer a quest match from a generic DCUO video. Record what the reference actually supports and any remaining gaps.

The source category includes overview pages and nested category links, so its item count is not a count of complete walkthroughs. This download covers direct members of the Missions category; it does not recursively claim coverage of every nested category.

## Large batches

After category discovery has created the manifest, `node scripts/download-mission-batch.mjs` submits uncached URLs through Firecrawl's batch endpoint. It saves the job ID and result cursor in `.import-cache/mission-batch-job.json`, retrieves and saves completed results incrementally, and resumes that same job when rerun. It follows the API's result pagination and checks requested URL membership before saving data. Account concurrency limits still apply.

After the batch finishes, rerun `node scripts/download-missions.mjs` to verify all cached captures, retry any missing pages, and finalize the tracked manifest. Do not run the individual and batch downloaders concurrently. Preserve the job checkpoint until retrieval is complete; deleting it while the remote job runs would risk submitting duplicate work.

## Completed capture: October 21, 2026

All six Missions index pages were traversed and reconciled: 1,130 direct members, comprising 1,107 article URLs and 23 category links. All 1,107 articles are saved locally with Markdown, HTML, and links; each stored content hash and HTTP status was verified. No article downloads remain missing. The tracked manifest records the complete result. Source captures are approximately 26 MB before compression.

These are source articles, including overview and historical pages, not 1,107 approved quest walkthroughs. Conversion, map review, local image copying, and matching YouTube references remain separate work.
