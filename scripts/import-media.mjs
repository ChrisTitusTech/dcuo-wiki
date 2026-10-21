// Download only reviewed image URLs. Keep binaries out of Git and Astro's asset budget.
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
const directory = resolve(".import-cache/media");
await mkdir(directory, { recursive: true });
const sources = JSON.parse(await readFile("data/media-sources.json", "utf8"));
const manifest = [];
for (const source of sources) {
  const url = new URL(source.originalUrl);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "static.wikia.nocookie.net" ||
    !url.pathname.startsWith("/dcuo/images/")
  )
    throw new Error("Unapproved image source");
  const cache = resolve(
    directory,
    createHash("sha256").update(url.href).digest("hex") + ".download",
  );
  let bytes;
  try {
    bytes = await readFile(cache);
  } catch {
    const response = await fetch(url, {
      redirect: "error",
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok)
      throw new Error(
        `Image download failed: ${response.status} ${source.sourcePage}`,
      );
    if (Number(response.headers.get("content-length")) > 10 * 1024 * 1024)
      throw new Error("Image too large");
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 10 * 1024 * 1024) throw new Error("Image too large");
      chunks.push(chunk);
    }
    bytes = Buffer.concat(chunks);

    await writeFile(cache, bytes);
  }
  const extension =
    bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      ? "jpg"
      : bytes
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        ? "png"
        : bytes.toString("ascii", 0, 4) === "RIFF" &&
            bytes.toString("ascii", 8, 12) === "WEBP"
          ? "webp"
          : null;
  if (!extension) throw new Error("Unsupported image format");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const key = `${sha256}.${extension}`,
    previewKey = `${sha256}-preview.webp`;
  const original = resolve(directory, key),
    preview = resolve(directory, previewKey);
  await writeFile(original, bytes);
  const identify = (path) =>
    execFileSync("magick", ["identify", "-format", "%w %h", path], {
      encoding: "utf8",
    })
      .trim()
      .split(" ")
      .map(Number);
  const [width, height] = identify(original);
  if (width < 50 || height < 50 || width * height > 40000000)
    throw new Error("Unexpected screenshot dimensions");
  execFileSync("magick", [
    original,
    "-resize",
    "960x960>",
    "-strip",
    "-quality",
    "90",
    preview,
  ]);
  const [previewWidth, previewHeight] = identify(preview);
  manifest.push({
    ...source,
    sha256,
    key,
    previewKey,
    width,
    height,
    previewWidth,
    previewHeight,
    bytes: bytes.length,
    previewBytes: (await stat(preview)).size,
    contentType: extension === "jpg" ? "image/jpeg" : `image/${extension}`,
    original: `https://images.dcuo-wiki.com/${key}`,
    preview: `https://images.dcuo-wiki.com/${previewKey}`,
  });
  console.log(
    `${source.sourcePage.split("File:")[1]}: ${width}x${height}, ${bytes.length} bytes`,
  );
}
await writeFile("data/media.json", JSON.stringify(manifest, null, 2) + "\n");
console.log(
  JSON.stringify({
    images: manifest.length,
    bytes: manifest.reduce((sum, m) => sum + m.bytes + m.previewBytes, 0),
  }),
);
