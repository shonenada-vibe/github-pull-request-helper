## 2026-06-29 — Full initial implementation (tasks 01–12)

All twelve roadmap tasks were implemented and verified together in one session.

### What was done
- **01 scaffold:** WXT (MV3) + Svelte 5 + Tailwind v4 + Bun + TS strict. `wxt.config.ts`,
  `tsconfig.json` (extends `.wxt`, includes `.wxt/**/*` for auto-import globals),
  content match `https://github.com/*`, `storage` permission + API host permissions.
- **02 storage/settings:** `lib/storage.ts` (typed Settings, defaults, cache by SHA,
  `hasCredentials`) + `entrypoints/options/` Svelte page with masked key inputs, model
  (default `claude-opus-4-8`) and effort selectors.
- **03 messaging:** `lib/messaging.ts` discriminated-union ANALYZE/RESULT/ERROR +
  OPEN_OPTIONS, typed `sendAnalyze` / `onAnalyze` / guards.
- **04 github client:** `lib/github/client.ts` — PR metadata + paginated files + commits,
  `parseLinkedIssues`, typed `GithubApiError` with rate-limit detection. Injectable fetch.
- **05 diff parser:** `lib/diff/parse-diff.ts` pure `parseHunks` (per-file patch → hunks).
- **06 heuristics:** `lib/heuristics/classify.ts` — lockfiles / generated / renames / binaries
  → mechanical; `partitionFiles`.
- **07 grouping schema:** `lib/grouping/{types,schema,prompt,validate}.ts` — JSON schema
  (`additionalProperties:false`), stable system prompt, client-side validator.
- **08 anthropic client:** `lib/anthropic/client.ts` — SDK call with
  `dangerouslyAllowBrowser`, adaptive thinking, `output_config.format` = json_schema,
  effort; injectable `createMessage`; typed `AnthropicError`.
- **09 pipeline:** `lib/pipeline.ts` — fetch → classify → (LLM on interesting only) →
  append mechanical group → cache by head SHA. All side effects injected.
- **10 content detection:** `entrypoints/github.content.ts` — `parsePrPath`/`isFilesTab`,
  `wxt:locationchange` for Turbo/PJAX soft nav, single Shadow-DOM mount, stale-response guard.
- **11 panel UI:** `components/Panel.svelte` + `GroupCard.svelte` — intent, changeType badge,
  clickable reading order (scrolls via `scroll-to-file.ts`), collapsible groups, mechanical
  folded. Tailwind scoped in the shadow root.
- **12 error UX:** missing-credentials → "Open settings", typed error messages + Retry,
  refresh bypasses cache.

### Testing (all executed, green)
- `bunx svelte-check`: **0 errors, 0 warnings**.
- `bunx eslint .`: clean.
- `bunx vitest run`: **50 tests passing** across 11 files — pure lib (diff, heuristics,
  grouping validate, github client, anthropic parse, pipeline, storage, messaging, pr-url)
  plus jsdom component tests (`Panel.test.ts`: loading / missing-creds CTA / ready / jump;
  `scroll-to-file.test.ts`).
- `bunx wxt build`: production build succeeds (manifest, options, background, content+css).
- `bunx playwright test`: 2 build-artifact e2e checks pass (manifest wiring + emitted bundles).

### Notes for future agents
- **One thing NOT verified here:** loading the unpacked extension in a real browser against
  live GitHub (no GUI browser in this environment). The panel render/error/jump logic is
  covered headlessly by the jsdom tests; the live smoke test is documented in
  `tests/e2e/README.md` — run `make dev`, load `.output/chrome-mv3/`, add keys, open a PR.
- **Dependency pins that matter:** WXT 0.20.27 needs **Vite 6** (`defaultClientConditions`);
  `@sveltejs/vite-plugin-svelte` pinned to **^5** (v7 needs Vite 7+ env API). Both enforced
  via `overrides` in `package.json`. Don't bump Vite to 7/8 without bumping WXT.
- **Known limitation:** Claude is called directly from the browser, so the Anthropic key is
  client-side (documented in README/PROJECT_CONTEXT). Backend proxy is the post-MVP path.
- `scroll-to-file.ts` selectors are best-effort against GitHub's DOM; revisit if GitHub
  changes its Files-changed markup.
