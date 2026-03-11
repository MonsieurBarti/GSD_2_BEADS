# gsd2b — GSD-2 with Beads-Backed State

`gsd2b` is a CLI tool for AI-agent-driven software development workflows. It manages project structure, milestone tracking, phase planning, execution, and verification using [beads](https://github.com/beads-dev/beads) as its state backend.

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Commands Reference](#commands-reference)
  - [help / version / status](#help--version--status)
  - [new-project (init)](#new-project-init)
  - [milestone](#milestone)
  - [plan-phase](#plan-phase)
  - [execute-phase](#execute-phase)
  - [verify-phase](#verify-phase)
  - [dashboard](#dashboard)
- [Context Engineering with Beads](#context-engineering-with-beads)
- [JSON Output](#json-output)
- [Typical Project Lifecycle](#typical-project-lifecycle)

---

## Installation

**Prerequisites**: Node.js 18+, `bd` CLI (beads) installed and on `PATH`.

```bash
# Clone the repository
git clone <repo-url> gsd2b
cd gsd2b

# Install dependencies and build
npm install
npm run build

# Link globally (makes 'gsd2b' available on PATH)
npm link
```

Verify the installation:

```bash
gsd2b version
gsd2b --help
```

---

## Quick Start

The following sequence takes a project from zero to a completed first phase.

```bash
# 1. Create a new project (interactive)
gsd2b new-project

# 2. List your phases to find their IDs
gsd2b dashboard phases

# 3. Create a milestone linked to requirements
gsd2b milestone create --title "v1.0 Launch" --req PROJECT-abc --req PROJECT-def

# 4. Plan your first phase: capture context
gsd2b plan-phase discuss PHASE_ID

# 5. Add tasks to the phase
gsd2b plan-phase create-tasks PHASE_ID \
  --task "Implement auth|Add JWT login|User can log in|REQ-001" \
  --task "Add tests|Unit tests for auth|All paths covered|REQ-001" \
  --chain

# 6. Verify the phase before execution
gsd2b verify-phase check PHASE_ID
gsd2b verify-phase coverage PHASE_ID

# 7. Start phase execution (creates a git branch)
gsd2b execute-phase start PHASE_ID

# 8. Run tasks wave by wave (preview first)
gsd2b execute-phase run PHASE_ID --dry-run
gsd2b execute-phase run PHASE_ID

# 9. Finish the phase (closes bead, prints merge suggestion)
gsd2b execute-phase finish PHASE_ID

# 10. Check overall project status
gsd2b status
gsd2b dashboard phases
```

---

## Commands Reference

### help / version / status

```bash
gsd2b help             # Show all available commands
gsd2b help --json      # JSON list of commands

gsd2b version          # Print the installed version
gsd2b version --json   # JSON: { "version": "0.1.0" }

gsd2b status           # Show project bead stats (bd stats)
gsd2b status --json    # JSON: { "status", "stats", "ready" }
```

---

### new-project (init)

Create a new GSD-2 project. Captures vision and requirements, then materialises the following bead hierarchy:

- Root project epic (`forge:project`)
- Requirement features (`forge:req`) as children of the root
- Six default phase epics (`forge:phase`): Foundation, Initialization, Planning, Execution, Observability, Polish
- Sequential `blocks` dependencies between phases
- Vision stored via `bd remember`

**Alias**: `init`

```bash
# Interactive mode (TTY required — prompts for vision, description, requirements)
gsd2b new-project

# Non-interactive / agent mode
gsd2b new-project --auto \
  --vision "A task management API" \
  --description "REST API with auth and CRUD operations" \
  --file requirements.txt

# Alias
gsd2b init --auto --vision "My project"
```

**Options:**

| Flag | Description |
|------|-------------|
| `--vision <text>` | One-line vision statement (required in `--auto` mode) |
| `--description <text>` | Extended project description |
| `--file <path>` | Path to a requirements file to ingest |
| `--auto` | Non-interactive mode — skips all prompts |
| `--help` | Show help |

> `--json` is not available for `new-project`. Output is always plain text.

---

### milestone

Manage delivery milestones (stored as `forge:milestone` epics).

```bash
gsd2b milestone --help
```

#### milestone create

```bash
gsd2b milestone create \
  --title "v1.0 Public Launch" \
  --description "Everything needed for the first public release" \
  --req PROJECT-abc \
  --req PROJECT-def
```

**Options:**

| Flag | Description |
|------|-------------|
| `--title <text>` | Milestone title (required) |
| `--description <text>` | Milestone description |
| `--req <id>` | Requirement bead ID to link via `validates` dep (repeatable) |
| `--help` | Show help |

#### milestone list

```bash
gsd2b milestone list
```

Lists all `forge:milestone` beads with their status.

#### milestone complete

```bash
gsd2b milestone complete MILESTONE_ID
```

Closes the milestone bead and prints an audit summary of child bead counts (total / open / closed).

> `--json` is not available for `milestone` subcommands.

---

### plan-phase

Plan a phase by recording context and creating task beads.

```bash
gsd2b plan-phase --help
```

#### plan-phase discuss

Capture research findings, constraints, key decisions, and scope notes for a phase. The context is stored as notes on the phase bead.

```bash
# Interactive (prompts for each field)
gsd2b plan-phase discuss PHASE_ID

# Non-interactive / agent mode
gsd2b plan-phase discuss PHASE_ID --auto \
  --research "Reviewed auth libraries; chose JWT" \
  --constraints "Must use PostgreSQL; 2-week timeline" \
  --decisions "Use bcrypt for password hashing" \
  --scope "Login and registration only; no OAuth in this phase"
```

**Options:**

| Flag | Description |
|------|-------------|
| `--phase <id>` | Phase bead ID (alternative to positional arg) |
| `--auto` | Non-interactive mode |
| `--research <text>` | Research findings (required in `--auto` mode) |
| `--constraints <text>` | Constraints for this phase |
| `--decisions <text>` | Key decisions made |
| `--scope <text>` | Scope notes (what is in/out) |
| `--help` | Show help |

#### plan-phase create-tasks

Create task beads as children of a phase, with optional requirement links and sequential ordering.

```bash
# Single task
gsd2b plan-phase create-tasks PHASE_ID \
  --task "Implement login endpoint|POST /auth/login|Returns JWT on success|REQ-001"

# Multiple tasks with sequential blocking deps
gsd2b plan-phase create-tasks PHASE_ID \
  --task "Schema migration|Add users table|Migration runs cleanly|REQ-001" \
  --task "Auth service|Implement JWT logic|Tokens issued correctly|REQ-001,REQ-002" \
  --task "Integration tests|Test auth flow end-to-end|All tests pass|REQ-001" \
  --chain

# Tasks from a JSON array
gsd2b plan-phase create-tasks PHASE_ID \
  --tasks-json '[{"title":"Task A","description":"desc","acceptance_criteria":"ac","reqIds":["REQ-001"]}]'
```

Task spec format for `--task`: `"title|description|acceptance_criteria|req1,req2"`

**Options:**

| Flag | Description |
|------|-------------|
| `--task "<spec>"` | Task spec string (repeatable) |
| `--tasks-json <json>` | JSON array of task specs |
| `--chain` | Add sequential `blocks` deps between tasks |
| `--help` | Show help |

> `--json` is not available for `plan-phase` subcommands.

---

### execute-phase

Execute phase tasks with git branch management and wave-based dispatch.

```bash
gsd2b execute-phase --help
```

#### execute-phase start

Validates the phase has open tasks, creates a `phase/<PHASE_ID>` git branch, and marks the phase `in_progress`.

```bash
gsd2b execute-phase start PHASE_ID

# Fork from a specific base branch
gsd2b execute-phase start PHASE_ID --base-branch main
```

**Options:**

| Flag | Description |
|------|-------------|
| `--base-branch <branch>` | Branch to fork from (default: current branch) |
| `--help` | Show help |

#### execute-phase run

Dispatches tasks in dependency-aware waves. Each task is marked `in_progress`, then `closed`, and a git commit is created.

```bash
# Preview the wave plan without executing
gsd2b execute-phase run PHASE_ID --dry-run

# Execute
gsd2b execute-phase run PHASE_ID
```

**Options:**

| Flag | Description |
|------|-------------|
| `--dry-run` | Show wave plan without executing |

Must be called from a `phase/` git branch (created by `execute-phase start`).

#### execute-phase finish

Verifies all child tasks are closed, closes the phase bead, and prints a merge suggestion.

```bash
gsd2b execute-phase finish PHASE_ID

# Also delete the phase branch after finishing
gsd2b execute-phase finish PHASE_ID --cleanup
```

**Options:**

| Flag | Description |
|------|-------------|
| `--cleanup` | Delete the `phase/<PHASE_ID>` branch after finishing |

After finishing, merge into your main branch:

```bash
git checkout main
git merge phase/PHASE_ID
```

> `--json` is not available for `execute-phase` subcommands.

---

### verify-phase

Verify phase quality before or during execution.

```bash
gsd2b verify-phase --help
```

#### verify-phase check

Reports tasks missing acceptance criteria and open tasks that have AC (incomplete work).

```bash
gsd2b verify-phase check PHASE_ID
```

**Exit code**: 1 if any gaps are found.

Example output:

```
Phase: PROJECT-xyz
Total tasks: 5

Tasks missing acceptance criteria (1):
  PROJECT-t01  [open]  Refactor utils

Open tasks with acceptance criteria — incomplete work (2):
  PROJECT-t02  [open]  Add auth middleware
  PROJECT-t03  [open]  Write integration tests

Summary: 3 gap(s) found.
```

#### verify-phase coverage

Reports `forge:req` beads that have no `validates` links from tasks in this phase.

```bash
gsd2b verify-phase coverage PHASE_ID
```

**Exit code**: 1 if uncovered requirements are found.

Example output:

```
Phase: PROJECT-xyz
Total forge:req beads: 3

Covered requirements (2):
  PROJECT-r01  [open]  User authentication
  PROJECT-r02  [open]  Token refresh

Uncovered requirements — no validates links from phase tasks (1):
  PROJECT-r03  [open]  Password reset

Summary: 1 uncovered requirement(s).
```

> `--json` is not available for `verify-phase` subcommands.

---

### dashboard

High-level views of phase and project health.

```bash
gsd2b dashboard --help
```

#### dashboard show

Print task counts and completion percentage for a phase.

```bash
gsd2b dashboard show PHASE_ID
```

Example output:

```
Phase PROJECT-xyz — Dashboard Summary
  Total    : 8
  Open     : 3
  Closed   : 4
  Blocked  : 1
  Coverage : 50%
```

#### dashboard blockers

List all blocked child beads in a phase.

```bash
gsd2b dashboard blockers PHASE_ID
```

#### dashboard phases

List all `forge:phase` beads across the project with per-phase task summaries.

```bash
gsd2b dashboard phases
```

Example output:

```
Phases:
  PROJECT-p01  [closed]       Phase: Foundation      (open: 0, closed: 5, blocked: 0, 100%)
  PROJECT-p02  [in_progress]  Phase: Initialization  (open: 3, closed: 4, blocked: 1, 57%)
  PROJECT-p03  [open]         Phase: Planning        (open: 0, closed: 0, blocked: 0, 0%)
```

> `--json` is not available for `dashboard` subcommands.

---

## Context Engineering with Beads

`gsd2b` uses the `bd` CLI for all state management. You can use `bd` commands directly to prime context for AI agents, store and recall project memory, and inspect the bead graph.

### prime-context

Use `bd show` to load a bead's full context into the AI agent's working memory:

```bash
# Show a phase with all its details (includes notes from plan-phase discuss)
bd show PHASE_ID

# Show a task including acceptance criteria
bd show TASK_ID --json

# List all beads under a phase
bd children PHASE_ID

# Show the dependency tree
bd tree PROJECT_ID
```

### remember / recall

`gsd2b new-project` stores the project vision automatically via `bd remember`. Use `bd remember` and `bd recall` directly for additional context:

```bash
# Store a key decision
bd remember "forge:project:PROJECT-001:auth-decision" "We chose JWT with RS256"

# Recall it later
bd recall "forge:project:PROJECT-001:auth-decision"

# Store phase-level research
bd remember "forge:phase:PHASE-001:research" "Reviewed 3 auth libraries; jose is best fit"
```

---

## JSON Output

The `--json` flag is supported by the top-level informational commands:

| Command | `--json` supported | Output shape |
|---------|-------------------|--------------|
| `gsd2b help` | Yes | `{ commands: [{ name, description }] }` |
| `gsd2b version` | Yes | `{ version: "0.1.0" }` |
| `gsd2b status` | Yes | `{ status, stats, ready }` |
| `gsd2b new-project` | No | plain text only |
| `gsd2b milestone *` | No | plain text only |
| `gsd2b plan-phase *` | No | plain text only |
| `gsd2b execute-phase *` | No | plain text only |
| `gsd2b verify-phase *` | No | plain text only |
| `gsd2b dashboard *` | No | plain text only |

For machine-readable output from subcommands, use the underlying `bd` CLI directly — most `bd` commands support `--json`.

---

## Typical Project Lifecycle

```
gsd2b new-project
  creates: project epic, requirements (forge:req), 6 phase epics (forge:phase)
  stores:  vision via bd remember

gsd2b milestone create --title "v1.0" --req REQ-001
  creates: forge:milestone with validates links to requirements

--- repeat for each phase ---

gsd2b plan-phase discuss PHASE_ID
  stores:  research, constraints, decisions, scope as phase notes

gsd2b plan-phase create-tasks PHASE_ID --task "..." --chain
  creates: task beads as children with optional sequential deps

gsd2b verify-phase check PHASE_ID
gsd2b verify-phase coverage PHASE_ID
  checks:  all tasks have AC; all requirements have validates links

gsd2b execute-phase start PHASE_ID
  creates: phase/PHASE_ID git branch, marks phase in_progress

gsd2b execute-phase run PHASE_ID
  dispatches: tasks in dependency waves, commits each task

gsd2b execute-phase finish PHASE_ID
  closes:  phase bead, prints merge suggestion

git checkout main && git merge phase/PHASE_ID

--- after all phases ---

gsd2b milestone complete MILESTONE_ID
  closes:  milestone, prints child bead audit summary

gsd2b dashboard phases
  shows:   completion rates across all phases
```
