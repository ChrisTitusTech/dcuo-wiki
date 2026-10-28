import {
  HttpError,
  now,
  random,
  hash,
  bodyJson,
  textField,
} from "./security.mjs";
import { validateDetails, iconPng } from "./item-details.mjs";
import { itemIdentities } from "./item-identities.mjs";
const q = (env, sql, ...args) => env.DB.prepare(sql).bind(...args);
const id = (value) => {
  const s = typeof value === "string" ? value : "";
  return /^[1-9]\d{0,9}$/.test(s) && Number(s) <= 4294967295 ? s : null;
};
export async function createOverlayToken(env, user) {
  const token = random(),
    expiresAt = now() + 30 * 86400;
  const row = await q(
    env,
    `INSERT INTO overlay_tokens(user_id,token_hash,character_id,character_name,world_id,created_at,expires_at)
    SELECT user_id,?,character_id,character_name,world_id,?,? FROM profiles WHERE user_id=?
    ON CONFLICT(user_id) DO UPDATE SET token_hash=excluded.token_hash,character_id=excluded.character_id,character_name=excluded.character_name,world_id=excluded.world_id,created_at=excluded.created_at,expires_at=excluded.expires_at RETURNING user_id`,
    await hash(token),
    now(),
    expiresAt,
    user.id,
  ).first();
  if (!row) throw new HttpError(403, "Match your character in Census first.");
  return { token, expiresAt };
}
export async function revokeOverlayToken(env, user) {
  await q(env, "DELETE FROM overlay_tokens WHERE user_id=?", user.id).run();
  return { ok: true };
}
async function context(request, env) {
  const match = /^Bearer ([a-f0-9]{64})$/.exec(
    request.headers.get("Authorization") || "",
  );
  if (!match) throw new HttpError(401, "Enter a valid companion token.");
  const tokenHash = await hash(match[1]);
  const p = await q(
    env,
    `SELECT t.* FROM overlay_tokens t JOIN profiles p ON p.user_id=t.user_id AND p.character_id=t.character_id AND p.character_name=t.character_name AND p.world_id=t.world_id WHERE t.token_hash=? AND t.expires_at>?`,
    tokenHash,
    now(),
  ).first();
  if (!p)
    throw new HttpError(
      401,
      "Companion token expired, revoked, or character changed.",
    );
  const snapshot = await q(
    env,
    "SELECT items_json,synced_at FROM equipment_snapshots WHERE character_id=? AND world_id=?",
    p.character_id,
    p.world_id,
  ).first();
  if (!snapshot?.synced_at || snapshot.synced_at < now() - 86400)
    throw new HttpError(409, "Refresh your linked character equipment first.");
  const items = JSON.parse(snapshot.items_json || "[]");
  const ids = [
    ...new Set(
      items
        .flatMap((i) => [i.itemId, ...(i.augments || [])])
        .map(id)
        .filter(Boolean),
    ),
  ];
  const known = await itemIdentities(env, ids);
  return {
    p,
    snapshot,
    items,
    ids,
    unresolved: ids.filter((i) => !known.has(i)),
    tokenHash,
  };
}
export async function overlayItems(request, env) {
  const { p, ids } = await context(request, env);
  const params = new URL(request.url).searchParams;
  if (params.has("ids")) {
    const ids = params.get("ids").split(",");
    if (
      params.has("cursor") ||
      params.getAll("ids").length !== 1 ||
      !ids.length ||
      ids.length > 50 ||
      ids.some((value) => !id(value)) ||
      new Set(ids).size !== ids.length
    )
      throw new HttpError(
        400,
        "Provide between 1 and 50 unique item IDs without a cursor.",
      );
    const known = await itemIdentities(env, ids);
    return {
      character: {
        id: p.character_id,
        name: p.character_name,
        worldId: p.world_id,
      },
      items: ids
        .filter((itemId) => !known.has(itemId))
        .map((itemId) => ({ itemId })),
      missingOnlySupported: true,
    };
  }
  const rawCursor = params.get("cursor");
  const cursor = rawCursor === null ? 0 : id(rawCursor);
  if (cursor === null) throw new HttpError(400, "Invalid equipment cursor.");
  const remaining = ids
    .filter((i) => Number(i) > Number(cursor))
    .sort((a, b) => Number(a) - Number(b));
  const page = remaining.slice(0, 50);
  return {
    character: {
      id: p.character_id,
      name: p.character_name,
      worldId: p.world_id,
    },
    items: page.map((itemId) => ({ itemId })),
    missingOnlySupported: true,
    ...(remaining.length > 50 ? { nextCursor: page.at(-1) } : {}),
  };
}
export async function submitOverlayItems(request, env) {
  const c = await context(request, env),
    b = await bodyJson(request, 4 * 1024 * 1024),
    t = now();
  if (
    !(
      (b.schemaVersion === 1 && b.profile === "item-names-v1") ||
      (b.schemaVersion === 2 && b.profile === "item-details-v1")
    ) ||
    typeof b.build !== "string" ||
    !/^[a-f0-9]{64}$/.test(b.build) ||
    !Number.isSafeInteger(b.capturedAt) ||
    b.capturedAt < t - 86400 ||
    b.capturedAt > t + 300
  )
    throw new HttpError(400, "Invalid companion capture metadata.");
  if (
    !b.character ||
    b.character.id !== c.p.character_id ||
    b.character.worldId !== c.p.world_id ||
    typeof b.character.name !== "string" ||
    b.character.name.toLowerCase() !== c.p.character_name.toLowerCase()
  )
    throw new HttpError(409, "Capture does not match your linked character.");
  if (!Array.isArray(b.items) || !b.items.length || b.items.length > 50)
    throw new HttpError(400, "Submit between 1 and 50 unique items.");
  const seen = new Set();
  const items = b.items.map((i) => {
    const itemId = i && id(i.itemId);
    if (!itemId || seen.has(itemId))
      throw new HttpError(400, "Submit valid unique item IDs.");
    seen.add(itemId);
    const name = textField(i.name, "Item name", 2, 160);
    if (/[\u0000-\u001f\u007f]/.test(name))
      throw new HttpError(400, "Invalid item name.");
    return {
      itemId,
      name,
      ...(b.schemaVersion === 2
        ? { details: validateDetails(i.details), iconPng: i.details.iconPng }
        : {}),
    };
  });
  const membership = new Set(
    c.items.flatMap((i) => [i.itemId, ...(i.augments || [])]).map(id),
  );
  const catalog = b.schemaVersion === 2 && b.scope === "catalog";
  if (
    (b.missingOnly !== undefined && typeof b.missingOnly !== "boolean") ||
    (b.missingOnly === true && !catalog)
  )
    throw new HttpError(
      400,
      "Missing-only publication requires a version 2 catalog capture.",
    );
  const missingOnly = b.missingOnly === true;
  const known = missingOnly
    ? await itemIdentities(
        env,
        items.map((i) => i.itemId),
      )
    : null;
  if (b.scope !== undefined && !["equipment", "catalog"].includes(b.scope))
    throw new HttpError(400, "Invalid capture scope.");
  if (!catalog && items.some((i) => !membership.has(i.itemId)))
    throw new HttpError(409, "Captured item is not in your saved equipment.");
  if (
    catalog &&
    items.some(
      (i) =>
        !(
          i.details.description ||
          i.details.style ||
          i.details.iconResource ||
          i.details.requiredLevel > 0 ||
          i.details.requiredCombatRating > 0
        ),
    )
  )
    throw new HttpError(400, "Catalog items need substantive captured data.");
  const equipped =
    b.schemaVersion === 2
      ? validateEquipped(
          b.equipped || [],
          c.items,
          new Set(items.map((i) => i.itemId)),
        )
      : [];
  const capture = JSON.stringify({
    schemaVersion: b.schemaVersion,
    scope: catalog ? "catalog" : "equipment",
    character: {
      id: c.p.character_id,
      name: c.p.character_name,
      worldId: c.p.world_id,
    },
    build: b.build,
    profile: b.profile,
    capturedAt: b.capturedAt,
  });
  // Every publication and its evidence/audit records commit in one transaction.
  // The initial insert rechecks the token, linked profile and unchanged equipment.
  // Approved companion evidence is separate from existing tooltip submissions,
  // preserving their screenshots and original provenance.
  const reason =
    "Direct companion publication by the linked account; not moderator verified.";
  const notes =
    "Identified from an in-game item definition using DCUO Companion.";
  const candidates = items
    .filter((i) =>
      missingOnly
        ? !known.has(i.itemId)
        : b.schemaVersion === 2 || c.unresolved.includes(i.itemId),
    )
    .map((i) => ({
      evidenceId: crypto.randomUUID(),
      itemId: i.itemId,
      name: i.name,
      ...(i.details ? { details: i.details } : {}),
    }));
  for (const candidate of candidates) {
    const item = items.find((i) => i.itemId === candidate.itemId);
    if (item.iconPng !== undefined)
      candidate.details.icon = await iconPng(
        env,
        item.iconPng,
        item.details.iconResource,
      );
  }
  const candidatesJson = JSON.stringify(candidates);
  // Three bounded statements keep a full 50-item publication within D1 query budgets.
  const results = candidates.length
    ? await env.DB.batch([
        q(
          env,
          `INSERT INTO item_evidence(id,user_id,character_id,character_name,world_id,item_id,proposed_name,evidence,snapshot_json,synced_at,screenshot,screenshot_type,created_at,source,capture_json,status,reviewed_by,reviewed_at,review_reason)
      SELECT json_extract(i.value,'$.evidenceId'),p.user_id,p.character_id,p.character_name,p.world_id,json_extract(i.value,'$.itemId'),json_extract(i.value,'$.name'),?,s.items_json,s.synced_at,?,'',?,'companion',?,'approved',p.user_id,?,? FROM profiles p
      JOIN overlay_tokens ot ON ot.user_id=p.user_id AND ot.character_id=p.character_id AND ot.character_name=p.character_name AND ot.world_id=p.world_id
      JOIN equipment_snapshots s ON s.character_id=p.character_id AND s.world_id=p.world_id
      CROSS JOIN json_each(?) i
      WHERE ot.token_hash=? AND ot.expires_at>? AND p.character_id=? AND p.character_name=? AND p.world_id=? AND s.synced_at>=? AND s.items_json=? ${b.schemaVersion === 2 && !missingOnly ? "AND NOT EXISTS(SELECT 1 FROM item_details d JOIN json_each(?) x ON d.item_id=json_extract(x.value,'$.itemId') WHERE d.captured_at>?)" : ""} ${missingOnly ? "AND NOT EXISTS(SELECT 1 FROM item_identifications WHERE item_id=json_extract(i.value,'$.itemId')) AND NOT EXISTS(SELECT 1 FROM item_details WHERE item_id=json_extract(i.value,'$.itemId'))" : ""} ${b.schemaVersion === 1 ? "AND NOT EXISTS(SELECT 1 FROM item_identifications WHERE item_id=json_extract(i.value,'$.itemId'))" : ""}`,
          reason,
          new Uint8Array(0).buffer,
          t,
          capture,
          t,
          reason,
          candidatesJson,
          c.tokenHash,
          now(),
          c.p.character_id,
          c.p.character_name,
          c.p.world_id,
          now() - 86400,
          c.snapshot.items_json,
          ...(b.schemaVersion === 2 && !missingOnly
            ? [candidatesJson, b.capturedAt]
            : []),
        ),
        q(
          env,
          `INSERT INTO item_identifications(item_id,name,slug,notes,evidence_id)
      SELECT e.item_id,e.proposed_name,NULL,?,e.id FROM json_each(?) i
      JOIN item_evidence e ON e.id=json_extract(i.value,'$.evidenceId') WHERE e.status='approved'
      ON CONFLICT(item_id) ${b.schemaVersion === 2 ? "DO UPDATE SET name=excluded.name,notes=excluded.notes,evidence_id=excluded.evidence_id" : "DO NOTHING"}`,
          notes,
          candidatesJson,
        ),
        q(
          env,
          `INSERT INTO item_evidence_reviews(evidence_id,reviewer_id,decision,reason,name,slug,notes,created_at)
      SELECT e.id,e.user_id,'approved',?,e.proposed_name,NULL,?,? FROM json_each(?) i
      JOIN item_evidence e ON e.id=json_extract(i.value,'$.evidenceId')
      WHERE e.status='approved'`,
          reason,
          notes,
          t,
          candidatesJson,
        ),
        ...(b.schemaVersion === 2
          ? [
              q(
                env,
                `INSERT INTO item_details(item_id,details_json,evidence_id,captured_at,updated_at)
          SELECT e.item_id,json_extract(i.value,'$.details'),e.id,?,? FROM json_each(?) i
          JOIN item_evidence e ON e.id=json_extract(i.value,'$.evidenceId') WHERE e.status='approved'
          ON CONFLICT(item_id) DO UPDATE SET details_json=CASE WHEN json_extract(excluded.details_json,'$.icon') IS NULL AND json_extract(item_details.details_json,'$.iconResource')=json_extract(excluded.details_json,'$.iconResource') THEN json_patch(excluded.details_json,json_object('icon',json_extract(item_details.details_json,'$.icon'))) ELSE excluded.details_json END,evidence_id=excluded.evidence_id,captured_at=excluded.captured_at,updated_at=excluded.updated_at
          WHERE excluded.captured_at>=item_details.captured_at`,
                b.capturedAt,
                t,
                candidatesJson,
              ),
              q(
                env,
                `INSERT INTO equipment_item_details(character_id,world_id,slot,item_id,details_json,evidence_id,captured_at)
          SELECT e.character_id,e.world_id,json_extract(x.value,'$.slot'),e.item_id,json_extract(x.value,'$.details'),e.id,?
          FROM json_each(?) x JOIN json_each(?) i ON json_extract(i.value,'$.itemId')=json_extract(x.value,'$.itemId')
          JOIN item_evidence e ON e.id=json_extract(i.value,'$.evidenceId') WHERE e.status='approved'
          ON CONFLICT(character_id,world_id,slot) DO UPDATE SET item_id=excluded.item_id,details_json=excluded.details_json,evidence_id=excluded.evidence_id,captured_at=excluded.captured_at
          WHERE excluded.captured_at>=equipment_item_details.captured_at`,
                b.capturedAt,
                JSON.stringify(equipped),
                candidatesJson,
              ),
            ]
          : []),
      ])
    : [];
  await context(request, env);
  const published = await itemIdentities(
    env,
    items.map((i) => i.itemId),
  );
  if (items.some((i) => !published.has(i.itemId)))
    throw new HttpError(
      409,
      "Equipment changed during publication. Refresh equipment and retry the capture.",
    );
  let saved;
  if (b.schemaVersion === 2) {
    const rows = await q(
      env,
      `SELECT evidence_id FROM item_details WHERE evidence_id IN (SELECT json_extract(value,'$.evidenceId') FROM json_each(?))`,
      candidatesJson,
    ).all();
    saved = new Set(rows.results.map((r) => r.evidence_id));
    if (!missingOnly && candidates.some((i) => !saved.has(i.evidenceId)))
      throw new HttpError(
        409,
        "A newer capture or changed equipment prevented publication. Refresh and capture again.",
      );
  }
  const submitted = results.length
    ? Number(results[b.schemaVersion === 2 ? 3 : 1].meta.changes)
    : 0;
  return {
    submitted,
    skipped: items.length - submitted,
    ...(missingOnly ? { missingOnlySupported: true } : {}),
    ...(b.schemaVersion === 2
      ? {
          iconsUploaded: items.filter(
            (i) =>
              (!missingOnly ||
                candidates.some(
                  (c) => c.itemId === i.itemId && saved.has(c.evidenceId),
                )) &&
              i.iconPng !== undefined,
          ).length,
          iconsMissing: items.filter(
            (i) =>
              (!missingOnly ||
                candidates.some(
                  (c) => c.itemId === i.itemId && saved.has(c.evidenceId),
                )) &&
              i.details.iconResource &&
              i.iconPng === undefined,
          ).length,
        }
      : {}),
  };
}

function validateEquipped(rows, snapshot, definitions) {
  if (!Array.isArray(rows) || rows.length > 64)
    throw new HttpError(400, "Invalid equipped item capture.");
  const seen = new Set();
  return rows.map((row) => {
    if (
      !row ||
      typeof row.slot !== "string" ||
      !/^\d{1,2}$/.test(row.slot) ||
      Number(row.slot) >= 64 ||
      seen.has(row.slot) ||
      !definitions.has(row.itemId)
    )
      throw new HttpError(400, "Invalid equipped item slot.");
    seen.add(row.slot);
    if (!snapshot.some((i) => i.slot === row.slot && i.itemId === row.itemId))
      throw new HttpError(
        409,
        "Equipped capture no longer matches Census. Refresh equipment.",
      );
    const details = {};
    if (row.itemLevel !== undefined) {
      if (
        !Number.isSafeInteger(row.itemLevel) ||
        row.itemLevel < 0 ||
        row.itemLevel > 10000
      )
        throw new HttpError(400, "Invalid equipped item level.");
      details.itemLevel = row.itemLevel;
    }
    if (row.effects !== undefined) {
      if (
        !Array.isArray(row.effects) ||
        row.effects.length > 128 ||
        row.effects.some(
          (t) =>
            typeof t !== "string" ||
            !t.trim() ||
            t.length > 1024 ||
            /[\u0000-\u001f\u007f]/.test(t),
        )
      )
        throw new HttpError(400, "Invalid equipped item effects.");
      if (row.effects.length) details.effects = row.effects;
    }
    if (row.baseStats !== undefined) {
      if (
        !Array.isArray(row.baseStats) ||
        row.baseStats.length > 32 ||
        row.baseStats.some(
          (s) =>
            !s ||
            typeof s.name !== "string" ||
            !s.name.trim() ||
            s.name.length > 128 ||
            /[\u0000-\u001f\u007f]/.test(s.name) ||
            !Number.isSafeInteger(s.value) ||
            s.value < 0 ||
            s.value > 4294967295,
        )
      )
        throw new HttpError(400, "Invalid equipped base stats.");
      if (row.baseStats.length) details.baseStats = row.baseStats;
    }
    return { slot: row.slot, itemId: row.itemId, details };
  });
}
