## 2026-07-04 — Review Mode: rearrange the GitHub file list by the analysis

### Request
Add a button to switch between the default GitHub PR UI and a "Review Mode"
that groups and sorts the file diffs according to the AI result.

### What was done
- **`components/review-mode.ts`** (new): `enableReviewMode(result)` rearranges
  GitHub's own "Files changed" DOM — each analysis group gets an injected header
  (position, title, label badge, rationale + reading-order reason), and the file
  diff elements are moved under their group in reading order. Every moved element
  leaves a `<!--github-differ:slot-->` comment placeholder at its original spot, so
  `disableReviewMode()` restores the exact default order and removes all injected
  nodes. Key details:
  - File elements are located via the same selector set as scroll-to-file
    (`copilot-diff-entry[data-file-path]`, `[data-tagsearch-path]`, `[data-path]`),
    then climbed to the top-level diff container (`.js-file`/`.file`/entry).
  - Headers are injected into the page (outside our shadow root), so they use
    inline styles with GitHub CSS variables (`--bgColor-accent-muted` etc.) and
    light-mode fallbacks — dark mode compatible.
  - Groups skipped by the reading order are appended after it; files not found in
    the DOM are skipped; if nothing matches, enable is a no-op returning false.
  - Disable is stale-safe: after a soft navigation discards the old DOM, detached
    placeholders are skipped.
- **Panel toggle**: a "Review mode" button in the panel header (visible when a
  result is ready) — outlined when off, filled + ✓ when on. Toggling logs to the
  debug section, including a note when no file elements could be found.
- **Lifecycle**: `resetForLoading()` (new analysis) and leaving the files tab both
  disable review mode and clear `panelState.reviewMode`, since the rearrangement
  would be stale.

### Testing (all executed, green)
- `vitest`: **90 tests** (new `review-mode.test.ts` ×4: reorder+headers, exact
  restore, no-match no-op, idempotent enable; Panel integration toggle test).
- `svelte-check`: 0 errors / 0 warnings. `eslint`: clean. `wxt build`: ok.

### Notes
- GitHub's virtualized/paginated file lists mean some files may not be in the DOM
  yet ("Load diff" chunks, >300-file pagination); those are skipped rather than
  breaking. Re-toggling after more files load picks them up.
- Live verification on a real PR page still needs a manual pass (load the
  unpacked build); jsdom covers the reorder/restore logic.
