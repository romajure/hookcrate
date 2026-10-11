# Contributing

Thanks for taking the time.

## Ground rules

- **One file per hook, no dependencies.** Each hook is a standalone TypeScript script under `plugins/<name>/scripts/`. It reads the hook JSON from stdin and signals with the exit code (0 allow, 2 block). Keep it that way so people can also copy a single file into a project.
- **Never block on your own bug.** Malformed stdin, missing files and internal errors must exit 0 (or 1 for non-blocking errors), never 2. There is a test for this.
- **Tests run the real script.** `tests/hooks.test.ts` spawns each hook with a sample payload and asserts the exit code, stdout JSON and stderr text. Add a case for every new behaviour.
- **Hook contract.** Follow https://code.claude.com/docs/en/hooks and cite it in the script header when you rely on a detail.

## Workflow

```
bun test                                  # all hook tests
claude plugin validate .                  # marketplace + both plugin manifests
claude plugin validate ./plugins/<name>   # one plugin
```

Try a change live without installing: `claude --plugin-dir ./plugins/credential-guard`.

## Versioning

Bump `version` in the plugin's `.claude-plugin/plugin.json` and in the matching entry of `.claude-plugin/marketplace.json` for any user-visible change, and add a line to `CHANGELOG.md`. Users only receive updates when the version changes.

## Scope

New detectors for credential-guard and new checklist conventions for evidence-gate are welcome. New hooks are better proposed in an issue first.
