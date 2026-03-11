import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getAgentDir } from "./app-paths.js";

function getProjectResourcesDir(): string {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  return join(__dirname, "..", "resources");
}

export function syncResources(): void {
  const srcDir = getProjectResourcesDir();
  const destDir = getAgentDir();

  if (!existsSync(srcDir)) {
    return;
  }

  mkdirSync(destDir, { recursive: true });

  for (const subdir of ["agents", "skills", "extensions"]) {
    const src = join(srcDir, subdir);
    if (existsSync(src)) {
      const dest = join(destDir, subdir);
      cpSync(src, dest, { recursive: true, force: true });
    }
  }
}
