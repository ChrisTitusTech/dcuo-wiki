import catalog from "../../data/feats.json";
// Keep the search payload smaller than the full editable articles and source manifest.
export function GET() {
  return new Response(
    JSON.stringify(
      catalog.feats.map((f) => ({
        id: f.id,
        title: f.title,
        requirement: f.requirement,
        points: f.points,
        reward: f.reward,
        group: f.group,
        context: f.context,
        href: f.detailHref || f.href,
        releases: f.releases,
        difficulty: f.difficulty,
        effort: f.effort,
        bundle: f.bundle,
        videos: f.videos || [],
      })),
    ),
    { headers: { "Content-Type": "application/json; charset=utf-8" } },
  );
}
