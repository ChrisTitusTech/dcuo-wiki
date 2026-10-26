import { HttpError, now, bodyJson, textField, imageType } from "./security.mjs";
import { itemId, itemIdentities, sourceItems } from "./item-identities.mjs";
import { findArticle } from "./articles.mjs";
const q = (env, sql, ...args) => env.DB.prepare(sql).bind(...args);
const uuid = (value) =>
  typeof value === "string" && /^[a-f0-9-]{36}$/.test(value);
export async function unidentifiedItems(env, after = "") {
  if (after && !itemId(after))
    throw new HttpError(400, "Invalid queue cursor.");
  // Derive observations from saved snapshots, including augments, without publishing player identities.
  const { results } = await q(
    env,
    `WITH observed AS (
    SELECT s.character_id,s.world_id,s.synced_at,json_extract(i.value,'$.itemId') AS item_id
    FROM equipment_snapshots s,json_each(s.items_json) i WHERE s.items_json IS NOT NULL
    UNION
    SELECT s.character_id,s.world_id,s.synced_at,a.value AS item_id
    FROM equipment_snapshots s,json_each(s.items_json) i,json_each(i.value,'$.augments') a WHERE s.items_json IS NOT NULL
  ) SELECT item_id,COUNT(*) AS characters,MAX(synced_at) AS lastSeen,
    (SELECT COUNT(*) FROM item_evidence e WHERE e.item_id=observed.item_id AND e.status='pending') AS pending
    FROM observed WHERE item_id>? GROUP BY item_id ORDER BY item_id LIMIT 200`,
    after,
  ).all();
  const identities = await itemIdentities(
    env,
    results.map((row) => row.item_id),
  );
  return {
    items: results.filter(
      (row) => itemId(row.item_id) && !identities.has(row.item_id),
    ),
    next: results.length === 200 ? results.at(-1).item_id : null,
  };
}
export async function submitItemEvidence(request, env, user) {
  const body = await bodyJson(request, 370000);
  if (!itemId(body.itemId))
    throw new HttpError(400, "Choose a Census item ID.");
  const name = textField(body.name, "Item name", 2, 160);
  const evidence = textField(body.evidence, "Evidence", 30, 4000);
  const p = await q(
    env,
    "SELECT * FROM profiles WHERE user_id=?",
    user.id,
  ).first();
  if (!p) throw new HttpError(403, "Match your character in Census first.");
  const snapshot = await q(
    env,
    "SELECT items_json,synced_at FROM equipment_snapshots WHERE character_id=? AND world_id=?",
    p.character_id,
    p.world_id,
  ).first();
  if (!snapshot?.synced_at || snapshot.synced_at < now() - 86400)
    throw new HttpError(
      409,
      "Refresh your equipment before submitting evidence. The snapshot must be less than a day old.",
    );
  const items = JSON.parse(snapshot.items_json || "[]");
  if (
    !items.some(
      (item) =>
        item.itemId === body.itemId || item.augments?.includes(body.itemId),
    )
  )
    throw new HttpError(
      409,
      "This item is not in your linked character's saved equipment. Refresh equipment and try again.",
    );
  if ((await itemIdentities(env, [body.itemId])).has(body.itemId))
    throw new HttpError(409, "This item already has a verified name.");
  if (
    typeof body.image !== "string" ||
    body.image.length > 349528 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(body.image)
  )
    throw new HttpError(400, "Include a tooltip screenshot up to 256 KB.");
  let bytes;
  try {
    bytes = Uint8Array.from(atob(body.image), (c) => c.charCodeAt(0));
  } catch {
    throw new HttpError(400, "Invalid screenshot.");
  }
  if (bytes.length > 256 * 1024)
    throw new HttpError(413, "Screenshot is too large.");
  const type = imageType(bytes),
    id = crypto.randomUUID();
  const inserted = await q(
    env,
    `INSERT INTO item_evidence(id,user_id,character_id,character_name,world_id,item_id,proposed_name,evidence,snapshot_json,synced_at,screenshot,screenshot_type,created_at)
    SELECT ?,user_id,character_id,character_name,world_id,?,?,?,?,?,?,?,? FROM profiles
    WHERE user_id=? AND character_id=? AND world_id=? ON CONFLICT DO NOTHING RETURNING id`,
    id,
    body.itemId,
    name,
    evidence,
    JSON.stringify(items),
    snapshot.synced_at,
    bytes.buffer,
    type,
    now(),
    user.id,
    p.character_id,
    p.world_id,
  ).first();
  if (!inserted)
    throw new HttpError(
      409,
      "A pending submission already exists, or your linked character changed. Reload and try again.",
    );
  return { id, status: "pending" };
}
export async function listItemEvidence(
  env,
  user,
  { moderator = false, status = "pending", before = "" } = {},
) {
  if (!["pending", "approved", "rejected", "revoked"].includes(status))
    throw new HttpError(400, "Invalid review status.");
  if (before && !/^\d{1,12}:[a-f0-9-]{36}$/.test(before))
    throw new HttpError(400, "Invalid evidence cursor.");
  const [timestamp, cursor] = before
    ? before.split(":")
    : ["999999999999", "ffffffff-ffff-ffff-ffff-ffffffffffff"];
  const { results } = await q(
    env,
    `SELECT e.id,e.item_id,e.proposed_name,e.character_name,e.world_id,e.evidence,e.synced_at,e.created_at,e.status,e.review_reason,e.source,e.capture_json,(length(e.screenshot)>0) AS hasScreenshot,
    m.name,m.slug,m.notes ${moderator ? ",e.snapshot_json" : ""},
    (SELECT json_group_array(json_object('decision',r.decision,'reason',r.reason,'name',r.name,'slug',r.slug,'notes',r.notes,'createdAt',r.created_at)) FROM (SELECT * FROM item_evidence_reviews WHERE evidence_id=e.id ORDER BY id) r) AS history_json
    FROM item_evidence e LEFT JOIN item_identifications m ON m.evidence_id=e.id
    WHERE ${moderator ? "e.status=?" : "e.user_id=?"} AND (e.created_at<? OR (e.created_at=? AND e.id<?)) ORDER BY e.created_at DESC,e.id DESC LIMIT 51`,
    moderator ? status : user.id,
    Number(timestamp),
    Number(timestamp),
    cursor,
  ).all();
  const submissions = results.slice(0, 50).map((row) => ({
      ...row,
      hasScreenshot: Boolean(row.hasScreenshot),
      capture: row.capture_json ? JSON.parse(row.capture_json) : null,
    })),
    last = submissions.at(-1);
  return {
    submissions,
    next: results.length > 50 ? `${last.created_at}:${last.id}` : null,
  };
}
export async function evidenceImage(env, user, id, moderator) {
  if (!uuid(id)) throw new HttpError(404, "Evidence image not found.");
  const row = await q(
    env,
    "SELECT screenshot,screenshot_type FROM item_evidence WHERE id=? AND (user_id=? OR ?=1)",
    id,
    user.id,
    moderator ? 1 : 0,
  ).first();
  if (!row || !row.screenshot || !new Uint8Array(row.screenshot).byteLength)
    throw new HttpError(404, "Evidence image not found.");
  return new Response(new Uint8Array(row.screenshot), {
    headers: {
      "Content-Type": row.screenshot_type,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Content-Disposition": 'inline; filename="item-tooltip"',
    },
  });
}
export async function reviewItemEvidence(request, env, user) {
  const b = await bodyJson(request);
  if (!uuid(b.id) || !["approved", "rejected", "revoked"].includes(b.status))
    throw new HttpError(400, "Choose a submission and review decision.");
  const reason = textField(b.reason, "Review explanation", 10, 2000);
  if (b.status === "approved") {
    const row = await q(
      env,
      "SELECT item_id FROM item_evidence WHERE id=? AND status='pending'",
      b.id,
    ).first();
    if (!row || sourceItems.has(row.item_id))
      throw new HttpError(
        409,
        "This submission is no longer awaiting identification.",
      );
    const name = textField(b.name, "Verified name", 2, 160),
      notes = textField(b.notes ?? "", "Verified item details", 0, 2000),
      slug = textField(b.slug ?? "", "Article slug", 0, 180);
    if (slug) await findArticle(slug, env);
    // D1 batches are atomic. A competing approval cannot replace the winning identity.
    const results = await env.DB.batch([
      q(
        env,
        `INSERT INTO item_identifications(item_id,name,slug,notes,evidence_id)
        SELECT item_id,?,?,?,id FROM item_evidence WHERE id=? AND status='pending' ON CONFLICT DO NOTHING`,
        name,
        slug || null,
        notes,
        b.id,
      ),
      q(
        env,
        `INSERT INTO item_evidence_reviews(evidence_id,reviewer_id,decision,reason,name,slug,notes,created_at)
        SELECT id,?,'approved',?,?,?,?,? FROM item_evidence WHERE id=? AND status='pending' AND EXISTS(SELECT 1 FROM item_identifications WHERE evidence_id=?)`,
        user.id,
        reason,
        name,
        slug || null,
        notes,
        now(),
        b.id,
        b.id,
      ),
      q(
        env,
        `UPDATE item_evidence SET status='approved',reviewed_by=?,reviewed_at=?,review_reason=?
        WHERE id=? AND status='pending' AND EXISTS (SELECT 1 FROM item_identifications WHERE evidence_id=?)`,
        user.id,
        now(),
        reason,
        b.id,
        b.id,
      ),
    ]);
    if (results.at(-1).meta.changes !== 1)
      throw new HttpError(
        409,
        "Another decision already identified this item.",
      );
  } else if (b.status === "revoked") {
    const results = await env.DB.batch([
      q(env, "DELETE FROM item_identifications WHERE evidence_id=?", b.id),
      q(
        env,
        "INSERT INTO item_evidence_reviews(evidence_id,reviewer_id,decision,reason,created_at) SELECT id,?,'revoked',?,? FROM item_evidence WHERE id=? AND status='approved'",
        user.id,
        reason,
        now(),
        b.id,
      ),
      q(
        env,
        "UPDATE item_evidence SET status='revoked',reviewed_by=?,reviewed_at=?,review_reason=? WHERE id=? AND status='approved'",
        user.id,
        now(),
        reason,
        b.id,
      ),
    ]);
    if (results.at(-1).meta.changes !== 1)
      throw new HttpError(409, "This mapping is no longer approved.");
  } else {
    const results = await env.DB.batch([
      q(
        env,
        "INSERT INTO item_evidence_reviews(evidence_id,reviewer_id,decision,reason,created_at) SELECT id,?,'rejected',?,? FROM item_evidence WHERE id=? AND status='pending'",
        user.id,
        reason,
        now(),
        b.id,
      ),
      q(
        env,
        "UPDATE item_evidence SET status='rejected',reviewed_by=?,reviewed_at=?,review_reason=? WHERE id=? AND status='pending'",
        user.id,
        now(),
        reason,
        b.id,
      ),
    ]);
    if (results.at(-1).meta.changes !== 1)
      throw new HttpError(409, "This submission was already reviewed.");
  }
  return { ok: true };
}
