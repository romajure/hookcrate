# HookCrate — free hooks for Claude Code

Two production-grade [Claude Code hooks](https://code.claude.com/docs/en/hooks), MIT licensed, packaged as a plugin marketplace so you can install them by name and get updates with one command.

| Plugin | Event | What it does |
|--------|-------|--------------|
| **credential-guard** | `PreToolUse` | Blocks `curl`, `wget`, `scp`, `Invoke-WebRequest` and HTTP tool calls that carry a literal API key or token (Stripe, AWS, GitHub, Slack, Google, OpenAI-style, raw bearer tokens, private-key blocks). `$VAR` references pass. Every decision goes to a local JSONL log with the secret redacted. |
| **evidence-gate** | `Stop`, `PostToolUse` | Refuses to let Claude mark a task complete while a checklist (`ISA.md`, `CHECKLIST.md`, `TODO.md`) has unchecked items or checked items without an `evidence:` line — and names exactly which ones. Silent until the checklist says `status: complete`. |

Both are single TypeScript files with no dependencies, run with [bun](https://bun.sh), and follow the documented hook contract: JSON on stdin, exit 0 to allow, exit 2 to block with the reason on stderr.

## Install as a plugin

Requires Claude Code and bun on your PATH.

```
claude plugin marketplace add romajure/hookcrate
claude plugin install credential-guard@hookcrate
claude plugin install evidence-gate@hookcrate
```

Or both steps at once from inside a session: `/plugin install credential-guard --marketplace romajure/hookcrate`.

Update later with `claude plugin update credential-guard@hookcrate`. Each plugin's `hooks/hooks.json` registers its hook; nothing is written to your `settings.json`.

## Install without the plugin system

Copy the script into your project and register it yourself. The per-plugin READMEs give the exact `settings.json` fragment:

- [plugins/credential-guard/README.md](plugins/credential-guard/README.md)
- [plugins/evidence-gate/README.md](plugins/evidence-gate/README.md)

The same two hooks are also in the HookCrate CLI catalog, which installs into `.claude/hooks/` and prints the settings fragment:

```
curl -fsSL https://hookcrate.com/install | bash
hookcrate install credential-guard
```

## See them in action

Each plugin ships a `PREVIEW.md` — a realistic sample session showing the hook firing, what Claude sees, and how it recovers.

## Six more packs

These two hooks are the free tier of [HookCrate](https://hookcrate.com), a small paid catalog of Claude Code skills and workflow packs: reproduce-first debugging, a research fleet with URL verification, cross-session context recall, a CLAUDE.md audit, a pre-publish personal-data scrub, and a weekly review workflow. Everything in this repository stays free and MIT; the paid packs fund maintenance. Details and pricing are on the site.

## Contributing

Bug reports and pull requests are welcome. Keep each hook a single dependency-free file, add or update a case in `tests/hooks.test.ts` (every behaviour is tested by running the script against a stdin payload and asserting the exit code), and run `bun test` before opening a PR. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE).
