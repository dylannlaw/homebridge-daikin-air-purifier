# Workflow

How a change moves from idea to merge. The rules are in [`../AGENTS.md`](../AGENTS.md). Anyone can follow it, by hand or with any coding agent.

```
request
  │
  ▼
1. Read      docs/README.md → README.md and config.schema.json → the code and its tests
2. Plan      docs/plans/<name>.md                  (larger changes only)
3. Build     smallest change that meets the plan
4. Verify    npm run lint && npm test
5. Document  README.md and every doc whose subject changed
6. Record    docs/changes/YYYY-MM-DD-<name>.md + one line in docs/README.md
7. PR        template checklist · CI green · review · squash merge
```

## Rules of thumb

- **History is append-only.** Never delete a change note or plan. Mark it superseded and link the replacement.
- **Say what you didn't check.** "Not verified" is a required section.
- **The README describes now, notes describe then.**
- **If it isn't in `docs/`, it didn't happen.**
