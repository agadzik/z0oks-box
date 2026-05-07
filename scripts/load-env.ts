import { resolve } from "node:path";

/**
 * Load a `.env`-style file into `process.env`.
 * Existing `process.env` values win, so callers can still override on the CLI.
 * Silently no-ops if the file is missing.
 */
export async function loadEnvFile(relativePath: string): Promise<void> {
  const file = Bun.file(resolve(process.cwd(), relativePath));
  if (!(await file.exists())) {
    return;
  }

  const contents = await file.text();
  for (const rawLine of contents.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const eq = line.indexOf("=");
    if (eq === -1) {
      continue;
    }

    const key = line.slice(0, eq).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }

    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
