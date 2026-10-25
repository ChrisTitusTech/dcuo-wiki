import { boundedBody, now, random, HttpError } from "./security.mjs";
import knownItems from "../data/census-items.json" with { type: "json" };
const lookup = new Map(knownItems.map((item) => [item.itemId, item]));
const id = (value) =>
  typeof value === "string" && /^[1-9]\d{0,29}$/.test(value);
const configured = (env) =>
  /^[a-zA-Z0-9]+$/.test(env.CENSUS_SERVICE_ID || "") &&
  env.CENSUS_SERVICE_ID !== "example";
const query = (env, sql, ...args) => env.DB.prepare(sql).bind(...args);

export async function fetchEquipment(
  env,
  characterId,
  worldId,
  fetcher = fetch,
) {
  if (!configured(env) || !id(characterId) || !id(worldId))
    throw new Error("Equipment unavailable");
  const url = new URL(
    `https://census.daybreakgames.com/s:${env.CENSUS_SERVICE_ID}/get/dcuo:v1/characters_item/`,
  );
  url.searchParams.set("character_id", characterId);
  url.searchParams.set("world_id", worldId);
  url.searchParams.set("c:limit", "100");
  url.searchParams.set(
    "c:show",
    "character_id,world_id,item_id,equipment_slot_id,quantity,durability,aug_item_id_1,aug_item_id_2,aug_item_id_3",
  );
  const response = await fetcher(url, { signal: AbortSignal.timeout(8000) });
  const data = JSON.parse(
    new TextDecoder().decode(await boundedBody(response, 256 * 1024)),
  );
  const rows = data?.characters_item_list;
  if (
    !response.ok ||
    data.error ||
    !Array.isArray(rows) ||
    rows.length >= 100 ||
    Number(data.returned) !== rows.length
  )
    throw new Error("Incomplete Census equipment");
  const slots = new Set();
  const items = rows.map((row) => {
    if (
      row.character_id !== characterId ||
      row.world_id !== worldId ||
      !id(row.item_id) ||
      typeof row.equipment_slot_id !== "string" ||
      !/^\d{1,4}$/.test(row.equipment_slot_id) ||
      slots.has(row.equipment_slot_id)
    )
      throw new Error("Invalid Census equipment");
    slots.add(row.equipment_slot_id);
    const integer = (value) =>
      typeof value === "string" && /^\d{1,9}$/.test(value)
        ? Number(value)
        : null;
    return {
      itemId: row.item_id,
      slot: row.equipment_slot_id,
      quantity: integer(row.quantity),
      durability: integer(row.durability),
      augments: [
        row.aug_item_id_1,
        row.aug_item_id_2,
        row.aug_item_id_3,
      ].filter(id),
    };
  });
  return items.sort((a, b) => Number(a.slot) - Number(b.slot));
}
const describe = (itemId) => {
  const known = lookup.get(itemId);
  return known
    ? { itemId, name: known.title, href: `/wiki/${known.slug}/` }
    : { itemId, name: `Census item ${itemId}` };
};
export async function equipment(
  env,
  character,
  { manual = false, fetcher = fetch, context } = {},
) {
  const characterId = character.character_id,
    worldId = character.world_id;
  if (!id(characterId) || !id(worldId))
    throw new HttpError(
      503,
      "This profile needs a new Census match before equipment can sync.",
    );
  const read = () =>
    query(
      env,
      "SELECT * FROM equipment_snapshots WHERE character_id=? AND world_id=?",
      characterId,
      worldId,
    ).first();
  let row = await read();
  const time = now();
  const due =
    !row ||
    (manual ? row.attempted_at + 300 <= time : row.next_refresh_at <= time);
  if (configured(env) && due) {
    const token = random();
    const claimed = await query(
      env,
      `INSERT INTO equipment_snapshots(character_id,world_id,attempted_at,next_refresh_at,refresh_token,refresh_until)
      VALUES (?,?,?,?,?,?) ON CONFLICT(character_id,world_id) DO UPDATE SET attempted_at=excluded.attempted_at,refresh_token=excluded.refresh_token,refresh_until=excluded.refresh_until
      WHERE equipment_snapshots.refresh_until<=? AND ${manual ? "equipment_snapshots.attempted_at+300<=?" : "equipment_snapshots.next_refresh_at<=?"}
      RETURNING character_id`,
      characterId,
      worldId,
      time,
      time + 300,
      token,
      time + 30,
      time,
      time,
    ).first();
    if (claimed) {
      const refresh = async () => {
        try {
          const items = await fetchEquipment(
            env,
            characterId,
            worldId,
            fetcher,
          );
          await query(
            env,
            `UPDATE equipment_snapshots SET items_json=?,synced_at=?,next_refresh_at=?,refresh_token=NULL,refresh_until=0,last_error=0 WHERE character_id=? AND world_id=? AND refresh_token=?`,
            JSON.stringify(items),
            now(),
            now() + 900,
            characterId,
            worldId,
            token,
          ).run();
        } catch {
          await query(
            env,
            `UPDATE equipment_snapshots SET next_refresh_at=?,refresh_token=NULL,refresh_until=0,last_error=1 WHERE character_id=? AND world_id=? AND refresh_token=?`,
            now() + 300,
            characterId,
            worldId,
            token,
          ).run();
        }
      };
      if (row?.items_json && !manual && context?.waitUntil)
        context.waitUntil(refresh());
      else await refresh();
    }
    row = await read();
  }
  return {
    characterId,
    worldId,
    items: row?.items_json
      ? JSON.parse(row.items_json).map((item) => ({
          ...item,
          ...describe(item.itemId),
          augments: item.augments.map(describe),
        }))
      : null,
    syncedAt: row?.synced_at ?? null,
    stale: !row?.synced_at || row.synced_at + 900 <= now(),
    unavailable: !configured(env) || !!row?.last_error,
    refreshing: (row?.refresh_until || 0) > now(),
    refreshAfter: Math.max(
      (row?.attempted_at || 0) + 300,
      row?.refresh_until || 0,
    ),
  };
}
