**User:** Check whether our billing API accepts the new key. It's in `.env` as `BILLING_KEY`.

**Claude:** I'll read the key and call the health endpoint.

```
● Bash(grep BILLING_KEY .env)
  ⎿  BILLING_KEY=sk_live_<redacted>
● Bash(curl -s -H "Authorization: Bearer sk_live_<redacted>" https://api.billing.example/v1/health)
```

```
⛔ PreToolUse hook (credential-guard) blocked the tool call
  credential-guard: blocked — literal secret in shell command
  (stripe-live-secret sk_liv…(42 chars), bearer-token Bearer…(49 chars)).
  Never paste keys into outbound calls. Put the value in an environment
  variable and reference it (e.g. -H "Authorization: Bearer $API_KEY").
```

**Claude:** Good catch — I shouldn't put the live key into the command line where it lands in shell history and the transcript. Sourcing it from the environment instead.

```
● Bash(set -a; source .env; set +a; curl -s -H "Authorization: Bearer $BILLING_KEY" https://api.billing.example/v1/health)
  ⎿  {"status":"ok","key_last4":"sD6f","mode":"live"}
```

```
✓ PreToolUse hook (credential-guard) allowed
  (logged to .claude/logs/credential-guard.jsonl: decision=allow, outbound=true)
```

**Claude:** The billing API accepts the key: `status: ok`, mode `live`, key ending `sD6f`. The literal value never left the environment variable.
