export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export const now = () => Math.floor(Date.now() / 1000);
export const random = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
export async function hash(value) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
export function cookie(request, name) {
  return (
    (request.headers.get("Cookie") || "")
      .split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith(name + "="))
      ?.slice(name.length + 1) || ""
  );
}
export function setCookie(name, value, age) {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
}
export function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}
export async function boundedBody(request, limit) {
  if (Number(request.headers.get("Content-Length")) > limit)
    throw new HttpError(413, "Upload is too large.");
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  let size = 0;
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new HttpError(413, "Upload is too large.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
export async function bodyJson(request, maximum = 20000) {
  if (request.headers.get("Content-Type")?.split(";")[0] !== "application/json")
    throw new HttpError(415, "Send JSON.");
  try {
    const body = JSON.parse(
      new TextDecoder().decode(await boundedBody(request, maximum)),
    );
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new Error();
    return body;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, "Invalid request.");
  }
}
export function textField(value, label, min, max) {
  if (
    typeof value !== "string" ||
    value.trim().length < min ||
    value.trim().length > max
  )
    throw new HttpError(400, `${label} must be ${min}-${max} characters.`);
  return value.trim();
}
export function characterName(value) {
  const name = textField(value, "Character name", 1, 64);
  // Census treats leading punctuation as query operators; do not accept operators.
  if (!/^[\p{L}\p{N}][\p{L}\p{N} _'.-]*$/u.test(name))
    throw new HttpError(
      400,
      "Enter an exact character name, without search operators.",
    );
  return name;
}
export function imageType(bytes) {
  if (
    bytes.length >= 24 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b)
  )
    return "image/png";
  if (
    bytes.length >= 4 &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255 &&
    bytes.at(-2) === 255 &&
    bytes.at(-1) === 217
  )
    return "image/jpeg";
  throw new HttpError(415, "Use a PNG or JPEG screenshot.");
}
