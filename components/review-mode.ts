import type { GroupingResult, Group } from '../lib/grouping/types';

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

/** Groups in reading order, then any groups the reading order skipped. */
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
  for (const group of result.groups) {
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

/**
 * Injected into the page (outside our shadow root), so styling is inline,
 * using GitHub's CSS variables with light-mode fallbacks.
 */
function buildHeader(group: Group, position: number, reason?: string): HTMLElement {
  const color = HEADER_COLORS[(position - 1) % HEADER_COLORS.length]!;
  const header = document.createElement('div');
  header.setAttribute('data-github-differ', 'group-header');
  header.style.cssText =
    'margin:48px 0 12px;padding:10px 14px;' +
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
  badge.textContent = group.label;
  title.appendChild(badge);
  header.appendChild(title);

  const sub = document.createElement('div');
  sub.style.cssText = 'margin-top:2px;color:var(--fgColor-muted, #57606a);';
  sub.textContent = reason ? `${group.rationale} — ${reason}` : group.rationale;
  header.appendChild(sub);
  return header;
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
  let position = 0;
  for (const { group, reason, els } of resolved) {
    if (els.length === 0) continue;
    position += 1;
    const header = buildHeader(group, position, reason);
    parent.insertBefore(header, anchorMarker);
    injected.push(header);
    for (const el of els) {
      const placeholder = document.createComment('github-differ:slot');
      el.replaceWith(placeholder);
      parent.insertBefore(el, anchorMarker);
      moved.push({ el, placeholder });
    }
  }

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
