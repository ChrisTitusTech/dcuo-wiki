import { readFile, writeFile } from 'node:fs/promises';
const media = JSON.parse(await readFile('data/media.json', 'utf8'));
const quote = (value) => "'" + value.replaceAll("'", "''") + "'";
const sql = media.map(m => `INSERT INTO media_assets (source_page, sha256, object_key, metadata_json) VALUES (${[m.sourcePage,m.sha256,m.key,JSON.stringify(m)].map(quote).join(',')}) ON CONFLICT(source_page) DO UPDATE SET sha256=excluded.sha256, object_key=excluded.object_key, metadata_json=excluded.metadata_json;`).join('\n');
await writeFile('.import-cache/media-catalog.sql', sql + '\n');
console.log(`Prepared ${media.length} catalog records in .import-cache/media-catalog.sql`);
