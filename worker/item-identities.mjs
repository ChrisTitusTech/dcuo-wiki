import known from "../data/census-item-index.json" with { type: "json" };
export const itemId = (value) =>
  typeof value === "string" && /^[1-9]\d{0,29}$/.test(value);
export const sourceItems = new Map(
  known.map(([id, slug, name]) => [id, { name, slug }]),
);
export async function itemIdentities(env, ids) {
  const unique = [...new Set(ids)].filter(itemId);
  const result = new Map(
    unique
      .filter((id) => sourceItems.has(id))
      .map((id) => [id, sourceItems.get(id)]),
  );
  const missing = unique.filter((id) => !result.has(id));
  for (let start = 0; start < missing.length; start += 80) {
    const chunk = missing.slice(start, start + 80);
    const rows = await env.DB.prepare(
      `SELECT item_id,name,slug,notes FROM item_identifications WHERE item_id IN (${chunk.map(() => "?").join(",")})`,
    )
      .bind(...chunk)
      .all();
    for (const row of rows.results) result.set(row.item_id, row);
  }
  return result;
}
export function describeItem(id, identities) {
  const known = identities.get(id);
  return known
    ? {
        itemId: id,
        name: known.name,
        identified: true,
        ...(known.slug ? { href: `/wiki/${known.slug}/` } : {}),
        ...(known.notes ? { notes: known.notes } : {}),
      }
    : { itemId: id, name: `Census item ${id}`, identified: false };
}
