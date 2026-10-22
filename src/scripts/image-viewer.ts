export {};
const dialog = document.querySelector<HTMLDialogElement>("#image-viewer")!;
const image = document.querySelector<HTMLImageElement>("#viewer-image")!;
const caption = document.querySelector<HTMLElement>("#viewer-caption")!;
const count = document.querySelector<HTMLElement>("#viewer-count")!;
const previous = document.querySelector<HTMLButtonElement>("#viewer-previous")!;
const next = document.querySelector<HTMLButtonElement>("#viewer-next")!;
const close = document.querySelector<HTMLButtonElement>("#viewer-close")!;
const error = document.querySelector<HTMLElement>("#viewer-error")!;
type Picture = { url: string; label: string };
let pictures: Picture[] = [];
let index = 0;
let trigger: HTMLElement | null = null;
function show(position: number) {
  index = (position + pictures.length) % pictures.length;
  const picture = pictures[index];
  error.hidden = true;
  image.hidden = false;
  image.alt = picture.label;
  image.src = picture.url;
  caption.textContent = picture.label;
  count.textContent = `${index + 1} / ${pictures.length}`;
  previous.hidden = next.hidden = pictures.length < 2;
}
document.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;
  const link = event.target.closest<HTMLAnchorElement>("a[data-image-viewer]");
  if (
    !link ||
    event.button !== 0 ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    event.altKey
  )
    return;
  const galleryRoot =
    link.closest("#article-preview, #published-preview, #article-body") ||
    document;
  const figures = [
    ...galleryRoot.querySelectorAll<HTMLElement>(".map-gallery figure"),
  ];
  const entries = figures.flatMap((figure) => {
    const anchor = figure.querySelector<HTMLAnchorElement>(
      "a[data-image-viewer]",
    );
    const thumbnail = figure.querySelector<HTMLImageElement>("img");
    return anchor && thumbnail
      ? [{ figure, url: anchor.href, label: thumbnail.alt }]
      : [];
  });
  const selected = entries.findIndex((entry) => entry.figure.contains(link));
  if (selected < 0) return;
  event.preventDefault();
  trigger = link;
  pictures = entries;
  show(selected);
  dialog.showModal();
  document.documentElement.classList.add("image-viewer-open");
  close.focus({ preventScroll: true });
});
previous.addEventListener("click", () => show(index - 1));
next.addEventListener("click", () => show(index + 1));
close.addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  if (!target.closest("button, img")) dialog.close();
});
dialog.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault();
    if (pictures.length > 1)
      show(index + (event.key === "ArrowRight" ? 1 : -1));
  }
});
dialog.addEventListener("close", () => {
  document.documentElement.classList.remove("image-viewer-open");
  image.removeAttribute("src");
  if (trigger?.isConnected) trigger.focus({ preventScroll: true });
});
image.addEventListener("error", () => {
  if (!dialog.open) return;
  error.hidden = false;
  image.hidden = true;
});
