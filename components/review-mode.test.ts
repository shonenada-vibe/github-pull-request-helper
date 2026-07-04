// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  enableReviewMode,
  disableReviewMode,
  isReviewModeActive,
  scrollToGroup,
} from './review-mode';
import type { GroupingResult } from '../lib/grouping/types';

const result: GroupingResult = {
  intent: 'Adds a limiter.',
  changeType: 'feature',
  groups: [
    {
      id: 'core',
      title: 'Limiter core',
      label: 'behavioral',
      importance: 'high',
      rationale: 'The new behavior.',
      files: ['src/limiter.ts'],
    },
    {
      id: 'tests',
      title: 'Tests',
      label: 'test',
      rationale: 'Coverage.',
      files: ['src/limiter.test.ts'],
    },
    {
      id: 'mechanical',
      title: 'Mechanical / low-signal',
      label: 'mechanical',
      rationale: 'Lockfiles.',
      files: ['bun.lockb'],
    },
  ],
  // Deliberately not the on-page order: tests file precedes the core file.
  readingOrder: [
    { groupId: 'core', reason: 'Start here.' },
    { groupId: 'tests', reason: 'Then verify.' },
    { groupId: 'mechanical', reason: 'Skim last.' },
  ],
  hasMechanical: true,
};

function filesOnPage(): string[] {
  return [...document.querySelectorAll('[data-path]')].map(
    (el) => el.getAttribute('data-path')!,
  );
}

function headersOnPage(): string[] {
  return [...document.querySelectorAll('[data-github-differ="group-header"]')].map(
    (el) => el.textContent ?? '',
  );
}

beforeEach(() => {
  disableReviewMode();
  document.body.innerHTML = `
    <div data-path="bun.lockb">lock</div>
    <div data-path="src/limiter.test.ts">test diff</div>
    <div data-path="README.md">readme diff</div>
    <div data-path="src/limiter.ts">core diff</div>
  `;
});

describe('review mode', () => {
  it('groups and sorts the file elements by reading order, with headers', () => {
    expect(enableReviewMode(result)).toBe(true);
    expect(isReviewModeActive()).toBe(true);

    // Grouped files first in reading order; the unmatched README stays behind.
    expect(filesOnPage()).toEqual([
      'src/limiter.ts',
      'src/limiter.test.ts',
      'bun.lockb',
      'README.md',
    ]);

    const headers = headersOnPage();
    expect(headers).toHaveLength(3);
    expect(headers[0]).toContain('1. Limiter core');
    expect(headers[0]).toContain('behavioral');
    expect(headers[0]).toContain('Start here.');
    // The priority chip sits right after the group name, before the label.
    expect(headers[0]!.indexOf('1. Limiter core')).toBeLessThan(
      headers[0]!.indexOf('high'),
    );
    expect(headers[0]!.indexOf('high')).toBeLessThan(
      headers[0]!.indexOf('behavioral'),
    );
    expect(headers[2]).toContain('3. Mechanical / low-signal');

    // Each header directly precedes its group's first file.
    const first = document.querySelector('[data-github-differ="group-header"]')!;
    expect(first.nextElementSibling?.getAttribute('data-path')).toBe(
      'src/limiter.ts',
    );
  });

  it('wraps each group in a bordered section, spaced 48px except the first', () => {
    enableReviewMode(result);
    const wrappers = [
      ...document.querySelectorAll<HTMLElement>('[data-github-differ="group"]'),
    ];
    expect(wrappers).toHaveLength(3);
    const styles = wrappers.map((el) => el.getAttribute('style') ?? '');
    expect(styles[0]).not.toContain('48px'); // First group hugs the top.
    expect(styles[1]).toContain('48px');
    expect(styles[2]).toContain('48px');
    for (const style of styles) expect(style).toContain('border');
    // The rotating palette makes adjacent groups visually distinct.
    expect(styles[1]).not.toBe(styles[2]);

    // Each wrapper contains its header followed by its files.
    const first = wrappers[0]!;
    expect(
      first.querySelector('[data-github-differ="group-header"]'),
    ).toBeTruthy();
    expect(first.querySelector('[data-path="src/limiter.ts"]')).toBeTruthy();
  });

  it('does not inject a side nav (removed feature)', () => {
    enableReviewMode(result);
    expect(document.querySelector('[data-github-differ="side-nav"]')).toBeNull();
  });

  it('scrollToGroup jumps to the group section while active, else reports false', () => {
    Element.prototype.scrollIntoView = vi.fn();

    expect(scrollToGroup('core')).toBe(false); // Inactive.

    enableReviewMode(result);
    expect(scrollToGroup('core')).toBe(true);
    const coreWrapper = document.querySelector(
      '[data-github-differ="group"][data-group-id="core"]',
    )!;
    expect(coreWrapper.scrollIntoView).toHaveBeenCalled();
    expect(scrollToGroup('ghost')).toBe(false); // Unknown group id.

    disableReviewMode();
    expect(scrollToGroup('core')).toBe(false);
  });

  it('restores the exact original order on disable', () => {
    const original = filesOnPage();
    enableReviewMode(result);
    disableReviewMode();

    expect(isReviewModeActive()).toBe(false);
    expect(filesOnPage()).toEqual(original);
    expect(headersOnPage()).toHaveLength(0);
  });

  it('is a no-op returning false when no file element matches', () => {
    document.body.innerHTML = '<div>not a diff</div>';
    expect(enableReviewMode(result)).toBe(false);
    expect(isReviewModeActive()).toBe(false);
    expect(headersOnPage()).toHaveLength(0);
  });

  it('stays consistent when enabled twice', () => {
    enableReviewMode(result);
    expect(enableReviewMode(result)).toBe(true);
    expect(headersOnPage()).toHaveLength(3);
  });
});
