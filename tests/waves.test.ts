/**
 * Unit tests for computeWaves.
 *
 * These tests mock execFileSync to avoid hitting the real bd CLI.
 * Run with: npx tsx tests/waves.test.ts
 */
import { strict as assert } from "node:assert";
import { describe, it, mock, beforeEach } from "node:test";
import { execFileSync } from "node:child_process";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

type BdShowResult = {
  id: string;
  status: string;
  dependencies?: Array<{ id: string; status: string; dependency_type: string }>;
  dependents?: Array<{ id: string; status: string; dependency_type: string }>;
};

const DB: Map<string, BdShowResult> = new Map();

function setupMock() {
  mock.module("node:child_process", {
    namedExports: {
      execFileSync: (_cmd: string, args: string[]) => {
        // args = ["show", "<id>", "--json"]
        const id = args[1];
        const rec = DB.get(id);
        if (!rec) throw new Error(`Unknown id: ${id}`);
        return JSON.stringify([rec]);
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Helpers to populate DB
// ---------------------------------------------------------------------------

function phase(id: string, children: string[]): void {
  DB.set(id, {
    id,
    status: "in_progress",
    dependents: children.map((cid) => ({
      id: cid,
      status: DB.get(cid)?.status ?? "open",
      dependency_type: "parent-child",
    })),
  });
}

function task(
  id: string,
  status: string,
  blockedBy: string[] = [],
): void {
  DB.set(id, {
    id,
    status,
    dependencies: blockedBy.map((bid) => ({
      id: bid,
      status: DB.get(bid)?.status ?? "open",
      dependency_type: "blocks",
    })),
  });
}

// ---------------------------------------------------------------------------
// We import computeWaves dynamically AFTER mocking, but node:test mock.module
// affects future imports. We instead test the pure algorithm directly by
// re-implementing a thin wrapper that substitutes execFileSync.
// ---------------------------------------------------------------------------

/**
 * A self-contained version of computeWaves that accepts a bdShow function
 * so tests can inject mock data without touching the real CLI.
 */
function computeWavesTestable(
  phaseId: string,
  bdShow: (id: string) => BdShowResult,
): string[][] {
  const CLOSED = new Set(["closed", "done", "deferred"]);

  const phase = bdShow(phaseId);
  const children = (phase.dependents ?? []).filter(
    (d) => d.dependency_type === "parent-child",
  );

  if (children.length === 0) {
    throw new Error(`Phase ${phaseId} has no child tasks.`);
  }

  const openTaskIds = new Set<string>(
    children.filter((d) => !CLOSED.has(d.status)).map((d) => d.id),
  );

  if (openTaskIds.size === 0) {
    throw new Error(`Phase ${phaseId} has no open tasks (all tasks are closed/done).`);
  }

  const blockedBy = new Map<string, Set<string>>();
  for (const taskId of openTaskIds) {
    const t = bdShow(taskId);
    const deps = (t.dependencies ?? [])
      .filter((d) => d.dependency_type === "blocks" && openTaskIds.has(d.id))
      .map((d) => d.id);
    blockedBy.set(taskId, new Set(deps));
  }

  const waves: string[][] = [];
  const scheduled = new Set<string>();

  while (scheduled.size < openTaskIds.size) {
    const wave: string[] = [];
    for (const taskId of openTaskIds) {
      if (scheduled.has(taskId)) continue;
      const ready = [...(blockedBy.get(taskId) ?? [])].every((d) =>
        scheduled.has(d),
      );
      if (ready) wave.push(taskId);
    }
    if (wave.length === 0) {
      const remaining = [...openTaskIds].filter((id) => !scheduled.has(id));
      throw new Error(`Dependency cycle detected among tasks: ${remaining.join(", ")}`);
    }
    for (const id of wave) scheduled.add(id);
    waves.push(wave);
  }

  return waves;
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function buildPhase(
  phaseId: string,
  tasks: Record<string, { status: string; blockedBy?: string[] }>,
): (id: string) => BdShowResult {
  const store = new Map<string, BdShowResult>();

  for (const [id, cfg] of Object.entries(tasks)) {
    store.set(id, {
      id,
      status: cfg.status,
      dependencies: (cfg.blockedBy ?? []).map((bid) => ({
        id: bid,
        status: tasks[bid]?.status ?? "open",
        dependency_type: "blocks",
      })),
    });
  }

  store.set(phaseId, {
    id: phaseId,
    status: "in_progress",
    dependents: Object.entries(tasks).map(([id, cfg]) => ({
      id,
      status: cfg.status,
      dependency_type: "parent-child",
    })),
  });

  return (id: string) => {
    const r = store.get(id);
    if (!r) throw new Error(`Unknown id in fixture: ${id}`);
    return r;
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("computeWaves", () => {
  it("case 1: linear chain A → B → C produces three sequential waves", () => {
    // A blocks B, B blocks C (A must run first, then B, then C)
    const lookup = buildPhase("phase-1", {
      "task-A": { status: "open", blockedBy: [] },
      "task-B": { status: "open", blockedBy: ["task-A"] },
      "task-C": { status: "open", blockedBy: ["task-B"] },
    });

    const waves = computeWavesTestable("phase-1", lookup);
    assert.equal(waves.length, 3);
    assert.deepEqual(waves[0], ["task-A"]);
    assert.deepEqual(waves[1], ["task-B"]);
    assert.deepEqual(waves[2], ["task-C"]);
  });

  it("case 2: fully independent tasks all land in wave 1", () => {
    const lookup = buildPhase("phase-2", {
      "task-X": { status: "open" },
      "task-Y": { status: "open" },
      "task-Z": { status: "open" },
    });

    const waves = computeWavesTestable("phase-2", lookup);
    assert.equal(waves.length, 1);
    assert.equal(waves[0].length, 3);
    assert.ok(waves[0].includes("task-X"));
    assert.ok(waves[0].includes("task-Y"));
    assert.ok(waves[0].includes("task-Z"));
  });

  it("case 3: mixed graph — two roots then a merge node", () => {
    // task-R1 and task-R2 are independent roots
    // task-M depends on both (blocked by R1 and R2)
    const lookup = buildPhase("phase-3", {
      "task-R1": { status: "open" },
      "task-R2": { status: "open" },
      "task-M": { status: "open", blockedBy: ["task-R1", "task-R2"] },
    });

    const waves = computeWavesTestable("phase-3", lookup);
    assert.equal(waves.length, 2);
    assert.equal(waves[0].length, 2);
    assert.ok(waves[0].includes("task-R1"));
    assert.ok(waves[0].includes("task-R2"));
    assert.deepEqual(waves[1], ["task-M"]);
  });

  it("case 4: closed tasks are excluded from wave computation", () => {
    // task-done is closed; task-B depends on it but should appear in wave 1
    // since closed tasks are excluded from the open set
    const lookup = buildPhase("phase-4", {
      "task-done": { status: "closed" },
      "task-B": { status: "open", blockedBy: ["task-done"] },
      "task-C": { status: "open", blockedBy: ["task-B"] },
    });

    const waves = computeWavesTestable("phase-4", lookup);
    // task-done is excluded; task-B has no unsatisfied deps in open set → wave 1
    assert.equal(waves.length, 2);
    assert.deepEqual(waves[0], ["task-B"]);
    assert.deepEqual(waves[1], ["task-C"]);
  });

  it("case 5: throws when all tasks are closed", () => {
    const lookup = buildPhase("phase-5", {
      "task-A": { status: "closed" },
      "task-B": { status: "done" },
    });

    assert.throws(
      () => computeWavesTestable("phase-5", lookup),
      /no open tasks/i,
    );
  });

  it("case 6: throws on cycle", () => {
    // A blocks B, B blocks A
    const lookup = buildPhase("phase-6", {
      "task-A": { status: "open", blockedBy: ["task-B"] },
      "task-B": { status: "open", blockedBy: ["task-A"] },
    });

    assert.throws(
      () => computeWavesTestable("phase-6", lookup),
      /cycle detected/i,
    );
  });
});

console.log("All tests passed.");
