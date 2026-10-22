// Requirement-based session planning. Scores are not measured points per minute.
const plain = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
export function featEffort(feat) {
  const text = (
    feat.requirement +
    " " +
    feat.context +
    " " +
    feat.group +
    " " +
    (feat.extra || []).join(" ")
  ).toLowerCase();
  const flags = [];
  const archived = /\(old\)|\bobsolete\b/.test(text);
  if (archived)
    flags.push("Archived source version - check the current category");
  const collection =
    /\b(?:cache|gift|trinkets?|sold|equip|obtain|mods?|mold|forge|artifact|omnipotence|uplink|henchmen|aura|material|chroma|collect|collections?|styles?|emblems?|base items?|time capsules?|broker|purchase|create|craft|fortify|research)\b/.test(
      text,
    );
  const repeat =
    /\b(?:daily|weekly|times|days|weeks|months|consecutive|win \d+|complete \d+.*(?:missions|alerts|raids|duos|races|bounties))\b/.test(
      text,
    ) ||
    /\b(?:defeat|complete|win|open|break|smash|destroy|gather|earn|find|disarm|close|disable|rescue|free|seal|spot|sight|interact|activate|perform)\s+[1-9]\d+\b/.test(
      text,
    );
  const meta = /\b(?:following feats|all.*feats|complete.*feats)\b/.test(
    feat.requirement.toLowerCase(),
  );
  const progression =
    /\b(?:reach level|rank \d+|combat rating|artifact|renown|level \d+)\b/.test(
      text,
    );
  const group =
    /\b(?:raids?|alerts?|duos?|operations?|group|team|pvp|arenas?|survival)\b/.test(
      text,
    );
  const seasonal =
    /\b(?:outsiders ops|patrol|seasonal|anniversary|winter|springtime|witching|homecoming|mxyzptlk|valentine)\b/.test(
      text,
    );
  const random = /\b(?:random|drop|broker|collection|time capsule)\b/.test(
    text,
  );
  if (collection) flags.push("Items / currency preparation");
  if (repeat) flags.push("Repeat counter / schedule");
  if (meta) flags.push("Complete prerequisite feats");
  if (progression) flags.push("Progression prerequisite");
  if (group) flags.push("Group / instance conditions");
  if (seasonal) flags.push("Check event availability");
  if (random) flags.push("Drops / market / collection availability");
  if (/without|never|do not|under \d+.*(?:minutes?|seconds?)/.test(text))
    flags.push("Read failure / timer conditions before starting");
  const quickAction =
    /^(?:visit|explore|find|locate|enter|interact|activate|perform)\b/i.test(
      feat.requirement,
    );
  const quick =
    quickAction &&
    feat.difficulty.level <= 2 &&
    feat.points !== null &&
    !collection &&
    !repeat &&
    !meta &&
    !progression &&
    !group &&
    !seasonal &&
    !random &&
    !/\(old\)|\bobsolete\b/.test(text);
  const burden =
    1 +
    (collection ? 2 : 0) +
    (repeat ? 3 : 0) +
    (meta ? 2 : 0) +
    (progression ? 2 : 0) +
    (random ? 2 : 0) +
    (seasonal ? 1 : 0);
  return {
    quick,
    archived,
    flags,
    priority: archived
      ? 0
      : (feat.points || 0) / (feat.difficulty.level * burden),
    lane: quick
      ? "Quick objective"
      : repeat
        ? "Build counters alongside other goals"
        : collection
          ? "Prepare items and currency first"
          : meta || progression
            ? "Check prerequisites first"
            : group
              ? "Coordinate the instance attempt"
              : "Read the objective before travelling",
  };
}
export function primaryFeatGuide(feat) {
  const candidates = (feat.guides || []).filter((g) =>
    ["Quests", "Instances"].includes(g.category),
  );
  return (
    candidates.find((g) => plain(feat.requirement).includes(plain(g.title))) ||
    candidates[0] ||
    null
  );
}
export function planningBundle(feat) {
  if (feat.bundle) return feat.bundle;
  const guide = primaryFeatGuide(feat);
  return guide
    ? {
        key: guide.href,
        title: guide.title,
        href: guide.href,
        kind: "Related mission / instance",
      }
    : {
        key: feat.group,
        title: feat.group,
        href: feat.href,
        kind: "Same content category",
      };
}
export function featSession(feats) {
  const seen = new Set();
  const entries = feats.filter((f) => {
    const key = plain(f.title) + "|" + plain(f.requirement);
    if (seen.has(key) || f.effort?.archived) return false;
    seen.add(key);
    return true;
  });
  const points = entries.reduce((sum, f) => sum + (f.points || 0), 0);
  const bundles = [
    ...Map.groupBy(entries, (f) => planningBundle(f).key).values(),
  ].map((rows) => ({
    ...planningBundle(rows[0]),
    feats: rows,
    points: rows.reduce((n, f) => n + (f.points || 0), 0),
  }));
  return {
    points,
    skillPoints: Math.floor(points / 100),
    remainder: points % 100,
    bundles,
  };
}
