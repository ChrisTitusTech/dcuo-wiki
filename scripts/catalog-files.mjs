import fs from "node:fs/promises";
export async function catalogArticles() {
  let files;
  try {
    files = await fs.readdir("content/catalog");
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const groups = await Promise.all(
    files
      .filter((f) => /^[A-Za-z]+\.json$/.test(f))
      .sort()
      .map(async (f) =>
        JSON.parse(await fs.readFile("content/catalog/" + f, "utf8")),
      ),
  );
  return groups.flat();
}
