# Workflow

How a change moves from idea to merge. The rules are in [`../AGENTS.md`](../AGENTS.md); the shared process comes from [dylannlaw/agent-skills](https://github.com/dylannlaw/agent-skills).

```
request
  │
  ▼
1. Read      docs/README.md → source-of-truth docs → the code and its tests
2. Triage    trivial · routine · planned  (decides the plan and the model per step)
3. Plan      docs/plans/<name>.md                  (planned lane only)
4. Build     smallest change that meets the plan
5. Verify    the verify command in standard.json + look at any UI
6. Document  README.md and every doc whose subject changed
7. Record    docs/changes/YYYY-MM-DD-<name>.md + one line in docs/README.md
8. PR        template checklist · CI green · review · squash merge
```

## Which model does what

| Step | Tier | Why |
|---|---|---|
| Format, lint autofix | no model (hook or command) | deterministic |
| Run verify, summarise failures | small | keeps long logs out of the main context |
| Fix lint, type and format errors | small | mechanical |
| Change note and README lines | small | follows a template |
| Build a planned step | medium | routine code |
| Plan, review | large | judgement |

## Rules of thumb

- **History is append-only.** Never delete a change note or plan. Mark it superseded and link the replacement.
- **Say what you didn't check.** "Not verified" is a required section.
- **The README describes now, notes describe then.**
- **If it isn't in `docs/`, it didn't happen.**
