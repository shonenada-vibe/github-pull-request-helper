## 2026-06-29 — Task 13: OpenAI-compatible provider

### What was done
- **Settings:** added `Provider = 'anthropic' | 'openai'` and OpenAI fields
  (`openaiApiKey`, `openaiBaseUrl` default `https://api.openai.com/v1`, `openaiModel`).
  `hasCredentials` now branches by provider (OpenAI requires key + base URL + model).
- **`lib/openai/client.ts`:** raw `fetch` to `POST {baseUrl}/chat/completions` with
  `response_format: json_schema` (strict) reusing `GROUPING_SCHEMA`; parses via the shared
  `parseGroupingResponse` validator. Typed `OpenAIError` with rate-limit flag. Injectable fetch.
- **`lib/llm/dispatch.ts`:** `requestGroupingForSettings` routes to the Anthropic SDK client or
  the OpenAI client based on `settings.provider`. Pipeline now takes a provider-agnostic
  `{ settings, system, userContent }` arg; background wires the dispatcher and maps `OpenAIError`
  (and 429s) to error kinds.
- **Options page:** provider selector with conditional Anthropic / OpenAI-compatible fieldsets.
- **Permissions:** `optional_host_permissions: ['https://*/*','http://*/*']` + `api.openai.com` in
  `host_permissions`. Custom base URLs are granted at runtime via `browser.permissions.request`
  on save (`lib/host-permission.ts` → `originPattern`).

### Testing (all executed, green)
- `svelte-check`: 0 errors, 0 warnings.
- `eslint`: clean.
- `vitest`: **60 tests** (added OpenAI client ×5, dispatcher routing ×2, host-permission ×2,
  provider-aware `hasCredentials`).
- `wxt build`: succeeds (manifest grows to include OpenAI host perms).
- `playwright`: 2 build-artifact e2e checks still pass.

### Notes
- Kept Anthropic on the official SDK; OpenAI-compatible uses raw fetch for max portability across
  compatible servers (OpenRouter, Together, LM Studio, Ollama) and to avoid a second dependency.
- `effort` applies to Anthropic only. The OpenAI client sends `json_schema` structured output; the
  system prompt also demands JSON, so servers that ignore `response_format` still parse.
- Same client-side-key limitation applies to the OpenAI key; backend proxy remains the post-MVP path.
- The runtime host-permission grant flow couldn't be exercised headlessly (no browser); the pure
  `originPattern` helper is unit-tested and the flow is wired for the live extension.
