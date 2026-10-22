import { Editor, Extension, Node, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import Image from "@tiptap/extension-image";

type ArticleDocument = {
  version: 1;
  title: string;
  summary: string;
  content: JSONContent;
};
type Published = {
  document: ArticleDocument;
  revision: number;
  baseHash: string;
  html: string;
  toc: string;
};
type SavedDraft = {
  document: ArticleDocument;
  revision: number;
  baseHash: string;
  reason: string;
  sources: string;
  source?: string;
  mode?: string;
};
const safeImage = (value: string) =>
  /^https:\/\/images\.dcuo-wiki\.com\/[a-f0-9]{64}(?:-preview)?\.(?:webp|png|jpg)$/.test(
    value,
  );
const WikiImage = Image.extend({
  parseHTML() {
    return [
      {
        tag: "img[src]",
        getAttrs: (element) =>
          safeImage(element.getAttribute("src") || "") ? null : false,
      },
    ];
  },
});
const SectionIds = Extension.create({
  name: "sectionIds",
  addGlobalAttributes() {
    return [
      {
        types: ["heading"],
        attributes: {
          id: {
            default: null,
            parseHTML: (element) => element.getAttribute("data-section-id"),
            renderHTML: (attrs) =>
              attrs.id ? { "data-section-id": attrs.id } : {},
          },
        },
      },
    ];
  },
});
const YouTube = Node.create({
  name: "youtube",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return { url: { default: "" }, title: { default: "Video walkthrough" } };
  },
  parseHTML() {
    return [
      {
        tag: "div[data-youtube-url]",
        getAttrs: (element) => ({
          url: element.getAttribute("data-youtube-url"),
          title: element.getAttribute("data-title") || "Video walkthrough",
        }),
      },
    ];
  },
  renderHTML({ node }) {
    return [
      "div",
      {
        "data-youtube-url": node.attrs.url,
        "data-title": node.attrs.title,
        class: "editor-video",
      },
      ["strong", {}, node.attrs.title],
      ["span", {}, node.attrs.url],
    ];
  },
});

export async function createArticleEditor(root: HTMLDialogElement) {
  const el = <T extends HTMLElement>(id: string) =>
    document.getElementById(id) as T;
  const form = el<HTMLFormElement>("article-edit-form");
  const title = el<HTMLInputElement>("edit-title"),
    summary = el<HTMLTextAreaElement>("edit-summary");
  const source = el<HTMLTextAreaElement>("edit-source"),
    status = el("edit-status"),
    draftStatus = el("draft-status");
  const submit = el<HTMLButtonElement>("submit-edit");
  const reason = form.elements.namedItem("reason") as HTMLTextAreaElement;
  const sources = form.elements.namedItem("sources") as HTMLTextAreaElement;
  const endpoint = `/api/articles/${encodeURIComponent(root.dataset.slug!)}`;
  const key = `wiki-document:${root.dataset.slug}`;
  let busy = false,
    eligible = false,
    dirty = false,
    mode = "visual",
    loading = true;
  let sourceChanged = false,
    timer: ReturnType<typeof setTimeout> | undefined;
  let published: Published,
    token: { baseHash: string; revision: number },
    initial = "";
  let previewGeneration = 0;
  let conflict: Published | null = null;
  async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(path, {
      ...options,
      credentials: "same-origin",
    });
    const data = await response.json();
    if (!response.ok)
      throw Object.assign(
        new Error(
          data.error || "The request failed. Your draft stays in this tab.",
        ),
        { status: response.status },
      );
    return data;
  }
  const post = <T>(path: string, body: unknown) =>
    api<T>(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  published = await api<Published>(`${endpoint}/document`);
  token = { revision: published.revision, baseHash: published.baseHash };
  const editor = new Editor({
    element: el("visual-editor"),
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        link: { openOnClick: false, defaultProtocol: "https" },
        trailingNode: false,
      }),
      SectionIds,
      TableKit,
      WikiImage,
      YouTube,
    ],
    content: published.document.content,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-label": "Article body",
        "aria-multiline": "true",
        spellcheck: "true",
      },
    },
    onUpdate() {
      if (!loading) {
        sourceChanged = false;
        scheduleSave();
        toolbar();
      }
    },
    onSelectionUpdate() {
      if (!loading) toolbar();
    },
  });
  function current(): ArticleDocument {
    return {
      version: 1,
      title: title.value,
      summary: summary.value,
      content: editor.getJSON(),
    };
  }
  function fingerprint() {
    return JSON.stringify(current());
  }
  function updateWords() {
    const value = editor.getText().trim();
    el("editor-word-count").textContent =
      `${value ? value.split(/\s+/).length.toLocaleString() : 0} words`;
  }
  function save() {
    if (loading) return;
    dirty =
      fingerprint() !== initial ||
      sourceChanged ||
      !!reason.value ||
      !!sources.value;
    updateWords();
    try {
      if (!dirty) {
        sessionStorage.removeItem(key);
        draftStatus.textContent = "No unpublished changes";
        return;
      }
      sessionStorage.setItem(
        key,
        JSON.stringify({
          document: current(),
          ...token,
          reason: reason.value,
          sources: sources.value,
          ...(sourceChanged ? { source: source.value, mode: "source" } : {}),
        } satisfies SavedDraft),
      );
      draftStatus.textContent = "Draft saved in this tab";
    } catch {
      draftStatus.textContent = "Draft could not be saved. Keep this tab open.";
    }
  }
  function scheduleSave() {
    clearTimeout(timer);
    timer = setTimeout(save, 250);
  }
  function setBusy(value: boolean) {
    busy = value;
    root
      .querySelectorAll<
        | HTMLInputElement
        | HTMLTextAreaElement
        | HTMLSelectElement
        | HTMLButtonElement
      >("input,textarea,select,button")
      .forEach((c) => (c.disabled = value));
    editor.setEditable(!value);
    submit.disabled = value || !eligible;
    el<HTMLButtonElement>("use-reviewed-draft").disabled =
      value || !conflict || !el<HTMLInputElement>("review-latest").checked;
    if (!value) toolbar();
  }
  function markConflict(latest: Published) {
    published = latest;
    conflict = latest;
    el("conflict-controls").hidden = false;
    el<HTMLInputElement>("review-latest").checked = false;
    el<HTMLButtonElement>("use-reviewed-draft").disabled = true;
    el<HTMLDetailsElement>("compare-published").open = true;
  }
  el("review-latest").addEventListener("change", () => {
    el<HTMLButtonElement>("use-reviewed-draft").disabled =
      busy || !conflict || !el<HTMLInputElement>("review-latest").checked;
  });
  el("use-reviewed-draft").addEventListener("click", async () => {
    if (busy || !conflict || !el<HTMLInputElement>("review-latest").checked)
      return;
    token = { revision: conflict.revision, baseHash: conflict.baseHash };
    conflict = null;
    el("conflict-controls").hidden = true;
    save();
    status.textContent =
      "Your reviewed draft now uses the latest revision. Publish when ready.";
    await switchMode("visual");
  });
  function toolbar() {
    const format = el<HTMLSelectElement>("editor-format");
    format.value =
      [2, 3, 4]
        .find((level) => editor.isActive("heading", { level }))
        ?.toString() || "paragraph";
    for (const button of root.querySelectorAll<HTMLButtonElement>(
      "[data-command]",
    )) {
      const command = button.dataset.command!;
      if (
        [
          "bold",
          "italic",
          "underline",
          "strike",
          "bulletList",
          "orderedList",
          "blockquote",
          "codeBlock",
        ].includes(command)
      )
        button.setAttribute("aria-pressed", String(editor.isActive(command)));
      if (command === "undo" || command === "redo")
        button.disabled = busy || !editor.can()[command]();
    }
    el("table-tools").hidden = !editor.isActive("table");
  }
  function applySource() {
    if (!sourceChanged) return;
    editor.commands.setContent(source.value, {
      errorOnInvalidContent: true,
      emitUpdate: false,
    });
    sourceChanged = false;
    save();
  }
  function applyDocument(doc: ArticleDocument) {
    editor.commands.setContent(doc.content, {
      errorOnInvalidContent: true,
      emitUpdate: false,
    });
    title.value = doc.title;
    summary.value = doc.summary;
    sourceChanged = false;
    source.value = editor.getHTML();
    toolbar();
    updateWords();
  }
  const preview = (target: HTMLElement, doc: ArticleDocument, html: string) => {
    const heading = document.createElement("h1"),
      lede = document.createElement("p"),
      body = document.createElement("div");
    heading.textContent = doc.title;
    lede.textContent = doc.summary;
    body.innerHTML = html; // Only HTML returned by the server's allowlisted renderer.
    target.replaceChildren(heading, lede, body);
  };
  async function switchMode(next: string) {
    if (busy) return;
    try {
      if (mode === "source" && next !== "source") applySource();
      const generation = ++previewGeneration;
      mode = next;
      for (const button of root.querySelectorAll<HTMLButtonElement>(
        "[data-mode]",
      )) {
        const active = button.dataset.mode === next;
        button.setAttribute("aria-selected", String(active));
        button.tabIndex = active ? 0 : -1;
        el(`${button.dataset.mode}-panel`).hidden = !active;
      }
      el("editor-toolbar").hidden = next !== "visual";
      if (next === "source" && !sourceChanged)
        source.value = editor
          .getHTML()
          .replace(
            /><(h[2-4]|p|ul|ol|li|table|tr|div|blockquote|pre)/g,
            ">\n<$1",
          );
      if (next === "preview") {
        el("article-preview").textContent = "Rendering preview...";
        const result = await post<{ document: ArticleDocument; html: string }>(
          `${endpoint}/preview`,
          { document: current() },
        );
        if (generation !== previewGeneration) return;
        preview(el("article-preview"), result.document, result.html);
        preview(el("published-preview"), published.document, published.html);
      }
      toolbar();
    } catch (error) {
      status.textContent = (error as Error).message;
    }
  }
  applyDocument(published.document);
  initial = fingerprint();
  try {
    const draft = JSON.parse(
      sessionStorage.getItem(key) || "null",
    ) as SavedDraft | null;
    if (
      draft?.document?.version === 1 &&
      typeof draft.baseHash === "string" &&
      Number.isInteger(draft.revision)
    ) {
      applyDocument(draft.document);
      token = { baseHash: draft.baseHash, revision: draft.revision };
      reason.value = typeof draft.reason === "string" ? draft.reason : "";
      sources.value = typeof draft.sources === "string" ? draft.sources : "";
      if (typeof draft.source === "string") {
        source.value = draft.source;
        sourceChanged = true;
      }
      if (
        draft.revision !== published.revision ||
        draft.baseHash !== published.baseHash
      ) {
        markConflict(published);
        status.textContent =
          "The article changed since this draft. Your draft is preserved. Use Preview to compare, or discard it to start from the latest article.";
      } else status.textContent = "Restored your saved draft.";
    }
    const legacy = JSON.parse(
      sessionStorage.getItem(`wiki-edit:${root.dataset.slug}`) || "null",
    );
    if (legacy?.drafts && typeof legacy.drafts === "object") {
      el("legacy-drafts").hidden = false;
      el("legacy-drafts").querySelector("pre")!.textContent = Object.entries(
        legacy.drafts,
      )
        .map(
          ([id, d]) =>
            `${id}\n${(d as { replacement?: string })?.replacement || ""}`,
        )
        .join("\n\n");
    }
  } catch {
    status.textContent =
      "A saved draft could not be opened. It remains in this tab's storage.";
  }
  loading = false;
  form.hidden = false;
  save();
  toolbar();
  try {
    const me = await api<{
      name: string;
      profile?: { character: { name: string } };
    }>("/api/me");
    eligible = !!me.profile;
    if (!status.textContent?.includes("draft"))
      status.textContent = eligible
        ? `Publishing as ${me.profile!.character.name}. Your Discord sign-in and Census match are checked on publish.`
        : "Match your character through Census to publish.";
  } catch {
    if (!status.textContent?.includes("draft"))
      status.textContent =
        "You can edit a draft. Sign in and match your character to publish.";
  }
  submit.disabled = !eligible;
  el("edit-account").hidden = eligible;
  if (sourceChanged) await switchMode("source");
  const insert = el<HTMLDialogElement>("editor-insert"),
    insertForm = el<HTMLFormElement>("insert-form");
  const insertUrl = el<HTMLInputElement>("insert-url"),
    insertCaption = el<HTMLInputElement>("insert-caption");
  let inserting = "link",
    imageSelection = false,
    videoSelection = false,
    mediaRequest = 0;
  async function searchMedia(query = "") {
    const generation = ++mediaRequest;
    el("media-status").textContent = "Loading wiki images...";
    try {
      const result = await api<{
        images: {
          src: string;
          source: string;
          label: string;
          credit: string;
        }[];
      }>(`${endpoint}/media?q=${encodeURIComponent(query)}`);
      if (generation !== mediaRequest) return;
      el("media-results").replaceChildren(
        ...result.images.map((image) => {
          const button = document.createElement("button"),
            thumbnail = document.createElement("img"),
            label = document.createElement("span");
          button.type = "button";
          button.setAttribute("aria-label", `Choose ${image.label}`);
          button.setAttribute(
            "aria-pressed",
            String(insertUrl.value === image.src),
          );
          thumbnail.src = image.src;
          thumbnail.alt = "";
          thumbnail.loading = "lazy";
          label.textContent = image.label;
          button.append(thumbnail, label);
          button.addEventListener("click", () => {
            insertUrl.value = image.src;
            if (!insertCaption.value)
              insertCaption.value = image.label
                .replace(/\.[a-z]+$/i, "")
                .replaceAll("_", " ");
            el("media-results")
              .querySelectorAll("button")
              .forEach((b) =>
                b.setAttribute("aria-pressed", String(b === button)),
              );
          });
          return button;
        }),
      );
      el("media-status").textContent = result.images.length
        ? `${result.images.length} images. Source credits stay with the image.`
        : query
          ? "No matching images. Try another search."
          : "No images on this page yet. Search the wiki's R2 library above.";
    } catch (error) {
      el("media-status").textContent = (error as Error).message;
    }
  }
  function openInsert(kind: string) {
    inserting = kind;
    imageSelection = kind === "image" && editor.isActive("image");
    videoSelection = kind === "youtube" && editor.isActive("youtube");
    el("insert-heading").textContent =
      kind === "image"
        ? "Insert or edit wiki image / map"
        : kind === "youtube"
          ? "Insert YouTube walkthrough"
          : "Add or edit link";
    el("media-picker").hidden = kind !== "image";
    el("insert-caption-label").hidden = kind === "link";
    el("insert-error").textContent = "";
    const attrs = editor.getAttributes(
      kind === "link" ? "link" : kind === "image" ? "image" : "youtube",
    );
    insertUrl.value =
      kind === "link"
        ? attrs.href || ""
        : kind === "image"
          ? attrs.src || ""
          : attrs.url || "";
    insertCaption.value =
      kind === "image" ? attrs.alt || "" : attrs.title || "";
    insert.showModal();
    if (kind === "image") {
      el<HTMLInputElement>("media-query").value = "";
      searchMedia();
    } else insertUrl.focus();
  }
  let mediaTimer: ReturnType<typeof setTimeout>;
  el<HTMLInputElement>("media-query").addEventListener("input", (event) => {
    clearTimeout(mediaTimer);
    mediaTimer = setTimeout(
      () => searchMedia((event.target as HTMLInputElement).value),
      200,
    );
  });
  el("cancel-insert").addEventListener("click", () => insert.close());
  insertForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const value = insertUrl.value.trim(),
      label = insertCaption.value.trim();
    try {
      if (inserting === "image") {
        if (!safeImage(value))
          throw new Error(
            "Choose an image from the wiki library, or paste its images.dcuo-wiki.com URL.",
          );
        if (imageSelection)
          editor
            .chain()
            .focus()
            .updateAttributes("image", { src: value, alt: label || "Image" })
            .run();
        else
          editor
            .chain()
            .focus()
            .insertContentAt(editor.state.selection.to, {
              type: "image",
              attrs: { src: value, alt: label || "Image" },
            })
            .run();
      } else if (inserting === "youtube") {
        const url = new URL(value);
        if (
          url.protocol !== "https:" ||
          ![
            "youtube.com",
            "www.youtube.com",
            "m.youtube.com",
            "youtu.be",
          ].includes(url.hostname)
        )
          throw new Error("Enter a YouTube watch or youtu.be link.");
        if (videoSelection)
          editor
            .chain()
            .focus()
            .updateAttributes("youtube", {
              url: value,
              title: label || "Video walkthrough",
            })
            .run();
        else
          editor
            .chain()
            .focus()
            .insertContentAt(editor.state.selection.to, {
              type: "youtube",
              attrs: { url: value, title: label || "Video walkthrough" },
            })
            .run();
      } else {
        if (!/^\/(?!\/)/.test(value) && !/^#[\w-]+$/.test(value)) {
          const url = new URL(value);
          if (url.protocol !== "https:" || url.username || url.password)
            throw new Error("Use a wiki path or an HTTPS URL.");
        }
        if (editor.state.selection.empty)
          editor
            .chain()
            .focus()
            .insertContent({
              type: "text",
              text: value,
              marks: [{ type: "link", attrs: { href: value } }],
            })
            .run();
        else
          editor
            .chain()
            .focus()
            .extendMarkRange("link")
            .setLink({ href: value })
            .run();
      }
      insert.close();
      save();
    } catch (error) {
      el("insert-error").textContent = (error as Error).message;
    }
  });
  const commands: Record<string, () => unknown> = {
    bold: () => editor.chain().focus().toggleBold().run(),
    italic: () => editor.chain().focus().toggleItalic().run(),
    underline: () => editor.chain().focus().toggleUnderline().run(),
    strike: () => editor.chain().focus().toggleStrike().run(),
    bulletList: () => editor.chain().focus().toggleBulletList().run(),
    orderedList: () => editor.chain().focus().toggleOrderedList().run(),
    blockquote: () => editor.chain().focus().toggleBlockquote().run(),
    codeBlock: () => editor.chain().focus().toggleCodeBlock().run(),
    undo: () => editor.chain().focus().undo().run(),
    redo: () => editor.chain().focus().redo().run(),
    horizontalRule: () => editor.chain().focus().setHorizontalRule().run(),
    link: () => openInsert("link"),
    unlink: () => editor.chain().focus().unsetLink().run(),
    image: () => openInsert("image"),
    youtube: () => openInsert("youtube"),
    table: () =>
      editor
        .chain()
        .focus()
        .insertContentAt(editor.state.selection.to, {
          type: "table",
          content: Array.from({ length: 3 }, (_, row) => ({
            type: "tableRow",
            content: Array.from({ length: 3 }, () => ({
              type: row === 0 ? "tableHeader" : "tableCell",
              content: [{ type: "paragraph" }],
            })),
          })),
        })
        .run(),
    addRowAfter: () => editor.chain().focus().addRowAfter().run(),
    addColumnAfter: () => editor.chain().focus().addColumnAfter().run(),
    deleteRow: () => editor.chain().focus().deleteRow().run(),
    deleteColumn: () => editor.chain().focus().deleteColumn().run(),
    mergeCells: () => editor.chain().focus().mergeCells().run(),
    splitCell: () => editor.chain().focus().splitCell().run(),
    toggleHeaderRow: () => editor.chain().focus().toggleHeaderRow().run(),
    deleteTable: () => editor.chain().focus().deleteTable().run(),
  };
  for (const button of root.querySelectorAll<HTMLButtonElement>(
    "[data-command]",
  )) {
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => {
      if (!busy) {
        commands[button.dataset.command!]?.();
        toolbar();
      }
    });
  }
  el<HTMLSelectElement>("editor-format").addEventListener("change", (event) => {
    const value = (event.target as HTMLSelectElement).value;
    if (value === "paragraph") editor.chain().focus().setParagraph().run();
    else
      editor
        .chain()
        .focus()
        .setHeading({ level: Number(value) as 2 | 3 | 4 })
        .run();
  });
  root.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => switchMode(button.dataset.mode!));
    button.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
        return;
      event.preventDefault();
      const tabs = [...root.querySelectorAll<HTMLButtonElement>("[data-mode]")];
      const index = tabs.indexOf(button),
        next =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? tabs.length - 1
              : (index + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) %
                tabs.length;
      tabs[next].focus();
      switchMode(tabs[next].dataset.mode!);
    });
  });
  [title, summary, reason, sources].forEach((field) =>
    field.addEventListener("input", scheduleSave),
  );
  source.addEventListener("input", () => {
    sourceChanged = true;
    scheduleSave();
  });
  window.addEventListener("beforeunload", (event) => {
    save();
    if (dirty) {
      event.preventDefault();
    }
  });
  el("reset-edit").addEventListener("click", async () => {
    if (
      busy ||
      (dirty &&
        !confirm(
          "Discard this entire article draft and load the latest published article?",
        ))
    )
      return;
    setBusy(true);
    try {
      published = await api<Published>(`${endpoint}/document`);
      applyDocument(published.document);
      token = { revision: published.revision, baseHash: published.baseHash };
      initial = fingerprint();
      reason.value = "";
      sources.value = "";
      sessionStorage.removeItem(key);
      dirty = false;
      conflict = null;
      el("conflict-controls").hidden = true;
      status.textContent = "Loaded the latest published article.";
      save();
    } catch (error) {
      status.textContent = (error as Error).message;
    } finally {
      setBusy(false);
      await switchMode("visual");
    }
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy || !eligible) return;
    try {
      applySource();
    } catch (error) {
      status.textContent = (error as Error).message;
      return;
    }
    el<HTMLDetailsElement>("publish-details").open = true;
    if (!form.reportValidity()) return;
    save();
    setBusy(true);
    status.textContent = "Checking Census and publishing the full article...";
    try {
      await post(`${endpoint}/document`, {
        document: current(),
        ...token,
        reason: reason.value,
        sources: sources.value,
      });
      clearTimeout(timer);
      sessionStorage.removeItem(key);
      dirty = false;
      loading = true;
      location.hash = "";
      location.reload();
    } catch (error) {
      status.textContent = (error as Error).message;
      setBusy(false);
      if ((error as Error & { status?: number }).status === 409) {
        try {
          const latest = await api<Published>(`${endpoint}/document`);
          if (
            latest.revision !== token.revision ||
            latest.baseHash !== token.baseHash
          ) {
            markConflict(latest);
            await switchMode("preview");
          }
        } catch {
          /* The saved draft and original conflict message remain available. */
        }
      }
    }
  });
  async function history() {
    const list = el("edit-history-list");
    list.textContent = "Loading edit history...";
    try {
      const data = await api<{
        revisions: {
          id: number;
          part: string;
          reason: string;
          sources: string;
          character_name: string;
          created_at: number;
        }[];
      }>(`${endpoint}/history`);
      list.replaceChildren();
      if (!data.revisions.length) list.textContent = "No player edits yet.";
      for (const revision of data.revisions) {
        const entry = document.createElement("details"),
          heading = document.createElement("summary"),
          body = document.createElement("div");
        heading.textContent = `${new Date(revision.created_at * 1000).toLocaleString()} - ${revision.character_name} - ${revision.part === "document" ? "Full article" : revision.part}`;
        entry.append(heading, body);
        list.append(entry);
        let fetched = false;
        entry.addEventListener("toggle", async () => {
          if (!entry.open || fetched) return;
          fetched = true;
          body.textContent = "Loading revision...";
          try {
            const { revision: details, versions } = await api<{
              revision: typeof revision & {
                content: string;
                previous_content: string;
              };
              versions?: Published[];
            }>(`${endpoint}/history/${revision.id}`);
            body.replaceChildren();
            for (const [label, value] of [
              ["Reason", details.reason],
              ["Evidence", details.sources],
              ["Before", details.previous_content],
              ["After", details.content],
            ]) {
              const caption = document.createElement("h3"),
                pre = document.createElement("pre");
              caption.textContent = label;
              if (
                details.part === "document" &&
                ["Before", "After"].includes(label)
              ) {
                const version = versions?.[label === "Before" ? 0 : 1];
                if (version) {
                  const rendered = document.createElement("div");
                  rendered.className = "rich-article history-article";
                  preview(rendered, version.document, version.html);
                  body.append(caption, rendered);
                  continue;
                }
                pre.textContent = value;
              } else pre.textContent = value;
              body.append(caption, pre);
            }
            if (details.part === "document") {
              const restore = document.createElement("button");
              restore.type = "button";
              restore.textContent = "Restore article from before this edit";
              restore.addEventListener("click", async () => {
                if (
                  busy ||
                  (dirty &&
                    !confirm(
                      "Replace your current draft with this earlier article?",
                    ))
                )
                  return;
                try {
                  const latest = await api<Published>(`${endpoint}/document`);
                  published = latest;
                  conflict = null;
                  el("conflict-controls").hidden = true;
                  token = {
                    baseHash: latest.baseHash,
                    revision: latest.revision,
                  };
                  applyDocument(latest.document);
                  initial = fingerprint();
                  applyDocument(JSON.parse(details.previous_content));
                  reason.value = `Restore the article from before revision ${revision.id}.`;
                  sources.value = details.sources;
                  save();
                  if (!root.open) root.showModal();
                  await switchMode("visual");
                  status.textContent =
                    "Earlier article loaded as a draft. Review it and publish to restore it.";
                } catch (error) {
                  status.textContent = (error as Error).message;
                }
              });
              body.append(restore);
            }
          } catch (error) {
            fetched = false;
            body.textContent = (error as Error).message;
          }
        });
      }
    } catch (error) {
      list.textContent = (error as Error).message;
    }
  }
  return {
    busy: () => busy,
    history,
    focus(part?: string) {
      if (!part || mode !== "visual") return;
      const id = part.match(/^(?:section|images|table)-(\d+)$/)?.[1];
      const target = id
        ? `section-${id}`
        : ["location-label", "location-precision", "location-maps"].includes(
              part,
            )
          ? "location"
          : part;
      let focused = false;
      editor.state.doc.descendants((node, pos) => {
        if (
          !focused &&
          node.type.name === "heading" &&
          (node.attrs.id === target ||
            (part === "videos" && node.textContent === "Video walkthroughs") ||
            (part === "location-research" &&
              node.textContent === "Location research"))
        ) {
          focused = true;
          editor
            .chain()
            .focus()
            .setTextSelection(pos + 1)
            .scrollIntoView()
            .run();
          return false;
        }
      });
    },
  };
}
