import { homedir } from "node:os";
import { join } from "node:path";

const BASE_DIR = join(homedir(), ".gsd2b");

export function getBaseDir(): string {
  return BASE_DIR;
}

export function getAgentDir(): string {
  return join(BASE_DIR, "agent");
}

export function getConfigDir(): string {
  return join(BASE_DIR, "config");
}

export function getCacheDir(): string {
  return join(BASE_DIR, "cache");
}

export function getResourcePath(...segments: string[]): string {
  return join(BASE_DIR, "agent", ...segments);
}
