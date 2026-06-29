/**
 * Best-effort scroll to a file's diff on the GitHub "Files changed" page.
 * GitHub's DOM changes over time, so we try several known selectors.
 *
 * @returns true if a matching element was found and scrolled to.
 */
export function scrollToFile(path: string): boolean {
  const escaped = cssEscape(path);
  const selectors = [
    `[data-tagsearch-path="${escaped}"]`,
    `[data-path="${escaped}"]`,
    `a[title="${escaped}"]`,
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return true;
    }
  }
  return false;
}

function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return value.replace(/["\\]/g, '\\$&');
}
