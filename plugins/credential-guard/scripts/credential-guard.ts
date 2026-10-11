#!/usr/bin/env bun
/**
 * credential-guard — Claude Code PreToolUse hook.
 *
 * Denies tool calls that would send a literal secret to an outbound command.
 *
 * Hook contract (https://code.claude.com/docs/en/hooks):
 *   - stdin: one JSON object with `hook_event_name: "PreToolUse"`, `tool_name`,
 *     `tool_input` (tool-specific; for Bash it has `command`), `cwd`, `session_id`.
 *   - Exit 0 = allow (stdout may carry JSON such as
 *     {"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny",
 *     "permissionDecisionReason":"..."}}).
 *   - Exit 2 = block the tool call; stderr is shown to Claude as the reason.
 *     "Exit 2 blocks even if the JSON says allow."
 *   - Other exit codes = non-blocking error, the call proceeds.
 *   We emit the JSON deny object AND exit 2, so the block is unambiguous.
 *
 * Allowlist: `$VAR`, `${VAR}`, `%VAR%`, `$env:VAR` references are never secrets.
 * A project file `.claude/credential-guard.allow` (one literal or /regex/ per
 * line) whitelists known-safe values such as published test keys.
 *
 * Audit log: `.claude/logs/credential-guard.jsonl` (override with
 * CREDENTIAL_GUARD_LOG). Secrets are redacted to their first 6 characters.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

interface HookInput {
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  cwd?: string;
  session_id?: string;
}

export interface SecretHit {
  kind: string;
  redacted: string;
}

export interface Verdict {
  decision: "allow" | "deny";
  reason: string;
  hits: SecretHit[];
  outbound: boolean;
}

/** Patterns for well-known credential shapes. Order matters only for the label. */
export const SECRET_PATTERNS: Array<{ kind: string; re: RegExp }> = [
  { kind: "stripe-live-secret", re: /\bsk_live_[A-Za-z0-9]{10,}\b/g },
  { kind: "stripe-restricted", re: /\brk_live_[A-Za-z0-9]{10,}\b/g },
  { kind: "stripe-test-secret", re: /\bsk_test_[A-Za-z0-9]{10,}\b/g },
  { kind: "openai-style-key", re: /\bsk-(?:proj-|ant-|or-v1-)?[A-Za-z0-9_-]{20,}\b/g },
  { kind: "aws-access-key", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { kind: "github-token", re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b/g },
  { kind: "github-fine-grained", re: /\bgithub_pat_[A-Za-z0-9_]{30,}\b/g },
  { kind: "slack-token", re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g },
  { kind: "google-api-key", re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { kind: "private-key-block", re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY(?: BLOCK)?-----/g },
  // Bearer followed by a literal token (not a $VAR / ${VAR} / %VAR% / $env:VAR reference).
  { kind: "bearer-token", re: /\b[Bb]earer\s+(?![$%])[A-Za-z0-9._~+/=-]{20,}/g },
  { kind: "basic-auth-in-url", re: /\bhttps?:\/\/[^\s/:@]+:(?![$%])[^\s/@]{6,}@[^\s]+/g },
];

/** Commands that move bytes off the machine. Matched at word boundaries. */
const OUTBOUND_RE =
  /(?:^|[\s;&|(`])(?:curl|wget|http|https|xh|httpie|aria2c|scp|sftp|rsync|ftp|nc|ncat|telnet|ssh|Invoke-WebRequest|iwr|Invoke-RestMethod|irm|openssl\s+s_client)(?=\s|$)/m;
const HTTP_TOOL_RE = /fetch|http|curl|request|webhook|post/i;

export function redact(value: string): string {
  if (value.length <= 10) return "***";
  return `${value.slice(0, 6)}…(${value.length} chars)`;
}

export function loadAllowlist(cwd: string): Array<string | RegExp> {
  const file = process.env.CREDENTIAL_GUARD_ALLOW ?? join(cwd, ".claude", "credential-guard.allow");
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => (l.length > 2 && l.startsWith("/") && l.endsWith("/") ? new RegExp(l.slice(1, -1)) : l));
}

export function findSecrets(text: string, allow: Array<string | RegExp> = []): SecretHit[] {
  const hits: SecretHit[] = [];
  for (const { kind, re } of SECRET_PATTERNS) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      const value = m[0];
      const allowed = allow.some((a) => (typeof a === "string" ? value.includes(a) : a.test(value)));
      if (allowed) continue;
      hits.push({ kind, redacted: redact(value) });
    }
  }
  return hits;
}

export function isOutboundCommand(command: string): boolean {
  return OUTBOUND_RE.test(command);
}

export function judge(toolName: string, toolInput: Record<string, unknown>, allow: Array<string | RegExp> = []): Verdict {
  if (toolName === "Bash") {
    const command = String(toolInput.command ?? "");
    const outbound = isOutboundCommand(command);
    if (!outbound) return { decision: "allow", reason: "not an outbound command", hits: [], outbound };
    const hits = findSecrets(command, allow);
    if (hits.length === 0) return { decision: "allow", reason: "no literal secrets", hits, outbound };
    return { decision: "deny", reason: denyMessage(hits, "shell command"), hits, outbound };
  }
  if (HTTP_TOOL_RE.test(toolName)) {
    const serialized = JSON.stringify(toolInput ?? {});
    const hits = findSecrets(serialized, allow);
    if (hits.length === 0) return { decision: "allow", reason: "no literal secrets", hits, outbound: true };
    return { decision: "deny", reason: denyMessage(hits, `${toolName} input`), hits, outbound: true };
  }
  return { decision: "allow", reason: "tool not in scope", hits: [], outbound: false };
}

function denyMessage(hits: SecretHit[], where: string): string {
  const list = hits.map((h) => `${h.kind} ${h.redacted}`).join(", ");
  return (
    `credential-guard: blocked — literal secret in ${where} (${list}). ` +
    `Never paste keys into outbound calls. Put the value in an environment variable and reference it ` +
    `(e.g. -H "Authorization: Bearer $API_KEY"), or add a known-safe test value to .claude/credential-guard.allow.`
  );
}

function logDecision(cwd: string, input: HookInput, verdict: Verdict): void {
  try {
    const file = process.env.CREDENTIAL_GUARD_LOG ?? join(cwd, ".claude", "logs", "credential-guard.jsonl");
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(
      file,
      JSON.stringify({
        ts: new Date().toISOString(),
        session: input.session_id ?? null,
        tool: input.tool_name ?? null,
        decision: verdict.decision,
        outbound: verdict.outbound,
        hits: verdict.hits,
      }) + "\n",
    );
  } catch {
    // Logging must never break the hook.
  }
}

async function main(): Promise<void> {
  let input: HookInput = {};
  try {
    const raw = await Bun.stdin.text();
    input = raw.trim() ? (JSON.parse(raw) as HookInput) : {};
  } catch {
    process.exit(0);
  }
  const cwd = input.cwd ?? process.cwd();
  const toolName = input.tool_name ?? "";
  const verdict = judge(toolName, input.tool_input ?? {}, loadAllowlist(cwd));

  // Only log calls that were actually in scope (outbound), to keep the log useful.
  if (verdict.outbound) logDecision(cwd, input, verdict);

  if (verdict.decision === "deny") {
    console.log(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: verdict.reason,
        },
      }),
    );
    console.error(verdict.reason);
    process.exit(2);
  }
  process.exit(0);
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(`credential-guard: internal error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
