import { itemText } from "../shared/item-text.mjs";
import { HttpError } from "./security.mjs";
import seeds from "../data/census-item-icons.json" with { type: "json" };
const seedIcons = new Set(seeds);
const maximum = 65536;
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
export function pngBytes(bytes) {
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.length < 45 ||
    bytes.length > maximum ||
    ![137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)
  )
    throw new HttpError(400, "Invalid item icon PNG.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 8,
    first = true,
    data = false,
    end = false;
  while (pos + 12 <= bytes.length) {
    const n = view.getUint32(pos),
      type = new TextDecoder().decode(bytes.subarray(pos + 4, pos + 8));
    if (n > maximum || pos + 12 + n > bytes.length)
      throw new HttpError(400, "Invalid PNG chunk.");
    if (
      crc32(bytes.subarray(pos + 4, pos + 8 + n)) !==
      view.getUint32(pos + 8 + n)
    )
      throw new HttpError(400, "Invalid PNG checksum.");
    if (first) {
      if (
        type !== "IHDR" ||
        n !== 13 ||
        !view.getUint32(pos + 8) ||
        !view.getUint32(pos + 12) ||
        view.getUint32(pos + 8) > 256 ||
        view.getUint32(pos + 12) > 256 ||
        bytes[pos + 16] !== 8 ||
        ![2, 6].includes(bytes[pos + 17]) ||
        bytes[pos + 18] ||
        bytes[pos + 19] ||
        bytes[pos + 20]
      )
        throw new HttpError(
          400,
          "Item icons must be bounded RGB or RGBA PNGs.",
        );
      first = false;
    } else if (type === "IDAT") data = true;
    else if (type === "IEND") {
      if (n || pos + 12 !== bytes.length)
        throw new HttpError(400, "Invalid PNG end.");
      end = true;
    } else if (!["sRGB", "gAMA", "pHYs"].includes(type))
      throw new HttpError(400, "Unsupported item icon PNG chunk.");
    pos += n + 12;
  }
  if (pos !== bytes.length || !data || !end)
    throw new HttpError(400, "Incomplete item icon PNG.");
  return bytes;
}
export async function iconPng(env, encoded, resource) {
  if (
    typeof encoded !== "string" ||
    encoded.length > 87384 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      encoded,
    )
  )
    throw new HttpError(400, "Invalid item icon encoding.");
  let bytes;
  try {
    bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  } catch {
    throw new HttpError(400, "Invalid item icon encoding.");
  }
  pngBytes(bytes);
  if (!env.MEDIA)
    throw new HttpError(503, "Item image storage is unavailable.");
  const digest = [
    ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
  ]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
  await env.MEDIA.put(`item-icons/${digest}`, bytes, {
    onlyIf: { etagDoesNotMatch: "*" },
    httpMetadata: {
      contentType: "image/png",
      cacheControl: "public,max-age=31536000,immutable",
    },
    customMetadata: {
      resource,
      rights:
        "DC Universe Online game artwork; rights belong to respective owners.",
    },
  });
  return `/api/item-icons/${digest}`;
}
export function validateDetails(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new HttpError(400, "Invalid item definition details.");
  const result = {};
  for (const [field, max] of [
    ["description", 4096],
    ["style", 512],
    ["iconResource", 512],
  ]) {
    if (raw[field] === undefined) continue;
    const value =
      field === "description" && typeof raw[field] === "string"
        ? itemText(raw[field])
        : raw[field];
    if (
      typeof value !== "string" ||
      !value.trim() ||
      value.length > max ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value) ||
      (field !== "description" && /[\r\n\t]/.test(value))
    )
      throw new HttpError(400, `Invalid item ${field}.`);
    result[field] = value;
  }
  if (
    result.iconResource &&
    !/^DUIICONSLIBS\d{3}\/UIICONSLIBS\d{3}#[A-Za-z0-9_]{1,32}$/.test(
      result.iconResource,
    )
  )
    throw new HttpError(400, "Invalid item icon resource.");
  for (const [field, max] of [
    ["requiredLevel", 255],
    ["requiredCombatRating", 65535],
    ["qualityId", 4294967295],
    ["categoryId", 4294967295],
  ]) {
    if (raw[field] === undefined) continue;
    if (!Number.isSafeInteger(raw[field]) || raw[field] < 0 || raw[field] > max)
      throw new HttpError(400, `Invalid item ${field}.`);
    result[field] = raw[field];
  }
  if (raw.iconPng !== undefined && !result.iconResource)
    throw new HttpError(400, "An icon needs its captured resource.");
  if (!Object.keys(result).length)
    throw new HttpError(400, "Capture contains no item definition details.");
  return result;
}
export async function serveItemIcon(request, env) {
  const digest = new URL(request.url).pathname.match(
    /^\/api\/item-icons\/([a-f0-9]{64})$/,
  )?.[1];
  if (!digest) throw new HttpError(404, "Item icon not found.");
  if (!env.MEDIA)
    throw new HttpError(503, "Item image storage is unavailable.");
  const key = `item-icons/${digest}`;
  if (!(await env.MEDIA.head(key))) {
    if (!seedIcons.has(digest))
      throw new HttpError(404, "Item icon not found.");
    const response = await env.ASSETS.fetch(
      new Request(`https://assets.invalid/item-icons/${digest}.png`),
    );
    if (!response.ok) throw new HttpError(404, "Item icon not found.");
    const bytes = pngBytes(new Uint8Array(await response.arrayBuffer()));
    const actual = [
      ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    ]
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("");
    if (actual !== digest)
      throw new HttpError(502, "Item icon integrity failed.");
    await env.MEDIA.put(key, bytes, {
      onlyIf: { etagDoesNotMatch: "*" },
      httpMetadata: {
        contentType: "image/png",
        cacheControl: "public,max-age=31536000,immutable",
      },
      customMetadata: {
        rights:
          "DC Universe Online game artwork; rights belong to respective owners.",
      },
    });
  }
  return new Response(null, {
    status: 302,
    headers: {
      Location: `https://images.dcuo-wiki.com/${key}`,
      "Cache-Control": "public,max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
