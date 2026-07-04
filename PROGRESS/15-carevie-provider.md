## 2026-07-04 — Carevie review-service provider

### Request
Add a third AI provider backed by the Carevie review API:
`GET https://carevie.dolpc.com/api/review-files?provider=github&repo=<owner>/<repo>&pr=<n>`
with `Authorization: Bearer <token>` — the service analyzes the PR server-side,
so unlike Anthropic/OpenAI it takes PR coordinates instead of a prompt.

### What was done
- **`lib/carevie/client.ts`** — `requestGrouping({token, baseUrl, owner, repo, number})`
  builds the review-files URL, sends the bearer GET, maps errors (`CarevieError`
  with 401/403 token hint, 429 → `rateLimited`). `parseCarevieBody` tries the body
  as a grouping response directly, then unwraps one level of a common envelope
  (`data`/`result`/`review`/`analysis`/`grouping`, object or JSON string); on
  failure the full raw body is attached to `GroupingValidationError.raw` so the
  panel's debug section shows exactly what the service returned.
- **`lib/llm/dispatch.ts`** — `RequestGroupingArgs` gains `pr: {owner, repo, number}`
  (Carevie needs coordinates, not a prompt); `DispatchDeps.carevieFetch`; routing.
- **`lib/pipeline.ts`** — passes `pr` coords to `requestGrouping`; diagnostics
  `model` reports `review-files` for the carevie provider.
- **`lib/storage.ts`** — `Provider` adds `'carevie'`; `carevieToken` +
  `carevieBaseUrl` (default `https://carevie.dolpc.com`); `hasCredentials` branch.
- **`lib/messaging.ts` / `entrypoints/background.ts`** — `ErrorKind` adds
  `'carevie'`; `CarevieError` mapped (429 → `rate-limit`).
- **Options UI** — third provider option with token + base URL fields;
  `ensureHostPermission` generalized and requested for the Carevie base URL on save.
- **`wxt.config.ts`** — `https://carevie.dolpc.com/*` added to `host_permissions`
  (custom base URLs still granted at runtime via `optional_host_permissions`).

### Testing (all executed, green)
- `vitest`: **75 tests** (new `lib/carevie/client.test.ts` ×9; dispatch carevie
  route ×1; storage carevie credentials ×1).
- `svelte-check`: 0 errors / 0 warnings. `eslint`: clean. `wxt build`: ok.
  `playwright`: 2 pass.
- Probed the live endpoint without a token: `401` + `www-authenticate: Bearer
  realm="carevie api"`, confirming the auth scheme.

### Notes
- **Assumption:** the service's response body is (or envelopes) JSON matching our
  grouping schema. It could not be verified without a real token. If the real
  shape differs, the error panel now shows the full raw body — paste it into a
  follow-up task and add a mapper in `parseCarevieBody`.
- The GitHub PR is still fetched locally (for classification, the mechanical
  fold-away, and head-SHA caching) even though Carevie re-fetches server-side.

## Addendum (same day) — "Failed to fetch" diagnosis (e05facf)

First live run failed with `Error (unknown): Failed to fetch` — a network-level
TypeError, most likely because the loaded extension predated the manifest's new
`carevie.dolpc.com` host permission, so the background fetch died on CORS.
Hardened in three places:
- background pre-checks the active provider's host permission and returns a
  "re-save options / reload the extension" error naming the missing origin;
- GitHub/OpenAI/Carevie clients wrap network-level rejections into their typed
  errors, naming the unreachable origin (GitHub uses status 0).
77 tests green; typecheck/lint/build clean.
