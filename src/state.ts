import { execFileSync } from "node:child_process";

interface ExecResult {
  stdout: string;
  success: boolean;
}

function runBd(args: string[]): ExecResult {
  try {
    const stdout = execFileSync("bd", args, {
      encoding: "utf-8",
      timeout: 30_000,
    }).trim();
    return { stdout, success: true };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unknown bd command failure";
    throw new Error(`bd ${args.join(" ")} failed: ${message}`);
  }
}

export function getBeadState(id: string): Record<string, unknown> {
  const { stdout } = runBd(["show", id, "--json"]);
  return JSON.parse(stdout) as Record<string, unknown>;
}

export function updateNotes(id: string, notes: string): void {
  runBd(["update", id, `--notes=${notes}`]);
}

export function updateDesign(id: string, design: string): void {
  runBd(["update", id, `--design=${design}`]);
}

export function remember(key: string, value: string): void {
  runBd(["remember", `${key} ${value}`]);
}

export function recall(key: string): string | null {
  try {
    const { stdout } = runBd(["memories", key]);
    return stdout || null;
  } catch {
    return null;
  }
}
