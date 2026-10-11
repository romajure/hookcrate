#!/usr/bin/env bun
/**
 * evidence-gate — Claude Code hook (Stop + PostToolUse).
 *
 * Blocks "task complete" claims that are not backed by evidence.
 *
 * Hook contract (https://code.claude.com/docs/en/hooks):
 *   - The hook receives one JSON object on stdin with common fields
 *     (`session_id`, `transcript_path`, `cwd`, `hook_event_name`, ...) plus
 *     event-specific fields: PostToolUse has `tool_name`, `tool_input`,
 *     `tool_response`; Stop has `stop_hook_active` and `last_assistant_message`.
 *   - Exit 0 = success. Exit 2 = blocking error: stderr is shown to Claude.
 *     For Stop, exit 2 "prevents Claude from stopping and continues the
 *     conversation". For PostToolUse the tool already ran, but stderr is still
 *     shown to Claude. Any other exit code = non-blocking error.
 *   - Alternatively a JSON object on stdout with `{"decision":"block","reason":"..."}`
 *     blocks a Stop. We use exit 2 + stderr because it is the simplest path that
 *     works for both events, and additionally print the JSON form for Stop.
 *   - Claude Code caps consecutive Stop-hook continuations (8 by default); we
 *     honour `stop_hook_active` by keeping the message short on repeats.
 *
 * Checklist format (ISA.md / CHECKLIST.md / TODO.md or EVIDENCE_GATE_FILE):
 *
 *   status: complete            <- the gate engages only when this is present
 *   ## Criteria
 *   - [x] Build passes
 *     evidence: `bun run build` exit 0, 2026-01-01 14:02
 *   - [x] Tests pass (evidence: bun test → 12 pass, 0 fail)
 *   - [ ] Deployed                  <- unchecked => blocked
 *   - [x] Docs updated              <- checked, no evidence => blocked
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve, basename } from "node:path";

interface HookInput {
  hook_event_name?: string;
  cwd?: string;
  tool_name?: string;
  tool_input?: { file_path?: string };
  stop_hook_active?: boolean;
}

export interface Criterion {
  line: number;
  text: string;
  checked: boolean;
  hasEvidence: boolean;
}

export interface GateResult {
  file: string;
  declaredComplete: boolean;
  criteria: Criterion[];
  problems: string[];
}

const CANDIDATES = ["ISA.md", "CHECKLIST.md", "TODO.md", "TASK.md"];
const ITEM_RE = /^(\s*)[-*+]\s+\[( |x|X)\]\s+(.*)$/;
const EVIDENCE_RE = /\bevidence\s*:/i;
// Accepts `status: complete`, `**Status:** complete`, `- phase = **done**`, `Status: Completed`.
const COMPLETE_RE = /^\s*(?:[-*]\s*)?\**(?:status|phase)\**\s*[:=]\s*\**\s*(complete|completed|done)\b/im;

export function parseChecklist(markdown: string): { declaredComplete: boolean; criteria: Criterion[] } {
  const lines = markdown.split(/\r?\n/);
  const criteria: Criterion[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = ITEM_RE.exec(lines[i] ?? "");
    if (!m) continue;
    const indent = m[1]!.length;
    const text = m[3]!.trim();
    let hasEvidence = EVIDENCE_RE.test(text);
    // Evidence may live on continuation lines indented deeper than the bullet,
    // up to the next bullet at the same or shallower indent.
    for (let j = i + 1; j < lines.length && !hasEvidence; j++) {
      const l = lines[j] ?? "";
      if (l.trim() === "") continue;
      const nm = ITEM_RE.exec(l);
      if (nm && nm[1]!.length <= indent) break;
      const leading = l.length - l.trimStart().length;
      if (leading <= indent && !nm) break;
      if (EVIDENCE_RE.test(l)) hasEvidence = true;
    }
    criteria.push({ line: i + 1, text, checked: m[2] !== " ", hasEvidence });
  }
  return { declaredComplete: COMPLETE_RE.test(markdown), criteria };
}

export function evaluate(markdown: string, file: string): GateResult {
  const { declaredComplete, criteria } = parseChecklist(markdown);
  const problems: string[] = [];
  if (declaredComplete) {
    for (const c of criteria) {
      if (!c.checked) problems.push(`line ${c.line}: UNCHECKED — ${c.text}`);
      else if (!c.hasEvidence) problems.push(`line ${c.line}: NO EVIDENCE — ${c.text}`);
    }
  }
  return { file, declaredComplete, criteria, problems };
}

export function locateChecklist(cwd: string, hint?: string): string | undefined {
  if (process.env.EVIDENCE_GATE_FILE) {
    const p = resolve(cwd, process.env.EVIDENCE_GATE_FILE);
    return existsSync(p) ? p : undefined;
  }
  if (hint && CANDIDATES.includes(basename(hint)) && existsSync(hint)) return hint;
  for (const c of CANDIDATES) {
    const p = join(cwd, c);
    if (existsSync(p)) return p;
  }
  return undefined;
}

function formatProblems(r: GateResult, repeat: boolean): string {
  const head = `evidence-gate: ${basename(r.file)} declares completion but ${r.problems.length} criteria are unproven.`;
  const body = r.problems.map((p) => `  - ${p}`).join("\n");
  const tail = repeat
    ? "Fix the items above (check them off and add an `evidence:` line with what you actually observed), or remove `status: complete`."
    : "Each criterion needs `- [x]` AND an `evidence:` line describing the observed proof (command output, test count, URL fetched, file read). Do not mark the task complete until every item is proven.";
  return `${head}\n${body}\n${tail}`;
}

async function main(): Promise<void> {
  let input: HookInput = {};
  try {
    const raw = await Bun.stdin.text();
    input = raw.trim() ? (JSON.parse(raw) as HookInput) : {};
  } catch {
    // Malformed stdin: never block on our own bug.
    process.exit(0);
  }
  const cwd = input.cwd ?? process.cwd();
  const event = input.hook_event_name ?? "Stop";

  const hint = input.tool_input?.file_path;
  if (event === "PostToolUse") {
    // Only react when the checklist itself was edited.
    if (!hint || !CANDIDATES.includes(basename(hint)) && !(process.env.EVIDENCE_GATE_FILE && resolve(cwd, process.env.EVIDENCE_GATE_FILE) === resolve(hint))) {
      process.exit(0);
    }
  }

  const file = locateChecklist(cwd, hint);
  if (!file) process.exit(0);

  const result = evaluate(readFileSync(file, "utf8"), file);
  if (result.problems.length === 0) {
    if (result.declaredComplete && result.criteria.length > 0) {
      console.log(`evidence-gate: ${basename(file)} — ${result.criteria.length}/${result.criteria.length} criteria proven.`);
    }
    process.exit(0);
  }

  const reason = formatProblems(result, input.stop_hook_active === true);
  if (event === "Stop") {
    // JSON form per docs: {"decision":"block","reason":"..."} — plus exit 2 so the
    // block holds even on older clients that only honour the exit code.
    console.log(JSON.stringify({ decision: "block", reason }));
  }
  console.error(reason);
  process.exit(2);
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(`evidence-gate: internal error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1); // non-blocking
  });
}
