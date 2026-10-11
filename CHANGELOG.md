# Changelog

All notable changes to the plugins in this repository. Versions follow each plugin's `plugin.json`.

## 1.0.0 — 2026-10-11

### credential-guard
- Initial release. PreToolUse hook for `Bash`, `WebFetch` and HTTP-style MCP tools.
- Detects Stripe (`sk_live_`, `rk_live_`, `sk_test_`), OpenAI/Anthropic-style `sk-` keys, AWS access keys, GitHub tokens, Slack tokens, Google API keys, private-key blocks, raw bearer tokens and basic-auth URLs.
- Allowlists `$VAR` / `${VAR}` / `%VAR%` / `$env:VAR` references by construction; project allowlist at `.claude/credential-guard.allow`.
- Redacted JSONL audit log at `.claude/logs/credential-guard.jsonl`.

### evidence-gate
- Initial release. Stop + PostToolUse hook.
- Parses `- [ ]` / `- [x]` criteria with `evidence:` continuation lines from `ISA.md`, `CHECKLIST.md`, `TODO.md`, `TASK.md` or `EVIDENCE_GATE_FILE`.
- Engages only when the file declares `status: complete` / `phase: complete`; lists every unchecked or unevidenced criterion with its line number.
- Emits both `{"decision":"block"}` and exit 2; shortens the message when `stop_hook_active` is set.
