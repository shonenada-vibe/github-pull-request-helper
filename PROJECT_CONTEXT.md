# PROJECT_CONTEXT — github-differ

Technical reference for the project. Read alongside `CLAUDE.md`.

## Problem
PR review is slow because GitHub presents a flat, alphabetical list of changed files. Reviewers
can't tell intent from the diff, and a 400-line mechanical rename buries the 12 lines that actually
change behavior. **github-differ** overlays a structured, ordered review plan on the Files-changed page.

## What it does (MVP scope)
1. Detect a GitHub PR **Files changed** page.
2. Fetch the PR's unified diff, file list, commits, and linked issues via the GitHub REST API.
3. **Heuristic pre-pass (no LLM):** flag mechanical changes — lockfiles, generated files,
   pure-formatting hunks, and pure renames/moves — so they're cheap to set aside.
4. **LLM pass (Claude):** cluster the remaining "interesting" hunks into reviewable groups,
   label each (behavioral / refactor / test / config), and emit a **reading order** with rationale.
5. **Render:** a collapsible side panel injected on the page, with jump links; mechanical groups folded.

Out of scope for MVP: posting back to GitHub, multi-PR dashboards, a hosted backend.

---

## Tech Stack
- **Language:** TypeScript (strict mode).
- **Extension framework:** [WXT](https://wxt.dev) — Manifest V3, cross-browser, HMR, typed `browser.*`.
- **UI:** Svelte (mounted into a Shadow DOM panel via WXT's `createShadowRootUi`) + Tailwind CSS.
- **Package manager / runtime:** Bun.
- **LLM:** Anthropic Claude via `@anthropic-ai/sdk`.
- **GitHub:** plain `fetch` against the REST API (no Octokit dependency in the worker — keep the bundle small).
- **Testing:** `vitest` for unit tests, Playwright for content-script/e2e against fixtures.
- **Lint/format:** ESLint + Prettier.

### Extension architecture (MV3)
- **Background service worker** (`entrypoints/background.ts`): does all network I/O — GitHub fetches and
  Claude calls. Keeps API keys out of the page's JS context. Receives messages from the content script.
- **Content script** (`entrypoints/github.content.ts`): matches `https://github.com/*/*/pull/*/files`,
  detects **soft (Turbo/PJAX) navigation** (GitHub does not full-reload between PRs — listen for
  `turbo:load` / a `MutationObserver` fallback), and mounts the Svelte panel. Requests analysis from
  the background worker and renders the result.
- **Options page** (`entrypoints/options/`): stores the user's GitHub PAT, Anthropic API key, and model
  + effort choice in `browser.storage.local`.

### Data flow
```
content script (detect PR)
   └─> message {type: "ANALYZE", owner, repo, number}
        └─> background worker
              ├─ GitHub REST: diff + files + commits + linked issues
              ├─ diff parser  → structured FileDiff[] / Hunk[]
              ├─ heuristic pre-pass → mechanical vs interesting
              ├─ Claude (interesting hunks) → groups + reading order (JSON)
              └─ cache by PR head SHA in storage
        <─ message {type: "RESULT", grouping}
   └─> Svelte panel renders groups + reading order
```

---

## Anthropic / Claude usage (authoritative — do not guess)
- **Default model:** `claude-opus-4-8` (best grouping reasoning). User-selectable in Options:
  `claude-opus-4-8` ($5/$25 per 1M), `claude-sonnet-4-6` ($3/$15), `claude-haiku-4-5` ($1/$5).
  Default to Opus; only use another model because the user picked it.
- **Thinking:** `thinking: { type: "adaptive" }`. Expose `effort` (`low|medium|high`) in Options;
  default `medium`. Do **not** use `budget_tokens` — it 400s on Opus 4.8.
- **No sampling params** — `temperature`/`top_p`/`top_k` 400 on Opus 4.8. Steer via the prompt.
- **Structured output:** request grouping as JSON via
  `output_config: { format: { type: "json_schema", schema: GROUPING_SCHEMA } }`.
  The schema is the source of truth for the grouping shape (groups[], readingOrder[], labels, fileRefs).
  Remember JSON-schema limits: every object needs `additionalProperties: false`; no min/max or
  string-length constraints (validate those client-side).
- **max_tokens:** 16000 (non-streaming) for MVP. If a very large PR risks truncation, switch that call
  to streaming with `.finalMessage()`.
- **Parsing:** always `JSON.parse` the returned text block; never string-match tool input.
- **Prompt caching:** put the stable system prompt + schema first; the volatile diff goes last so the
  system prefix caches across PRs.

### ⚠️ Browser-direct API access (known limitation)
The background worker calls Claude directly from the browser. The TS SDK requires
`new Anthropic({ apiKey, dangerouslyAllowBrowser: true })`, which sends the
`anthropic-dangerous-direct-browser-access` CORS header. **This means the Anthropic API key is stored
client-side** (in `browser.storage.local`) and is readable by anyone with access to the machine/profile.
Acceptable for a personal/MVP tool with a user-supplied key. For wider distribution, move Claude calls
behind a hosted proxy that holds the key — tracked as a post-MVP task.

---

## GitHub API usage
- Diff: `GET /repos/{owner}/{repo}/pulls/{n}` with `Accept: application/vnd.github.v3.diff`.
- Files: `GET /repos/{owner}/{repo}/pulls/{n}/files` (paginate; `per_page=100`).
- Commits: `GET /repos/{owner}/{repo}/pulls/{n}/commits`.
- PR metadata + body (for intent/linked issues): `GET /repos/{owner}/{repo}/pulls/{n}`; closing issues
  via the timeline or by parsing `Closes #N` / `Fixes #N` from the body.
- Auth: user-supplied **fine-grained PAT** (read-only, Pull requests + Contents) via `Authorization: Bearer`.
- Respect `X-RateLimit-Remaining`; surface rate-limit errors in the panel rather than failing silently.

---

## Heuristic pre-pass (cheap, before any LLM)
Classify a file/hunk as **mechanical** when it matches any of:
- Lockfiles: `*.lock`, `package-lock.json`, `bun.lockb`, `Cargo.lock`, `poetry.lock`, `go.sum`, etc.
- Generated/vendored: paths under `dist/`, `build/`, `vendor/`, `node_modules/`, `*.min.*`,
  `*_pb2.py`, `*.generated.*`, or marked `linguist-generated` (best-effort).
- Pure rename/move: GitHub reports `status: "renamed"` with no content change.
- Formatting-only: hunk where added/removed lines are identical after whitespace/indentation normalization.
Everything else is **interesting** and goes to the LLM. Mechanical groups render collapsed by default.

---

## Coding Conventions
- **TypeScript:** `strict: true`. No `any` — prefer `unknown` + narrowing. Public functions get explicit return types.
- **Naming:** `camelCase` values, `PascalCase` types/components, `SCREAMING_SNAKE_CASE` consts. Files `kebab-case.ts`.
- **Modules:** pure logic (diff parser, heuristics, schema) lives in `lib/` with no `browser.*` / DOM imports,
  so it's unit-testable in isolation. Side-effectful code (storage, messaging, fetch) stays in entrypoints/clients.
- **Messaging:** one discriminated-union message type (`{ type: "..." } & payload`) shared between worker and content script.
- **Errors:** never swallow. Return typed `Result`-style objects or throw; the panel maps errors to user-facing copy.
- **Secrets:** only in `browser.storage.local`; never log keys; never commit `.env` or fixtures containing tokens.
- **Styling:** Tailwind utility classes scoped inside the Shadow DOM so GitHub's CSS can't leak in (or out).
- **Tests:** colocate `*.test.ts` next to the unit under test. Fixtures (sample diffs/PR JSON) live in `tests/fixtures/`.

## Directory layout (target)
```
github-differ/
├─ entrypoints/
│  ├─ background.ts            # service worker: orchestration + network
│  ├─ github.content.ts        # content script: detect + mount panel
│  └─ options/                 # options page (settings)
├─ lib/
│  ├─ diff/                    # unified-diff parser (pure)
│  ├─ heuristics/              # mechanical-change classifier (pure)
│  ├─ grouping/                # schema + prompt + result types
│  ├─ github/                  # REST client
│  ├─ anthropic/               # Claude client wrapper
│  ├─ messaging.ts             # shared message types
│  └─ storage.ts               # typed settings/cache accessors
├─ components/                 # Svelte panel + subcomponents
├─ tests/fixtures/
├─ wxt.config.ts
├─ setup.sh
├─ Makefile
└─ tasks.json
```
