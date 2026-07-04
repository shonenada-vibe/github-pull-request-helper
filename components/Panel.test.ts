// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import Panel from './Panel.svelte';
import { panelState } from './panel-state.svelte';
import { disableReviewMode } from './review-mode';
import type { GroupingResult } from '../lib/grouping/types';

function reset() {
  disableReviewMode();
  panelState.visible = false;
  panelState.collapsed = false;
  panelState.reviewMode = false;
  panelState.status = 'idle';
  panelState.result = undefined;
  panelState.error = undefined;
  panelState.errorKind = undefined;
  panelState.fromCache = false;
  panelState.detail = undefined;
  panelState.debug = undefined;
  panelState.logs = [];
  panelState.onRefresh = undefined;
  panelState.onAnalyze = undefined;
  panelState.onOpenOptions = undefined;
}

beforeEach(() => {
  reset();
  Element.prototype.scrollIntoView = vi.fn();
});

const result: GroupingResult = {
  intent: 'Adds rate limiting to the auth endpoint.',
  changeType: 'feature',
  groups: [
    {
      id: 'g1',
      title: 'Rate limiter',
      label: 'behavioral',
      rationale: 'New limiter middleware.',
      files: ['src/limiter.ts'],
    },
    {
      id: 'mechanical',
      title: 'Mechanical / low-signal',
      label: 'mechanical',
      rationale: 'Lockfiles etc.',
      files: ['bun.lockb'],
    },
  ],
  readingOrder: [{ groupId: 'g1', reason: 'Start with the new behavior.' }],
  hasMechanical: true,
};

describe('Panel', () => {
  it('renders nothing when hidden', () => {
    const { container } = render(Panel);
    expect(container.textContent).not.toContain('github-differ');
  });

  it('offers an Analyze button in the idle state and wires the callback', async () => {
    const onAnalyze = vi.fn();
    panelState.visible = true;
    panelState.status = 'idle';
    panelState.onAnalyze = onAnalyze;

    const { getByRole } = render(Panel);
    await fireEvent.click(getByRole('button', { name: /analyze pull request/i }));
    expect(onAnalyze).toHaveBeenCalledOnce();
  });

  it('shows a loading state', () => {
    panelState.visible = true;
    panelState.status = 'loading';
    const { getByText } = render(Panel);
    expect(getByText(/Analyzing pull request/i)).toBeTruthy();
  });

  it('shows the settings CTA for missing credentials and wires the callback', async () => {
    const onOpenOptions = vi.fn();
    panelState.visible = true;
    panelState.status = 'error';
    panelState.error = 'Add a GitHub token…';
    panelState.errorKind = 'missing-credentials';
    panelState.onOpenOptions = onOpenOptions;

    const { getByRole } = render(Panel);
    await fireEvent.click(getByRole('button', { name: /open settings/i }));
    expect(onOpenOptions).toHaveBeenCalledOnce();
  });

  it('renders intent, reading order, and groups when ready', () => {
    panelState.visible = true;
    panelState.status = 'ready';
    panelState.result = result;

    const { getByText } = render(Panel);
    expect(getByText(/Adds rate limiting/)).toBeTruthy();
    expect(getByText('feature')).toBeTruthy();
    expect(getByText('Reading order')).toBeTruthy();
    // Group titles appear (reading order + group card).
    expect(getByText('Mechanical / low-signal')).toBeTruthy();
  });

  it('shows the debug log and auto-expands raw model output on error', () => {
    panelState.visible = true;
    panelState.status = 'error';
    panelState.error = 'Invalid grouping response: groups[0].files must be string[]';
    panelState.errorKind = 'unknown';
    panelState.detail = '{"groups":[{"files":[{"path":"src/a.ts"}]}]}';
    panelState.logs = ['[12:00:00] Analyzing o/r#1', '[12:00:01] Error (unknown)'];

    const { getByText } = render(Panel);
    expect(getByText(/Debug log \(2\)/)).toBeTruthy();
    // Raw output auto-expands because a detail was captured.
    expect(getByText(/Raw model output/)).toBeTruthy();
    expect(getByText(/"path":"src\/a.ts"/)).toBeTruthy();
  });

  it('sorts the groups list by importance, mechanical last', () => {
    panelState.visible = true;
    panelState.status = 'ready';
    panelState.result = {
      intent: 'x',
      changeType: 'feature',
      groups: [
        {
          id: 'mech',
          title: 'Mechanical stuff',
          label: 'mechanical',
          importance: 'low',
          rationale: 'r',
          files: [],
        },
        {
          id: 'docs',
          title: 'Docs updates',
          label: 'docs',
          importance: 'low',
          rationale: 'r',
          files: [],
        },
        {
          id: 'core',
          title: 'Core behavior',
          label: 'behavioral',
          importance: 'high',
          rationale: 'r',
          files: [],
        },
      ],
      readingOrder: [],
      hasMechanical: true,
    };

    const { container } = render(Panel);
    const html = container.innerHTML;
    expect(html.indexOf('Core behavior')).toBeLessThan(html.indexOf('Docs updates'));
    expect(html.indexOf('Docs updates')).toBeLessThan(
      html.indexOf('Mechanical stuff'),
    );
    // The priority chip follows the group name, before the label badge.
    expect(html.indexOf('Core behavior')).toBeLessThan(html.indexOf('high'));
    expect(html.indexOf('high')).toBeLessThan(html.indexOf('behavioral'));
  });

  it('toggles Review Mode: rearranges the page and restores it', async () => {
    document.body.innerHTML = `
      <div data-path="bun.lockb">lock</div>
      <div data-path="src/limiter.ts">core diff</div>
    `;
    panelState.visible = true;
    panelState.status = 'ready';
    panelState.result = result;

    const { getByRole } = render(Panel);
    const toggle = getByRole('button', { name: /review mode/i });

    await fireEvent.click(toggle);
    expect(panelState.reviewMode).toBe(true);
    const paths = () =>
      [...document.querySelectorAll('[data-path]')].map((el) =>
        el.getAttribute('data-path'),
      );
    // Reading order puts the behavioral group before mechanical.
    expect(paths()).toEqual(['src/limiter.ts', 'bun.lockb']);
    expect(
      document.querySelectorAll('[data-github-differ="group-header"]').length,
    ).toBeGreaterThan(0);

    await fireEvent.click(toggle);
    expect(panelState.reviewMode).toBe(false);
    expect(paths()).toEqual(['bun.lockb', 'src/limiter.ts']);
    expect(
      document.querySelectorAll('[data-github-differ="group-header"]'),
    ).toHaveLength(0);
  });

  it('collapses to a reopen pill and expands back', async () => {
    panelState.visible = true;
    panelState.status = 'ready';
    panelState.result = result;

    const { getByTitle, getByText, queryByText } = render(Panel);
    await fireEvent.click(getByTitle('Hide'));
    expect(queryByText('Reading order')).toBeNull();

    await fireEvent.click(getByTitle(/show github-differ panel/i));
    expect(getByText('Reading order')).toBeTruthy();
  });

  it('resizes when the corner handle is dragged', async () => {
    panelState.visible = true;
    panelState.status = 'ready';
    panelState.result = result;

    const { container, getByLabelText } = render(Panel);
    const handle = getByLabelText('Resize panel');
    // jsdom has no PointerEvent; MouseEvent with pointer type names works.
    await fireEvent(
      handle,
      new MouseEvent('pointerdown', { clientX: 500, clientY: 300, bubbles: true }),
    );
    await fireEvent(
      handle,
      new MouseEvent('pointermove', { clientX: 400, clientY: 400, bubbles: true }),
    );

    const aside = container.querySelector('aside')!;
    expect(aside.style.width).toBe('580px'); // 480 default + 100px leftward drag.
    expect(aside.style.height).toBe('580px'); // 480 fallback + 100px downward drag.
  });

  it('jumps to the group files when a group name is clicked', async () => {
    document.body.innerHTML += `<div data-path="src/limiter.ts">diff</div>`;
    panelState.visible = true;
    panelState.status = 'ready';
    panelState.result = result;

    const { getAllByTitle } = render(Panel);
    // First card is g1 (importance sort puts mechanical last).
    await fireEvent.click(getAllByTitle("Jump to this group's files")[0]!);
    const target = document.querySelector('[data-path="src/limiter.ts"]')!;
    expect(target.scrollIntoView).toHaveBeenCalled();
  });

  it('jumps to a file when a reading-order step is clicked', async () => {
    document.body.innerHTML += `<div data-path="src/limiter.ts">diff</div>`;
    panelState.visible = true;
    panelState.status = 'ready';
    panelState.result = result;

    const { getByText } = render(Panel);
    await fireEvent.click(getByText('Start with the new behavior.'));
    const target = document.querySelector('[data-path="src/limiter.ts"]')!;
    expect(target.scrollIntoView).toHaveBeenCalled();
  });
});
