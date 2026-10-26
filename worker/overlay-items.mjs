import {
  HttpError,
  now,
  random,
  hash,
  bodyJson,
  textField,
} from "./security.mjs";
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
    ids: ids.filter((i) => !known.has(i)),
    tokenHash,
  };
}
export async function overlayItems(request, env) {
  const { p, ids } = await context(request, env);
  return {
    character: {
      id: p.character_id,
      name: p.character_name,
      worldId: p.world_id,
    },
    items: ids.slice(0, 50).map((itemId) => ({ itemId })),
  };
}
export async function submitOverlayItems(request, env) {
  const c = await context(request, env),
    b = await bodyJson(request, 32768),
    t = now();
  if (
    b.schemaVersion !== 1 ||
    b.profile !== "item-names-v1" ||
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
    return { itemId, name };
  });
  const membership = new Set(
    c.items.flatMap((i) => [i.itemId, ...(i.augments || [])]).map(id),
  );
  if (items.some((i) => !membership.has(i.itemId)))
    throw new HttpError(409, "Captured item is not in your saved equipment.");
  const capture = JSON.stringify({
    schemaVersion: 1,
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
    .filter((i) => c.ids.includes(i.itemId))
    .map((i) => ({
      evidenceId: crypto.randomUUID(),
      itemId: i.itemId,
      name: i.name,
    }));
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
      WHERE ot.token_hash=? AND ot.expires_at>? AND p.character_id=? AND p.character_name=? AND p.world_id=? AND s.synced_at>=? AND s.items_json=? AND NOT EXISTS(SELECT 1 FROM item_identifications WHERE item_id=json_extract(i.value,'$.itemId'))`,
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
        ),
        q(
          env,
          `INSERT INTO item_identifications(item_id,name,slug,notes,evidence_id)
      SELECT e.item_id,e.proposed_name,NULL,?,e.id FROM json_each(?) i
      JOIN item_evidence e ON e.id=json_extract(i.value,'$.evidenceId') WHERE e.status='approved'`,
          notes,
          candidatesJson,
        ),
        q(
          env,
          `INSERT INTO item_evidence_reviews(evidence_id,reviewer_id,decision,reason,name,slug,notes,created_at)
      SELECT e.id,e.user_id,'approved',?,e.proposed_name,NULL,?,? FROM json_each(?) i
      JOIN item_evidence e ON e.id=json_extract(i.value,'$.evidenceId')
      JOIN item_identifications m ON m.evidence_id=e.id`,
          reason,
          notes,
          t,
          candidatesJson,
        ),
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
  const submitted = results.length ? Number(results[1].meta.changes) : 0;
  return { submitted, skipped: items.length - submitted };
}
