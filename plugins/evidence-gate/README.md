# Evidence Gate

A hook that stops "done" from meaning "I think it's done".

**As a plugin** (recommended): `claude plugin marketplace add romajure/hookcrate` then `claude plugin install evidence-gate@hookcrate`. Both hook events are registered by `hooks/hooks.json`. Requires bun.

**As a single file:** copy `scripts/evidence-gate.ts` to `.claude/hooks/` in your project and add the settings fragment below.

## How it works

1. Keep a checklist file in the project root: `ISA.md`, `CHECKLIST.md`, `TODO.md` or `TASK.md` (or point `EVIDENCE_GATE_FILE` at any path).
2. Write criteria as checkboxes. Put the proof under each one as an `evidence:` line:

   ```markdown
   status: in-progress

   ## Criteria
   - [x] Unit tests pass
     evidence: `bun test` → 42 pass, 0 fail (2026-03-02 11:40)
   - [ ] Deployed to staging
   ```

3. When the work is finished, change `status: in-progress` to `status: complete`.
4. The gate now checks every criterion. If any is unchecked, or checked without evidence, Claude is blocked from stopping and sees the exact list of offenders.

While `status` is anything other than complete/done the gate is silent, so it never nags mid-task.

## Events

| Event | Matcher | Behaviour |
|-------|---------|-----------|
| `Stop` | all | Exit 2 + `{"decision":"block"}` when the checklist declares completion but criteria are unproven. |
| `PostToolUse` | `Edit\|Write\|MultiEdit` | Same check, but only when the edited file *is* the checklist — catches premature `status: complete` immediately. |

## Settings

```json
{
  "hooks": {
    "Stop": [{ "matcher": "", "hooks": [{ "type": "command", "command": "bun \"${CLAUDE_PROJECT_DIR}/.claude/hooks/evidence-gate.ts\"", "timeout": 20 }] }],
    "PostToolUse": [{ "matcher": "Edit|Write|MultiEdit", "hooks": [{ "type": "command", "command": "bun \"${CLAUDE_PROJECT_DIR}/.claude/hooks/evidence-gate.ts\"", "timeout": 20 }] }]
  }
}
```

## Environment

- `EVIDENCE_GATE_FILE` — explicit checklist path (relative to the project).
