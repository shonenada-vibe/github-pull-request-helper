## 2026-07-04 — Local agent integration (Claude Code / Codex bridge)

### Request
Integrate with a local agent like Codex or Claude Code.

### Design
A browser extension cannot exec a CLI, so the integration is a tiny localhost
HTTP **bridge** (`bridge/server.ts`, run with `make bridge`) that exposes an
OpenAI-compatible `POST /v1/chat/completions` and answers by shelling out to a
headless agent:
- model "claude" → `claude -p --output-format json` (prompt on stdin)
- model "codex" → `codex exec --skip-git-repo-check <prompt>`

The extension gains a fourth provider, **local**, which reuses the existing
OpenAI client pointed at the bridge — so the extension still builds the full
prompt (diff hunks included) and validates the response; the agent needs no
GitHub access. Benefit: no API key stored in the browser; uses the CLI's login.

### What was done
- **`bridge/agent.ts`** (pure, tested): `composePrompt` (messages → one prompt +
  "bare JSON only" instruction), `commandFor(model, prompt)`,
  `extractGroupingJson(stdout)` — handles raw grouping JSON, the `claude -p`
  JSON envelope (grouping inside `.result`, fenced or not), and free-form Codex
  output via a string-aware balanced-brace scanner (keeps the last candidate
  with `groups` + `intent`).
- **`bridge/server.ts`**: node:http server on 127.0.0.1 (PORT, default 8765);
  optional `BRIDGE_TOKEN` bearer auth; `AGENT_TIMEOUT_MS` (default 240s) with
  SIGKILL; permissive CORS; `GET /healthz`; helpful error when the CLI binary
  is missing. Runs under bun (`make bridge`).
- **Extension**: `Provider` adds `'local'`; settings `localBaseUrl`
  (default `http://127.0.0.1:8765/v1`), `localAgent` ('claude'|'codex'),
  `localToken` (optional). Dispatch routes local → OpenAI client with the agent
  as the model. Options fieldset (agent select, bridge URL, optional token,
  how-to-run hint). Manifest adds `http://127.0.0.1/*` + `http://localhost/*`.
  Background host-permission pre-check covers the local base URL; pipeline
  model label = agent name (cache keys therefore separate per agent).
- vitest config now includes `bridge/**/*.test.ts`; tsconfig includes `bridge/`.

### Testing (all executed, green)
- `vitest`: **108 tests** (bridge helpers ×8: prompt, commands, extraction incl.
  envelope/fences/brace-in-string/none; dispatch local route; storage local creds).
- `svelte-check` 0 errors; eslint clean; `wxt build` ok.
- **Live smoke tests**: `/healthz` 200, unknown route 404, missing bearer 401
  when BRIDGE_TOKEN set; full end-to-end `curl → bridge → claude -p → grouping
  JSON` succeeded in ~14.5s (importance field included).

### Notes
- The codex path is wired per current CLI docs (`codex exec`), but was NOT
  executed live here — verify once on a machine with codex installed; if flags
  differ, only `commandFor` needs adjusting.
- The bridge binds to 127.0.0.1 only. Without BRIDGE_TOKEN any local process
  can call it (it can only run the two fixed agent commands); set the token and
  mirror it in the extension options for stricter setups.
