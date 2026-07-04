## 2026-07-04 — Panel collapse/reopen + drag-to-resize

### Request
- Make the panel able to hide / display.
- Make the panel able to drag larger / smaller.

### What was done
- **Collapse / reopen** (`panel-state.svelte.ts`, `Panel.svelte`):
  - New `panelState.collapsed` (user preference) separate from `visible` (page
    applicability, still owned by the content script). The header ✕ now sets
    `collapsed = true` instead of `visible = false`, so the panel can come back.
  - When collapsed, a floating pill ("differ" + a status dot: amber pulsing =
    loading, green = ready, red = error, gray = idle) sits where the panel was;
    clicking it re-expands. Collapsed state survives PR-to-PR navigation because
    the component stays mounted and `resetForLoading` doesn't touch it.
- **Drag-to-resize** (`Panel.svelte`):
  - A grip button in the panel's bottom-left corner (`cursor-sw-resize`) starts a
    pointer-capture drag; since the panel is anchored to the right edge, dragging
    left grows width, dragging down grows height.
  - Clamps: width 320px … viewport−32px; height 240px … viewport−96px. Height
    stays auto (with the 86vh cap) until first dragged, then becomes explicit.
  - `setPointerCapture` is optional-chained so jsdom (no Pointer Events) works.

### Testing (all executed, green)
- `vitest`: **85 tests** (new: collapse-to-pill-and-expand, drag-resize via
  MouseEvent-typed pointer events asserting the inline width/height).
- `svelte-check`: 0 errors / 0 warnings. `eslint`: clean. `wxt build`: ok.

### Notes
- Size and collapsed state are session-only (module state in the content script),
  not persisted to storage — reload starts at 480px expanded.
