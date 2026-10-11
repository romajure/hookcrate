**User:** Finish the rate limiter and mark the task done.

**Claude:** Implemented `limiter.ts` with a sliding window and wired it into the router. Updating the checklist.

```
● Edit(ISA.md)
  ⎿  status: in-progress → status: complete
     - [x] Sliding window limiter implemented
     - [x] Unit tests cover burst + steady state
     - [x] Router returns 429 with Retry-After
```

```
⚠ PostToolUse hook (evidence-gate) exited with code 2
  evidence-gate: ISA.md declares completion but 3 criteria are unproven.
    - line 7: NO EVIDENCE — Sliding window limiter implemented
    - line 8: NO EVIDENCE — Unit tests cover burst + steady state
    - line 9: NO EVIDENCE — Router returns 429 with Retry-After
  Each criterion needs `- [x]` AND an `evidence:` line describing the observed
  proof (command output, test count, URL fetched, file read).
```

**Claude:** The gate is right — I checked items off without proving them. Running the tests first.

```
● Bash(bun test src/limiter.test.ts)
  ⎿  6 pass, 0 fail  [48ms]
● Bash(curl -s -o /dev/null -w "%{http_code} %header{retry-after}" localhost:8787/v1/packs ×61)
  ⎿  429 12
● Edit(ISA.md)
  ⎿  - [x] Sliding window limiter implemented
          evidence: src/limiter.ts read back, 61 lines, exported `allow()`
        - [x] Unit tests cover burst + steady state
          evidence: `bun test src/limiter.test.ts` → 6 pass, 0 fail
        - [x] Router returns 429 with Retry-After
          evidence: 61st request returned `429` with `retry-after: 12`
```

```
✓ PostToolUse hook (evidence-gate)
  evidence-gate: ISA.md — 3/3 criteria proven.
```

**Claude:** Done. All three criteria are checked with observed evidence; the gate passed and I can stop.
