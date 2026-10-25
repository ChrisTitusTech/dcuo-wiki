import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
export function checkBudget(sizes, limit = 19500) {
  return {
    files: sizes.length,
    bytes: sizes.reduce((a, b) => a + b, 0),
    ok: sizes.length <= limit && sizes.every((n) => n <= 25 * 1024 * 1024),
  };
}
async function walk(dir) {
  const files = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) files.push(...(await walk(p)));
    else files.push((await stat(p)).size);
  }
  return files;
}
if (process.argv[1]?.endsWith("check-budget.mjs")) {
  const report = checkBudget(await walk("dist"));
  console.log(
    JSON.stringify({ ...report, budget: 19500, platformLimit: 20000 }, null, 2),
  );
  if (!report.ok) process.exitCode = 1;
}
