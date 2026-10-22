import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const batches = JSON.parse(
  await readFile(process.argv[2] || ".import-cache/mission-upload-batches.json", "utf8"),
);
const files = batches.flat();
const results = [];
let cursor = 0;
const digest = (b) => createHash("sha256").update(b).digest("hex");
await Promise.all(
  Array.from({ length: 8 }, async () => {
    while (cursor < files.length) {
      const path = files[cursor++],
        name = path.split("/").at(-1);
      if (!/^[a-f0-9]{64}(?:-preview)?\.(?:webp|png|jpg)$/.test(name))
        throw Error("Unexpected image key");
      const expected = await readFile(path);
      let result;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const response = await fetch("https://images.dcuo-wiki.com/" + name, {
            signal: AbortSignal.timeout(30000),
          });
          if (response.ok) {
            const bytes = Buffer.from(await response.arrayBuffer());
            result = {
              key: name,
              status: response.status,
              bytes: bytes.length,
              match: digest(bytes) === digest(expected),
            };
            break;
          }
          result = { key: name, status: response.status, match: false };
        } catch {
          result = { key: name, status: "network-error", match: false };
        }
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
      results.push(result);
      if (results.length % 100 === 0)
        console.log(
          JSON.stringify({
            verified: results.length,
            total: files.length,
            failed: results.filter((r) => !r.match).length,
          }),
        );
    }
  }),
);
const failed = results.filter((r) => !r.match);
await writeFile(
  process.argv[3] || ".import-cache/mission-media-verification.json",
  JSON.stringify(
    {
      verifiedAt: new Date().toISOString(),
      total: results.length,
      failed: failed.length,
      results,
    },
    null,
    2,
  ) + "\n",
);
console.log({ verified: results.length, failed: failed.length });
if (failed.length) process.exitCode = 1;
