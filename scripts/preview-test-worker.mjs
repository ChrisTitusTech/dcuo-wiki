// Disposable, local-only account database. No production bindings or credentials.
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import articles from "../src/data/articles.json" with { type: "json" };
const directory = await mkdtemp(join(tmpdir(), "dcuo-worker-test-"));
const { default: ts } = await import("typescript");
const parsed = ts.parseConfigFileTextToJson(
  "wrangler.jsonc",
  await readFile("wrangler.jsonc", "utf8"),
);
if (parsed.error) throw new Error("Invalid Wrangler configuration");
const config = parsed.config;
config.main = resolve("worker/index.mjs");
config.assets.directory = resolve("dist");
delete config.routes;
config.vars = {
  SITE_ORIGIN: "http://127.0.0.1:8787",
  DISCORD_CLIENT_ID: "local-test",
  DISCORD_CLIENT_SECRET: "local-test-only",
};
config.d1_databases = [
  {
    binding: "DB",
    database_name: "test-only",
    database_id: "00000000-0000-0000-0000-000000000000",
  },
];
const file = join(directory, "wrangler.json");
await writeFile(file, JSON.stringify(config));
const baseline = articles.find((a) => a.slug === "Powers").summary;
const sql =
  (await readFile("migrations/0001_accounts.sql", "utf8")) +
  (await readFile("migrations/0002_article_revisions.sql", "utf8")) +
  `\nINSERT INTO users VALUES ('11111111-1111-4111-8111-111111111111','100','Local fixture',0);
INSERT INTO sessions VALUES ('${createHash("sha256").update("a".repeat(64)).digest("hex")}','11111111-1111-4111-8111-111111111111',4102444800);
INSERT INTO profiles(user_id,character_id,character_name,world_id,census_json,matched_at,bio,updated_at) VALUES ('11111111-1111-4111-8111-111111111111','123','Local fixture','2','{"character_id":"123","name":"Local fixture","world_id":"2"}',0,'',0);`;
await writeFile(
  join(directory, "seed.sql"),
  sql +
    `
INSERT INTO article_revisions(slug,part,base_hash,parent_revision,content,previous_content,reason,sources,user_id,character_name,created_at)
VALUES ('Powers','summary','${createHash("sha256").update(baseline).digest("hex")}',0,'Live fixture power correction <script>bad()</script>','${baseline.replaceAll("'", "''")}','Local integration test','Local fixture evidence','11111111-1111-4111-8111-111111111111','Local fixture',1);`,
);
const cli = resolve("node_modules/wrangler/bin/wrangler.js");
const init = spawnSync(
  process.execPath,
  [
    cli,
    "d1",
    "execute",
    "DB",
    "--local",
    "--config",
    file,
    "--persist-to",
    directory,
    "--file",
    join(directory, "seed.sql"),
  ],
  { stdio: "inherit" },
);
if (init.status !== 0) {
  await rm(directory, { recursive: true, force: true });
  process.exit(init.status || 1);
}
const child = spawn(
  process.execPath,
  [
    cli,
    "dev",
    "--local",
    "--config",
    file,
    "--persist-to",
    directory,
    "--port",
    "8787",
  ],
  { stdio: "inherit" },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", async (code) => {
  await rm(directory, { recursive: true, force: true });
  process.exit(code || 0);
});
