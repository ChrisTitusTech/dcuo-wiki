// The five-bar editorial meter is deliberately independent of DCUO reward stars.
const escape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function difficultyMeter(level, label) {
  if (!Number.isInteger(level) || level < 1 || level > 5)
    throw Error("Invalid difficulty level");
  return `<span class="difficulty-meter" role="meter" aria-label="Estimated difficulty" aria-valuemin="1" aria-valuemax="5" aria-valuenow="${level}" aria-valuetext="${escape(label)} (${level} of 5)">${[1, 2, 3, 4, 5].map((i) => `<span aria-hidden="true" class="${i <= level ? "filled" : ""}"></span>`).join("")}</span>`;
}
export function renderFeatText(value) {
  const match =
    /^Difficulty estimate: ([1-5])\/5 \((Simple|Routine|Demanding|Hard|Extreme)\) - (.+)$/.exec(
      value,
    );
  return match
    ? difficultyMeter(Number(match[1]), match[2]) + " " + escape(value)
    : escape(value);
}
