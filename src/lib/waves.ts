import { execFileSync } from "node:child_process";

interface BdIssue {
  id: string;
  status: string;
  dependency_type?: string;
}

interface BdShowResult {
  id: string;
  status: string;
  dependencies?: BdIssue[];
  dependents?: BdIssue[];
}

const CLOSED_STATUSES = new Set(["closed", "done", "deferred"]);

function bdShow(id: string): BdShowResult {
  const raw = execFileSync("bd", ["show", id, "--json"], {
    encoding: "utf-8",
    timeout: 30_000,
  });
  const parsed = JSON.parse(raw) as BdShowResult[];
  return parsed[0];
}

/**
 * Compute execution waves for a phase's open tasks.
 *
 * Wave 1 contains tasks with no blocking deps among the open task set.
 * Each subsequent wave contains tasks whose blocking deps are all in earlier waves.
 * Closed/done tasks are excluded (crash recovery).
 *
 * @throws Error if no open tasks found or a dependency cycle is detected.
 */
export function computeWaves(phaseId: string): string[][] {
  // 1. Fetch phase and collect child task IDs
  const phase = bdShow(phaseId);
  const childDependents = (phase.dependents ?? []).filter(
    (d) => d.dependency_type === "parent-child",
  );

  if (childDependents.length === 0) {
    throw new Error(`Phase ${phaseId} has no child tasks.`);
  }

  // 2. Filter to open tasks only
  const openTaskIds = new Set<string>(
    childDependents
      .filter((d) => !CLOSED_STATUSES.has(d.status))
      .map((d) => d.id),
  );

  if (openTaskIds.size === 0) {
    throw new Error(`Phase ${phaseId} has no open tasks (all tasks are closed/done).`);
  }

  // 3. For each open task, fetch its blocking deps (within the open task set)
  const blockedBy = new Map<string, Set<string>>();
  for (const taskId of openTaskIds) {
    const task = bdShow(taskId);
    const blockingDeps = (task.dependencies ?? [])
      .filter(
        (d) =>
          d.dependency_type === "blocks" &&
          openTaskIds.has(d.id),
      )
      .map((d) => d.id);
    blockedBy.set(taskId, new Set(blockingDeps));
  }

  // 4. Kahn's algorithm for topological layering
  const waves: string[][] = [];
  const scheduled = new Set<string>();

  while (scheduled.size < openTaskIds.size) {
    const wave: string[] = [];

    for (const taskId of openTaskIds) {
      if (scheduled.has(taskId)) continue;
      const deps = blockedBy.get(taskId)!;
      // All blocking deps must already be scheduled
      const ready = [...deps].every((dep) => scheduled.has(dep));
      if (ready) {
        wave.push(taskId);
      }
    }

    if (wave.length === 0) {
      const remaining = [...openTaskIds].filter((id) => !scheduled.has(id));
      throw new Error(
        `Dependency cycle detected among tasks: ${remaining.join(", ")}`,
      );
    }

    for (const taskId of wave) {
      scheduled.add(taskId);
    }
    waves.push(wave);
  }

  return waves;
}
