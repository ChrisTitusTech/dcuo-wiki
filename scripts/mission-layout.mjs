// Keep imported guide layout compact while retaining source images and references.
export function missionLayout(article) {
  const sections = structuredClone(article.sections);
  const maps = new Set((article.location?.maps || []).map((m) => m.url));
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i],
      next = sections[i + 1];
    if (
      next?.table &&
      section.title === next.table.caption &&
      !section.items.length &&
      !section.table
    ) {
      next.references = [
        ...(section.references || []),
        ...(next.references || []),
      ];
      next.images = [...(section.images || []), ...(next.images || [])];
      sections.splice(i, 1);
      i--;
      continue;
    }
  }
  return sections
    .map((s) => {
      if (s.title === "Source overview") s.title = "Overview";
      if (s.table && s.title.endsWith(" - table 1")) s.title = s.table.caption;
      if (s.images?.length) {
        const captions = new Set(s.images.map((i) => i.label.trim()));
        s.items = s.items.filter((i) => !captions.has(i.trim()));
      }
      for (const key of ["images", "references"])
        if (!s[key]?.length) delete s[key];
      return s;
    })
    .filter(
      (s) =>
        !(
          /^Map$/i.test(s.title) &&
          !s.items.length &&
          !s.references?.length &&
          s.images?.length &&
          s.images.every((i) => maps.has(i.url))
        ),
    );
}
