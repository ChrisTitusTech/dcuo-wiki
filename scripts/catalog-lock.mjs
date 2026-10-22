import {
  openSync,
  writeFileSync,
  closeSync,
  readFileSync,
  unlinkSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
export function acquireCatalogLock(path) {
  let fd;
  try {
    fd = openSync(path, "wx");
  } catch (e) {
    if (e.code === "EEXIST")
      throw Error(
        "Catalog writer lock exists: " +
          path +
          ". Check the recorded process before restarting.",
      );
    throw e;
  }
  const owner = JSON.stringify({ pid: process.pid, token: randomUUID() });
  try {
    writeFileSync(fd, owner);
  } finally {
    closeSync(fd);
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    try {
      if (readFileSync(path, "utf8") === owner) unlinkSync(path);
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
  };
}
