// A fixed manifest identifier; neither a source URL nor an arbitrary object key.
export function catalogMediaAsset(reference) {
  const url = new URL(reference);
  if (
    url.origin !== "https://dcuo-wiki.com" ||
    !/^\/api\/catalog-media\/[a-f0-9]{64}$/.test(url.pathname) ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  )
    return null;
  return {
    preview: url.href,
    original: url.href,
    sourcePage: url.href + "/source",
    credit:
      "DC Universe Online Wiki contributors; game artwork belongs to its respective owners.",
  };
}
