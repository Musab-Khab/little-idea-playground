/** Server-only file storage locations (kept out of server-function files so browser bundles never load node:fs). */
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

/** Folder for uploaded staff documents, created on first use. */
export const storageDir = () => {
  const dir = resolve(process.env.STORAGE_DIR || "./storage", "staff-docs");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
};
