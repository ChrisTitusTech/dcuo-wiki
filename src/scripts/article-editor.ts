export {};
const root = document.querySelector<HTMLDialogElement>("#article-editor")!;
let controller: Awaited<
  ReturnType<typeof import("./rich-editor").createArticleEditor>
>;
let initialization: Promise<typeof controller> | undefined;
function load() {
  return (initialization ||= import("./rich-editor")
    .then((module) => module.createArticleEditor(root))
    .then((value) => (controller = value))
    .catch((error) => {
      initialization = undefined;
      document.querySelector("#edit-status")!.textContent =
        `The editor could not load: ${error.message}. Close it and try again.`;
      throw error;
    }));
}
async function open(part?: string) {
  if (!root.open) root.showModal();
  try {
    (await load()).focus(part);
  } catch {}
}
document
  .querySelectorAll<HTMLAnchorElement>('a[href="#article-editor"]')
  .forEach((link) =>
    link.addEventListener("click", (event) => {
      event.preventDefault();
      open(link.dataset.editPart);
    }),
  );
document.querySelector("#close-editor")!.addEventListener("click", () => {
  if (!controller?.busy()) root.close();
});
root.addEventListener("cancel", (event) => {
  if (controller?.busy()) event.preventDefault();
});
document
  .querySelector<HTMLDetailsElement>("#edit-history")!
  .addEventListener("toggle", async (event) => {
    if (!(event.target as HTMLDetailsElement).open) return;
    try {
      (await load()).history();
    } catch {}
  });
if (location.hash === "#article-editor") open();
