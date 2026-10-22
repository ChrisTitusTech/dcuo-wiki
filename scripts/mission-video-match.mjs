// Neutral titles may support either variant; explicit opposing factions may not.
export function hasFactionConflict(missionTitle, videoTitle) {
  const variant = missionTitle.match(
    /\((hero(?:es)?|villains?)(?: mission)?\)$/i,
  )?.[1];
  if (!variant) return false;
  const hero = /\bhero(?:es)?\b/i.test(videoTitle);
  const villain = /\bvillains?\b/i.test(videoTitle);
  return /^hero/i.test(variant) ? villain && !hero : hero && !villain;
}
