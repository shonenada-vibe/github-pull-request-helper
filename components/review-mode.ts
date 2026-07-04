import type { GroupingResult, Group } from '../lib/grouping/types';
import { sortGroupsByImportance } from '../lib/grouping/sort';

/**
 * Review Mode rearranges GitHub's own "Files changed" DOM: each group from the
 * analysis gets an injected header, and the file diff elements are moved under
 * their group in reading order. Every moved element leaves a comment
 * placeholder at its original position, so disabling restores the exact
 * default GitHub order.
 */

interface MovedFile {
  el: Element;
  placeholder: Comment;
}

let active: { moved: MovedFile[]; injected: ChildNode[] } | null = null;

export function isReviewModeActive(): boolean {
  return active !== null;
}

function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return value.replace(/["\\]/g, '\\$&');
}

/** The top-level DOM container of a file's diff, across GitHub UI variants. */
function fileRoot(path: string): HTMLElement | null {
  const escaped = cssEscape(path);
  const selectors = [
    `copilot-diff-entry[data-file-path="${escaped}"]`,
    `[data-tagsearch-path="${escaped}"]`,
    `[data-path="${escaped}"]`,
  ];
  for (const sel of selectors) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el) {
      return el.closest<HTMLElement>('copilot-diff-entry, .js-file, .file') ?? el;
    }
  }
  return null;
}

/**
 * Groups in reading order, then any groups the reading order skipped,
 * most important first.
 */
function orderedGroups(
  result: GroupingResult,
): Array<{ group: Group; reason?: string }> {
  const byId = new Map(result.groups.map((g) => [g.id, g]));
  const out: Array<{ group: Group; reason?: string }> = [];
  const seen = new Set<string>();
  for (const step of result.readingOrder) {
    const group = byId.get(step.groupId);
    if (group && !seen.has(group.id)) {
      out.push({ group, reason: step.reason });
      seen.add(group.id);
    }
  }
  for (const group of sortGroupsByImportance(result.groups)) {
    if (!seen.has(group.id)) out.push({ group });
  }
  return out;
}

/** Rotating header palette so adjacent groups are visually distinct. */
const HEADER_COLORS = [
  {
    bg: 'var(--bgColor-accent-muted, #ddf4ff)',
    border: 'var(--borderColor-accent-muted, rgba(84,174,255,0.4))',
  },
  {
    bg: 'var(--bgColor-success-muted, #dafbe1)',
    border: 'var(--borderColor-success-muted, rgba(74,194,107,0.4))',
  },
  {
    bg: 'var(--bgColor-attention-muted, #fff8c5)',
    border: 'var(--borderColor-attention-muted, rgba(212,167,44,0.4))',
  },
  {
    bg: 'var(--bgColor-done-muted, #fbefff)',
    border: 'var(--borderColor-done-muted, rgba(163,113,247,0.4))',
  },
  {
    bg: 'var(--bgColor-severe-muted, #fff1e5)',
    border: 'var(--borderColor-severe-muted, rgba(251,143,68,0.4))',
  },
  {
    bg: 'var(--bgColor-danger-muted, #ffebe9)',
    border: 'var(--borderColor-danger-muted, rgba(255,129,130,0.4))',
  },
];

type HeaderColor = (typeof HEADER_COLORS)[number];

function colorFor(position: number): HeaderColor {
  return HEADER_COLORS[(position - 1) % HEADER_COLORS.length]!;
}

/**
 * Bordered container holding a group's header and its file diffs. Injected
 * into the page (outside our shadow root), so styling is inline, using
 * GitHub's CSS variables with light-mode fallbacks.
 */
function buildGroupWrapper(position: number, color: HeaderColor): HTMLElement {
  const wrapper = document.createElement('section');
  wrapper.setAttribute('data-github-differ', 'group');
  wrapper.style.cssText =
    // Breathing room between groups, but not above the first one.
    `margin:${position === 1 ? '0' : '48px'} 0 16px;padding:10px;` +
    `border:2px solid ${color.border};border-radius:8px;`;
  return wrapper;
}

function buildHeader(
  group: Group,
  position: number,
  color: HeaderColor,
  reason?: string,
): HTMLElement {
  const header = document.createElement('div');
  header.setAttribute('data-github-differ', 'group-header');
  header.style.cssText =
    'margin:0 0 12px;padding:10px 14px;' +
    `border:1px solid ${color.border};` +
    `border-radius:6px;background:${color.bg};` +
    'color:var(--fgColor-default, #1f2328);font-size:14px;line-height:1.4;';

  const title = document.createElement('div');
  title.style.cssText = 'display:flex;align-items:center;gap:8px;font-weight:600;';
  title.textContent = `${position}. ${group.title}`;
  const badge = document.createElement('span');
  badge.style.cssText =
    'padding:1px 8px;border-radius:999px;font-size:12px;font-weight:500;' +
    'background:var(--bgColor-neutral-muted, #eff1f3);' +
    'color:var(--fgColor-muted, #57606a);';
  badge.textContent =
    group.importance && group.label !== 'mechanical'
      ? `${group.label} · ${group.importance}`
      : group.label;
  title.appendChild(badge);
  header.appendChild(title);

  const sub = document.createElement('div');
  sub.style.cssText = 'margin-top:2px;color:var(--fgColor-muted, #57606a);';
  sub.textContent = reason ? `${group.rationale} — ${reason}` : group.rationale;
  header.appendChild(sub);
  return header;
}

/** User preference for the side nav; survives re-enables within the session. */
let sideNavCollapsed = false;

/** Fixed nav on the left edge with one jump entry per group; collapsible. */
function buildSideNav(
  entries: Array<{ position: number; group: Group; wrapper: HTMLElement }>,
): HTMLElement {
  const nav = document.createElement('nav');
  nav.setAttribute('data-github-differ', 'side-nav');
  nav.setAttribute('aria-label', 'Review groups');
  nav.style.cssText =
    'position:fixed;left:16px;top:50%;transform:translateY(-50%);z-index:9998;' +
    'max-width:240px;max-height:60vh;overflow:auto;' +
    'border:1px solid var(--borderColor-default, #d1d9e0);border-radius:8px;' +
    'background:var(--bgColor-default, #ffffff);' +
    'color:var(--fgColor-default, #1f2328);' +
    'box-shadow:0 3px 12px rgba(0,0,0,0.15);font-size:12px;line-height:1.5;';

  const list = document.createElement('div');
  list.style.cssText = 'padding:8px;';

  const heading = document.createElement('div');
  heading.style.cssText =
    'display:flex;align-items:center;gap:8px;margin:0 0 4px;padding:0 6px;';
  const headingLabel = document.createElement('span');
  headingLabel.style.cssText =
    'flex:1;font-weight:600;text-transform:uppercase;font-size:11px;' +
    'color:var(--fgColor-muted, #57606a);';
  headingLabel.textContent = 'Groups';
  heading.appendChild(headingLabel);

  const collapseBtn = document.createElement('button');
  collapseBtn.type = 'button';
  collapseBtn.setAttribute('aria-label', 'Hide groups navigation');
  collapseBtn.title = 'Hide';
  collapseBtn.textContent = '«';
  collapseBtn.style.cssText =
    'border:0;background:transparent;cursor:pointer;padding:0 4px;' +
    'color:var(--fgColor-muted, #57606a);font:inherit;';
  heading.appendChild(collapseBtn);
  list.appendChild(heading);

  const expandBtn = document.createElement('button');
  expandBtn.type = 'button';
  expandBtn.setAttribute('aria-label', 'Show groups navigation');
  expandBtn.title = 'Show review groups';
  expandBtn.textContent = '»';
  expandBtn.style.cssText =
    'display:none;border:0;background:transparent;cursor:pointer;' +
    'padding:6px 10px;color:var(--fgColor-muted, #57606a);font:inherit;' +
    'font-weight:600;';

  function applyCollapsed() {
    list.style.display = sideNavCollapsed ? 'none' : 'block';
    expandBtn.style.display = sideNavCollapsed ? 'block' : 'none';
  }
  collapseBtn.addEventListener('click', () => {
    sideNavCollapsed = true;
    applyCollapsed();
  });
  expandBtn.addEventListener('click', () => {
    sideNavCollapsed = false;
    applyCollapsed();
  });

  for (const { position, group, wrapper } of entries) {
    const color = colorFor(position);
    const button = document.createElement('button');
    button.type = 'button';
    button.title = group.rationale;
    button.style.cssText =
      'display:flex;align-items:center;gap:6px;width:100%;padding:3px 6px;' +
      'border:0;border-radius:4px;background:transparent;cursor:pointer;' +
      'color:inherit;font:inherit;text-align:left;';
    const dot = document.createElement('span');
    dot.style.cssText =
      `flex:none;width:8px;height:8px;border-radius:999px;background:${color.border};`;
    button.appendChild(dot);
    const label = document.createElement('span');
    label.style.cssText =
      'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    label.textContent = `${position}. ${group.title}`;
    button.appendChild(label);
    button.addEventListener('click', () => {
      wrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    list.appendChild(button);
  }

  nav.appendChild(list);
  nav.appendChild(expandBtn);
  applyCollapsed();
  return nav;
}

function firstInDocument(els: Element[]): Element {
  return els.reduce((first, el) =>
    first.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING ? el : first,
  );
}

/**
 * Rearrange the page by the analysis. Returns false (and changes nothing)
 * when no file element could be located. Idempotent while active.
 */
export function enableReviewMode(result: GroupingResult): boolean {
  if (active) return true;

  const resolved = orderedGroups(result).map((entry) => ({
    ...entry,
    els: entry.group.files
      .map(fileRoot)
      .filter((el): el is HTMLElement => el !== null),
  }));
  const allEls = resolved.flatMap((r) => r.els);
  if (allEls.length === 0) return false;

  // Everything is inserted before a marker placed at the first diff's position.
  const anchorEl = firstInDocument(allEls);
  const parent = anchorEl.parentNode!;
  const anchorMarker = document.createComment('github-differ:anchor');
  parent.insertBefore(anchorMarker, anchorEl);

  const moved: MovedFile[] = [];
  const injected: ChildNode[] = [anchorMarker];
  const navEntries: Array<{ position: number; group: Group; wrapper: HTMLElement }> =
    [];
  let position = 0;
  for (const { group, reason, els } of resolved) {
    if (els.length === 0) continue;
    position += 1;
    const color = colorFor(position);
    const wrapper = buildGroupWrapper(position, color);
    wrapper.appendChild(buildHeader(group, position, color, reason));
    parent.insertBefore(wrapper, anchorMarker);
    injected.push(wrapper);
    navEntries.push({ position, group, wrapper });
    for (const el of els) {
      const placeholder = document.createComment('github-differ:slot');
      el.replaceWith(placeholder);
      wrapper.appendChild(el);
      moved.push({ el, placeholder });
    }
  }

  const sideNav = buildSideNav(navEntries);
  document.body.appendChild(sideNav);
  injected.push(sideNav);

  active = { moved, injected };
  return true;
}

/**
 * Restore the default GitHub order. Safe to call when inactive or after a
 * soft navigation discarded the page DOM (stale nodes are just skipped).
 */
export function disableReviewMode(): void {
  if (!active) return;
  for (const { el, placeholder } of active.moved) {
    if (placeholder.parentNode) placeholder.replaceWith(el);
  }
  for (const node of active.injected) {
    (node as ChildNode).remove();
  }
  active = null;
}
