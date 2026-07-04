## 2026-07-04 — Larger panel, output-language option, real cache

### Request
- Make the panel larger.
- Introduce a language preference option.
- Introduce cache.

### What was done
- **Panel size** (`components/Panel.svelte`): 360px → 480px wide (capped at 92vw
  on narrow windows), max height 80vh → 86vh.
- **Output language**:
  - `lib/language.ts` (new): `LANGUAGES` (en, zh-CN, zh-TW, ja, ko) with native
    labels for the UI and English `promptName`s for prompts.
  - `Settings.language` (default `'en'`), Options select under the GitHub token.
  - `buildSystemPrompt(code)` in `lib/grouping/prompt.ts` appends a
    "write every human-readable string in X, keep ids/paths verbatim" instruction
    (English returns the base prompt unchanged to keep provider prompt caches warm).
  - Carevie: forwarded as a `lang` query param (harmless if the server ignores it).
- **Cache** (the v1 cache was a bare `grouping:{sha}` store — no TTL, no eviction,
  key ignored provider/language, and hits still downloaded the full diff):
  - Key: `grouping:v2:{provider}:{model}:{language}:{sha}` — switching provider,
    model, or language re-analyzes instead of serving the wrong variant.
  - Entry: `CachedAnalysis { result, savedAt, totalFiles, interesting, mechanical }`
    so a hit can report full diagnostics without re-partitioning.
  - 7-day TTL (expired entries deleted on read); eviction keeps the 40 newest
    (legacy v1 entries sort oldest, so they get cleaned up first).
  - Fast hit path: pipeline first does a single-request head-SHA lookup
    (`fetchPullRequestHead`); on a hit it never downloads the diff. Force refresh
    skips both the lookup and the cache.
  - Options page: "Analysis cache" section with a Clear button (reports count);
    `clearGroupingCache()` removes v1 + v2 entries but not settings.
  - Panel: "cached" badge tooltip and debug log now show when the entry was saved
    (`DebugInfo.cachedAt` threaded through pipeline → background → content).

### Testing (all executed, green)
- `vitest`: **83 tests** (cache key/TTL/eviction/clear ×4 rewritten+new; pipeline
  head-only hit, force-skips-lookup, language-in-prompt-and-key; carevie lang param).
- `svelte-check`: 0 errors. `eslint`: clean. `wxt build`: ok. `playwright`: 2 pass.

### Notes
- Cache-hit diagnostics come from the stored entry, so counts reflect the PR as it
  was when analyzed (same head SHA, so they can't drift).
- The mechanical-only fallback intent string is still English regardless of the
  language setting (no LLM call happens on that path).
