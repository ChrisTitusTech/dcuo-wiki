import { HttpError } from "./security.mjs";
import { catalogRecord } from "./catalog-packs.mjs";
const maximum = 10 * 1024 * 1024;
function imageType(bytes) {
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    return "image/jpeg";
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v))
    return "image/png";
  const text = new TextDecoder().decode(bytes.slice(0, 12));
  if (text.startsWith("RIFF") && text.slice(8) === "WEBP") return "image/webp";
  if (/^GIF8[79]a/.test(text)) return "image/gif";
  throw new HttpError(502, "The source did not return a supported image.");
}
export async function serveCatalogMedia(request, env, fetcher = fetch) {
  if (
    !/^\/api\/catalog-media\/[a-f0-9]{64}(?:\/source)?$/.test(
      new URL(request.url).pathname,
    )
  )
    throw new HttpError(404, "Image not found.");
  const id = new URL(request.url).pathname.split("/")[3];
  if (!/^[a-f0-9]{64}$/.test(id || ""))
    throw new HttpError(404, "Image not found.");
  if (new URL(request.url).pathname.endsWith("/source")) {
    const raw = await catalogRecord(env, id, "media");
    if (!raw) throw new HttpError(404, "Image source not found.");
    const source = new URL(JSON.parse(raw).sourcePage);
    if (
      source.origin !== "https://dcuniverseonline.fandom.com" ||
      !source.pathname.startsWith("/wiki/File:") ||
      source.username ||
      source.password
    )
      throw new HttpError(502, "Invalid image attribution.");
    return new Response(null, {
      status: 302,
      headers: {
        Location: source.href,
        "Cache-Control": "public,max-age=86400",
      },
    });
  }
  if (!env.MEDIA)
    throw new HttpError(503, "Image storage is temporarily unavailable.");
  const key = "catalog/" + id;
  if (!(await env.MEDIA.head(key))) {
    const record = await catalogRecord(env, id, "media");
    if (!record) throw new HttpError(404, "Image not found.");
    const source = JSON.parse(record);
    const url = new URL(source.originalUrl);
    if (
      url.origin !== "https://static.wikia.nocookie.net" ||
      !url.pathname.startsWith("/dcuo/images/") ||
      url.username ||
      url.password
    )
      throw new HttpError(502, "Unapproved image source.");
    const response = await fetcher(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok)
      throw new HttpError(
        response.status === 404 ? 404 : 502,
        "Source image could not be copied.",
      );
    if (Number(response.headers.get("content-length")) > maximum)
      throw new HttpError(502, "Source image is too large.");
    const reader = response.body.getReader(),
      chunks = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > maximum)
          throw new HttpError(502, "Source image is too large.");
        chunks.push(value);
      }
    } catch (error) {
      await reader.cancel();
      throw error;
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const contentType = imageType(bytes);
    await env.MEDIA.put(key, bytes, {
      onlyIf: { etagDoesNotMatch: "*" },
      httpMetadata: {
        contentType,
        cacheControl: "public,max-age=31536000,immutable",
      },
      customMetadata: {
        sourcePage: source.sourcePage,
        originalUrl: source.originalUrl,
        credit: source.credit,
        rights:
          source.rights || "Game artwork; rights belong to respective owners.",
      },
    });
  }
  return new Response(null, {
    status: 302,
    headers: {
      Location: "https://images.dcuo-wiki.com/" + key,
      "Cache-Control": "public,max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
