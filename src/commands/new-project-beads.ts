import { execFileSync } from "node:child_process";

function runBdCreate(args: string[]): string {
  const stdout = execFileSync("bd", ["create", "--silent", ...args], {
    encoding: "utf-8",
    timeout: 30_000,
  }).trim();
  return stdout;
}

/**
 * Create an epic bead and return its ID.
 */
export function createEpic(
  title: string,
  description: string,
  labels: string[] = [],
  parentId?: string,
): string {
  const args: string[] = ["--type=epic", `--title=${title}`, `--description=${description}`];
  if (labels.length > 0) {
    args.push(`--labels=${labels.join(",")}`);
  }
  if (parentId) {
    args.push(`--parent=${parentId}`);
  }
  return runBdCreate(args);
}

/**
 * Create a feature bead and return its ID.
 */
export function createFeature(
  title: string,
  description: string,
  labels: string[] = [],
  parentId?: string,
): string {
  const args: string[] = ["--type=feature", `--title=${title}`, `--description=${description}`];
  if (labels.length > 0) {
    args.push(`--labels=${labels.join(",")}`);
  }
  if (parentId) {
    args.push(`--parent=${parentId}`);
  }
  return runBdCreate(args);
}

/**
 * Add a dependency between two beads.
 * fromId depends on / is blocked by toId (or the relationship is typed by `type`).
 */
export function addDep(fromId: string, toId: string, type = "blocks"): void {
  execFileSync("bd", ["dep", "add", fromId, toId, `--type=${type}`], {
    encoding: "utf-8",
    timeout: 30_000,
  });
}
