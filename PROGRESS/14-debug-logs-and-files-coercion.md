## 2026-06-30 — Debug logging + resilient grouping parse

### Reported bug
`Invalid grouping response: groups[0].files must be string[]` — the model (or a
non-strict OpenAI-compatible server) returned `files` as something other than a
flat `string[]` (commonly `[{ "path": "…" }]`), and the strict validator threw.

### What was done
- **Resilient `files` coercion (`lib/grouping/validate.ts`):** `coerceFiles` now
  accepts `string[]`, an array of `{path|filename|file|name}` objects, or a single
  delimited string; `null`/missing → `[]`. Only genuinely unusable entries throw.
  Validation errors now also carry the raw model text (`GroupingValidationError.raw`).
- **UI debug logging:**
  - `messaging.ts`: `RESULT` now carries a `DebugInfo` (provider, model, file counts,
    usedLlm, fromCache, durationMs); `ERROR` carries an optional `detail` (raw model
    output snippet).
  - `pipeline.ts`: returns `diagnostics` (counts + provider/model + usedLlm) on every
    path (partition computed before the cache check).
  - `background.ts`: times the run, attaches `debug`, and on a `GroupingValidationError`
    attaches the raw output (capped at 2000 chars) as `detail`.
  - `panel-state.svelte.ts`: `logs[]` + `pushLog()` (also `console.debug`), plus
    `debug`/`detail`.
  - `github.content.ts`: logs analyze start, round-trip timing + diagnostics, errors,
    stale-response skips, and messaging-channel failures.
  - `Panel.svelte`: collapsible **Debug log** section (with Copy) and a **Raw model
    output** block that auto-expands when a parse failure captured one.

### Testing (all executed, green)
- `vitest`: **64 tests** (added files-coercion ×2, raw-on-error ×1, Panel debug ×1).
- `svelte-check`: 0 errors. `eslint`: clean. `wxt build`: ok. `playwright`: 2 pass.

### Notes
- The coercion makes the OpenAI-compatible path far more forgiving of servers that
  ignore `response_format`. If a failure still occurs, the raw output is now visible in
  the panel's Debug section and the console (`[github-differ]`), which is the fastest way
  to see exactly what the model returned.
