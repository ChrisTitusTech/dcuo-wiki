import { HttpError, characterName } from "./security.mjs";
export async function census(env, query, fetcher = fetch) {
  if (
    !env.CENSUS_SERVICE_ID ||
    !/^[a-zA-Z0-9]+$/.test(env.CENSUS_SERVICE_ID) ||
    env.CENSUS_SERVICE_ID === "example"
  )
    throw new HttpError(503, "Character matching is awaiting activation.");
  const url = new URL(
    `https://census.daybreakgames.com/s:${env.CENSUS_SERVICE_ID}/get/dcuo:v1/character/`,
  );
  for (const [key, value] of Object.entries(query))
    url.searchParams.set(key, value);
  url.searchParams.set("c:limit", "20");
  url.searchParams.set(
    "c:show",
    "character_id,name,world_id,level,combat_rating,skill_points,power_type_id,movement_mode_id,deleted",
  );
  let response, data;
  try {
    response = await fetcher(url, { signal: AbortSignal.timeout(10000) });
    data = await response.json();
  } catch {
    throw new HttpError(
      503,
      "Daybreak Census is unavailable. Please try again later.",
    );
  }
  if (!response.ok || data.error || !Array.isArray(data.character_list))
    throw new HttpError(
      503,
      "Daybreak Census is unavailable. Please try again later.",
    );
  return data.character_list
    .filter(
      (c) =>
        /^\d+$/.test(c.character_id) &&
        /^\d+$/.test(c.world_id) &&
        typeof c.name === "string" &&
        c.deleted === "false",
    )
    .map((c) => ({
      character_id: c.character_id,
      name: c.name,
      world_id: c.world_id,
      level: String(c.level || ""),
      combat_rating: String(c.combat_rating || ""),
      skill_points: String(c.skill_points || ""),
    }));
}
export async function searchCharacters(env, name, fetcher) {
  name = characterName(name);
  const list = await census(env, { name, "c:case": "false" }, fetcher);
  return list.filter((c) => c.name.toLowerCase() === name.toLowerCase());
}
export async function matchCharacter(env, id, name, fetcher) {
  if (typeof id !== "string" || !/^\d{1,30}$/.test(id))
    throw new HttpError(400, "Choose a character from Census.");
  name = characterName(name);
  const list = await census(env, { character_id: id }, fetcher);
  const character = list.find(
    (c) => c.character_id === id && c.name.toLowerCase() === name.toLowerCase(),
  );
  if (!character)
    throw new HttpError(
      403,
      "No matching active character was found in Census. Search again before contributing.",
    );
  return character;
}
