// Track every source heading, including empty level parents omitted by the renderer.
export function storyHeadingContext() {
  let parent = "",
    parentDepth = 0;
  return (title, depth) => {
    if (/^(?:Level\s*\d|Episode\s*\d)/i.test(title)) {
      parent = title;
      parentDepth = depth;
      return title;
    }
    if (parent && depth <= parentDepth) {
      parent = "";
      parentDepth = 0;
    }
    return parent &&
      depth > parentDepth &&
      /^(?:Main Quests|Side Quests|Miscellaneous Quests|Instances)$/i.test(
        title,
      )
      ? parent + " - " + title
      : title;
  };
}
