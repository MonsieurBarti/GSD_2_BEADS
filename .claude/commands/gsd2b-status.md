---
name: gsd2b-status
description: Show current GSD2B project state via bd queries
allowed-tools:
  - Bash
---

Show the current project status by running these commands:

```bash
bd stats
bd ready
bd list --status=in_progress
```

Summarize the project state: how many issues are open, in progress, blocked, and closed. List any ready work and current in-progress items.
