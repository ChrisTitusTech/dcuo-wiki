import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { gfm } from "micromark-extension-gfm";

// Firecrawl puts side-by-side faction paths inside layout tables. Recover the
// cells before conversion so headings, links and numbered steps stay together.
export function storyMarkdown(markdown) {
  const tree = fromMarkdown(markdown, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });
  const replacements = tree.children.filter(
    (n) =>
      n.type === "table" &&
      n.children[0].children.every((c) => !c.children.length),
  );
  for (const table of replacements.reverse()) {
    const cells = table.children.slice(1).flatMap((row) =>
      markdown
        .slice(row.position.start.offset, row.position.end.offset)
        .trim()
        .replace(/^\||\|$/g, "")
        .split(/(?<!\\)\|/),
    );
    const blocks = cells.map((cell) =>
      cell
        .trim()
        .replace(/<br\s*\/?\s*>/gi, "\n\n")
        .replace(/^(Heroes|Villains)\s*$/gm, "##### For $1")
        .replace(
          /\*\*(Main Missions|Side Missions|Featured Bounty)\*\*[ \t]*(?=\n|$)/gm,
          "\n\n###### $1",
        )
        // Shared collectibles are episode-level siblings of the faction paths.
        .replace(
          /\*\*(Featured Briefings|Featured Investigations?)\*\*[ \t]*(?=\n|$)/gm,
          "\n\n### $1",
        )
        // These numbers align optional side missions with the main quest steps.
        // Keep source numbers, including gaps, rather than renumbering the list.
        .replace(/^(\d+)\. /gm, "$1\\. "),
    );
    markdown =
      markdown.slice(0, table.position.start.offset) +
      blocks.join("\n\n") +
      markdown.slice(table.position.end.offset);
  }
  return markdown;
}

// Track empty parents too: rendering omits headings without their own text.
export function storyHeadingContext() {
  const stack = [];
  return (title, depth) => {
    while (stack.length && stack.at(-1).depth >= depth) stack.pop();
    const branch =
      /^(?:For Heroes|For Villains|Hero Missions|Villain Missions|Missions|Main Missions|Side Missions|Featured Bounty|Featured Briefings|Featured Investigations?)$/i.test(
        title,
      );
    const mentor =
      /^(?:Main Quests|Side Quests|Miscellaneous Quests|Instances)$/i.test(
        title,
      );
    const ancestors = branch
      ? stack.map((h) => h.title)
      : mentor
        ? stack
            .filter((h) => /^(?:Level\s*\d|Episode\s*\d)/i.test(h.title))
            .map((h) => h.title)
        : [];
    const missionRoot = ancestors.findIndex((t) =>
      /^(?:Story|Chapter) Missions$/.test(t),
    );
    if (missionRoot > 0) ancestors.splice(0, missionRoot);
    stack.push({ title, depth });
    return [...ancestors, title].join(" - ");
  };
}
