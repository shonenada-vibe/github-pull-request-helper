import { describe, it, expect, vi } from 'vitest';

vi.mock('wxt/browser', () => ({
  browser: { runtime: { sendMessage: vi.fn(), onMessage: { addListener: vi.fn() } } },
}));

import { isAnalyzeRequest, isProgressEvent } from './messaging';

describe('isProgressEvent', () => {
  it('accepts a PROGRESS message with a line', () => {
    expect(isProgressEvent({ type: 'PROGRESS', line: 'PR fetch in 890ms' })).toBe(true);
  });

  it('rejects other shapes', () => {
    expect(isProgressEvent({ type: 'PROGRESS' })).toBe(false);
    expect(isProgressEvent({ type: 'ANALYZE' })).toBe(false);
    expect(isProgressEvent(null)).toBe(false);
  });
});

describe('isAnalyzeRequest', () => {
  it('accepts a well-formed ANALYZE message', () => {
    expect(isAnalyzeRequest({ type: 'ANALYZE', owner: 'o', repo: 'r', number: 1 })).toBe(
      true,
    );
  });

  it('rejects other shapes', () => {
    expect(isAnalyzeRequest({ type: 'OTHER' })).toBe(false);
    expect(isAnalyzeRequest(null)).toBe(false);
    expect(isAnalyzeRequest('ANALYZE')).toBe(false);
  });
});
