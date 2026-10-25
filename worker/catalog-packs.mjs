import { catalogPackPath, packedValue } from "../shared/catalog-packs.mjs";
import { HttpError } from "./security.mjs";
export async function catalogRecord(env, slug, kind) {
  const asset = await env.ASSETS.fetch(
    new Request("https://dcuo-wiki.com" + catalogPackPath(slug)),
  );
  if (asset.status === 404) return null;
  if (
    asset.status !== 200 ||
    !asset.headers.get("content-type")?.includes("text/plain")
  )
    throw new HttpError(503, "Article source is temporarily unavailable.");
  return packedValue(await asset.text(), slug, kind);
}
