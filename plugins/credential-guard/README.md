# Credential Guard

Stops a literal API key from leaving the machine inside a `curl`, `wget`, `scp`, `Invoke-WebRequest` or HTTP tool call.

**As a plugin** (recommended): `claude plugin marketplace add romajure/hookcrate` then `claude plugin install credential-guard@hookcrate`. The hook is registered by `hooks/hooks.json`; nothing else to configure. Requires bun.

**As a single file:** copy `scripts/credential-guard.ts` to `.claude/hooks/` in your project and add the settings fragment at the bottom of this page.

## What gets blocked

A tool call is denied when **both** are true:

1. It is outbound — a Bash command that invokes `curl`, `wget`, `http(s)`, `xh`, `aria2c`, `scp`, `sftp`, `rsync`, `ftp`, `nc`, `ssh`, `Invoke-WebRequest`/`iwr`, `Invoke-RestMethod`/`irm` or `openssl s_client`; or the tool is `WebFetch` / any tool whose name contains `fetch`, `http`, `curl`, `request`, `webhook` or `post` (MCP HTTP clients).
2. The command or tool input contains a literal secret:

| Kind | Shape |
|------|-------|
| Stripe | `sk_live_…`, `rk_live_…`, `sk_test_…` |
| OpenAI / Anthropic style | `sk-…`, `sk-proj-…`, `sk-ant-…` |
| AWS | `AKIA…` / `ASIA…` (16 uppercase alnum) |
| GitHub | `ghp_…`, `gho_…`, `github_pat_…` |
| Slack | `xoxb-…`, `xoxp-…`, `xoxa-…` |
| Google | `AIza…` (39 chars) |
| Private keys | `-----BEGIN … PRIVATE KEY-----` |
| Raw bearer | `Bearer <20+ literal chars>` |
| Basic auth in URL | `https://user:password@host` |

## What always passes

- `$VAR`, `${VAR}`, `%VAR%`, `$env:VAR` references — the bearer and URL patterns explicitly exclude them.
- Non-outbound commands (`git`, `bun test`, `ls`…) even if they contain key-shaped strings.
- Values listed in `.claude/credential-guard.allow` (see `credential-guard.allow.example`).

## Audit log

Every in-scope decision is appended to `.claude/logs/credential-guard.jsonl`:

```json
{"ts":"2026-03-02T10:14:05.120Z","session":"5b1c…","tool":"Bash","decision":"deny","outbound":true,"hits":[{"kind":"openai-style-key","redacted":"sk-abc…(51 chars)"}]}
```

Override the path with `CREDENTIAL_GUARD_LOG`, the allowlist with `CREDENTIAL_GUARD_ALLOW`.

## Settings

```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Bash|WebFetch|.*(fetch|http|curl|request).*",
      "hooks": [{ "type": "command", "command": "bun \"${CLAUDE_PROJECT_DIR}/.claude/hooks/credential-guard.ts\"", "timeout": 10 }]
    }]
  }
}
```
