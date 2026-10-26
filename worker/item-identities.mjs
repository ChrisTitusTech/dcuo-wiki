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
  const missing = unique;
  for (let start = 0; start < missing.length; start += 80) {
    const chunk = missing.slice(start, start + 80);
    const rows = await env.DB.prepare(
      `SELECT item_id,name,slug,notes FROM item_identifications WHERE item_id IN (${chunk.map(() => "?").join(",")})`,
    )
      .bind(...chunk)
      .all();
    for (const row of rows.results)
      result.set(row.item_id, {
        ...(result.get(row.item_id) || {}),
        ...row,
        slug: row.slug || result.get(row.item_id)?.slug,
      });
  }
  for (let start = 0; start < unique.length; start += 80) {
    const chunk = unique.slice(start, start + 80);
    const rows = await env.DB.prepare(
      `SELECT item_id,details_json FROM item_details WHERE item_id IN (${chunk.map(() => "?").join(",")})`,
    )
      .bind(...chunk)
      .all();
    const dynamic = new Map(
      rows.results.map((r) => [r.item_id, JSON.parse(r.details_json)]),
    );
    for (const id of chunk) {
      const details = dynamic.get(id);
      if (details && result.has(id))
        result.set(id, { ...result.get(id), details });
    }
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
        ...(known.slug
          ? { href: `/wiki/${known.slug}/` }
          : known.details &&
              (known.details.description ||
                known.details.style ||
                known.details.icon ||
                known.details.requiredLevel > 0 ||
                known.details.requiredCombatRating > 0)
            ? { href: `/wiki/Item_${id}/` }
            : {}),
        ...(known.notes ? { notes: known.notes } : {}),
        ...(known.details ? { details: known.details } : {}),
      }
    : { itemId: id, name: `Census item ${id}`, identified: false };
}
