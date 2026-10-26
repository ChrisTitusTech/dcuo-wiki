import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { createHash } from "node:crypto";
import {
  pngBytes,
  iconPng,
  serveItemIcon,
  validateDetails,
} from "../worker/item-details.mjs";
function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) {
    c ^= b;
    for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length);
  out.write(type, 4);
  out.set(data, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
export function fixturePng(width = 1) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.from([0, 255, 0, 0, 255]))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
test("PNG uploads are bounded, hashed and displayed through R2 only", async () => {
  const bytes = fixturePng();
  assert.equal(pngBytes(bytes), bytes);
  const records = new Map();
  const env = {
    MEDIA: {
      async put(key, body, meta) {
        records.set(key, { body, meta });
      },
      async head(key) {
        return records.get(key) || null;
      },
    },
  };
  const path = await iconPng(
    env,
    bytes.toString("base64"),
    "DUIICONSLIBS123/UIICONSLIBS123#321",
  );
  const digest = createHash("sha256").update(bytes).digest("hex");
  assert.equal(path, "/api/item-icons/" + digest);
  assert.equal(
    records.get("item-icons/" + digest).meta.httpMetadata.contentType,
    "image/png",
  );
  const response = await serveItemIcon(
    new Request("https://dcuo-wiki.com" + path),
    env,
  );
  assert.equal(response.status, 302);
  assert.equal(
    response.headers.get("Location"),
    "https://images.dcuo-wiki.com/item-icons/" + digest,
  );
  await assert.rejects(
    serveItemIcon(
      new Request("https://dcuo-wiki.com/api/item-icons/" + "a".repeat(64)),
      env,
    ),
    { status: 404 },
  );
  for (const invalid of [
    bytes.subarray(0, bytes.length - 1),
    fixturePng(257),
    Buffer.concat([bytes, Buffer.from("trailing")]),
    Buffer.from("not png"),
  ])
    assert.throws(() => pngBytes(invalid), { status: 400 });
  const corrupt = Buffer.from(bytes);
  corrupt[corrupt.length - 1] ^= 1;
  assert.throws(() => pngBytes(corrupt), { status: 400 });
  await assert.rejects(iconPng(env, "data:image/png;base64,abc", "resource"), {
    status: 400,
  });
});
test("definition fields reject remote icons and unproven per-character stats", () => {
  const value = validateDetails({
    style: "Tech Hammer",
    requiredLevel: 30,
    icon: "https://evil.invalid/a",
    stats: [{ value: 1 }],
    itemLevel: 450,
  });
  assert.deepEqual(value, { style: "Tech Hammer", requiredLevel: 30 });
  assert.throws(() => validateDetails({ iconPng: "x" }), { status: 400 });
});
