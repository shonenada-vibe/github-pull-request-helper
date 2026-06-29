// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import Panel from './Panel.svelte';
import { panelState } from './panel-state.svelte';
import type { GroupingResult } from '../lib/grouping/types';

function reset() {
  panelState.visible = false;
  panelState.status = 'idle';
  panelState.result = undefined;
  panelState.error = undefined;
  panelState.errorKind = undefined;
  panelState.fromCache = false;
  panelState.onRefresh = undefined;
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
