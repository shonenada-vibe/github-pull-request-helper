// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { scrollToFile } from './scroll-to-file';

beforeEach(() => {
  document.body.innerHTML = '';
  // jsdom does not implement scrollIntoView.
  Element.prototype.scrollIntoView = vi.fn();
});

describe('scrollToFile', () => {
  it('finds a file by data-tagsearch-path and scrolls to it', () => {
    document.body.innerHTML = `<div data-tagsearch-path="src/a.ts">diff</div>`;
    const target = document.querySelector('[data-tagsearch-path]')!;
    expect(scrollToFile('src/a.ts')).toBe(true);
    expect(target.scrollIntoView).toHaveBeenCalled();
  });

  it('falls back to the data-path selector', () => {
    document.body.innerHTML = `<div data-path="pkg/b.go">diff</div>`;
    expect(scrollToFile('pkg/b.go')).toBe(true);
  });

  it('returns false when the file is not on the page', () => {
    document.body.innerHTML = `<div data-path="other.ts"></div>`;
    expect(scrollToFile('missing.ts')).toBe(false);
  });

  it('handles paths with special characters', () => {
    document.body.innerHTML = `<div data-path="src/[id].ts">diff</div>`;
    expect(scrollToFile('src/[id].ts')).toBe(true);
  });
});
