import currencies from "../src/data/currencies.json" with { type: "json" };
import context from "../src/data/reward-context.json" with { type: "json" };
import { mediaAsset } from "./media.mjs";
const escape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const aliases = new Map(
  currencies.flatMap((c) => c.aliases.map((a) => [a.toLowerCase(), c])),
);
const pattern = new RegExp(
  "(?<![\\w])(" +
    [...aliases.keys()]
      .sort((a, b) => b.length - a.length)
      .map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|") +
    ")(?![\\w])",
  "gi",
);
export function renderCurrencyText(text) {
  text = text.replace(/\$([\d,]+(?:\.\d+)?)/g, (match, amount, offset) =>
    /^\s*cash\b/i.test(text.slice(offset + match.length))
      ? match
      : amount + " Cash",
  );
  let html = "",
    cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const currency = aliases.get(match[0].toLowerCase()),
      asset = currency.sourcePage && mediaAsset(currency.sourcePage);
    html += escape(text.slice(cursor, match.index));
    html +=
      '<span class="reward-currency"' +
      (currency.retired
        ? ' title="Historical currency listed in the source; retained without converting its amount."'
        : "") +
      ">" +
      escape(match[0]) +
      (asset
        ? '<img src="' +
          escape(asset.preview) +
          '" width="24" height="24" alt="" aria-hidden="true" loading="lazy" decoding="async">'
        : "") +
      "</span>";
    cursor = match.index + match[0].length;
  }
  return html + escape(text.slice(cursor));
}
export function rewardContext(slug, part, value) {
  const found = context[slug]?.[part.id];
  return found?.base === value ? found : null;
}
export function isRewardPart(part, slug) {
  return (
    Boolean(context[slug]?.[part.id]) ||
    /rewards?|results?|loot|drops?/i.test(part.title || part.caption || "") ||
    part.columns?.some((c) => /rewards?|currency|cash|marks/i.test(c))
  );
}
