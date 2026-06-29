import { describe, it, expect, beforeEach, vi } from 'vitest';

// In-memory fake of browser.storage.local.
const store = new Map<string, unknown>();
vi.mock('wxt/browser', () => ({
  browser: {
    storage: {
      local: {
        get: vi.fn(async (key: string) =>
          store.has(key) ? { [key]: store.get(key) } : {},
        ),
        set: vi.fn(async (items: Record<string, unknown>) => {
          for (const [k, v] of Object.entries(items)) store.set(k, v);
        }),
      },
    },
  },
}));

import {
  getSettings,
  setSettings,
  hasCredentials,
  getCachedGrouping,
  setCachedGrouping,
  DEFAULT_SETTINGS,
} from './storage';
import type { GroupingResult } from './grouping/types';

beforeEach(() => store.clear());

describe('settings storage', () => {
  it('returns defaults when nothing is stored', async () => {
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips settings and merges over defaults', async () => {
    await setSettings({
      ...DEFAULT_SETTINGS,
      githubToken: 'ght',
      model: 'claude-sonnet-4-6',
    });
    const s = await getSettings();
    expect(s.githubToken).toBe('ght');
    expect(s.model).toBe('claude-sonnet-4-6');
    expect(s.effort).toBe('medium');
  });
});

describe('hasCredentials', () => {
  it('requires a github token plus the anthropic key for the anthropic provider', () => {
    expect(hasCredentials({ ...DEFAULT_SETTINGS })).toBe(false);
    expect(
      hasCredentials({ ...DEFAULT_SETTINGS, githubToken: 'a', anthropicApiKey: 'b' }),
    ).toBe(true);
  });

  it('requires key + base URL + model for the openai provider', () => {
    const base = { ...DEFAULT_SETTINGS, githubToken: 'a', provider: 'openai' as const };
    expect(hasCredentials({ ...base, openaiApiKey: 'b', openaiModel: 'm' })).toBe(true);
    // Missing model.
    expect(hasCredentials({ ...base, openaiApiKey: 'b', openaiModel: '' })).toBe(false);
    // Anthropic key is irrelevant when the openai provider is active.
    expect(hasCredentials({ ...base, anthropicApiKey: 'x' })).toBe(false);
  });
});

describe('grouping cache', () => {
  it('stores and retrieves by sha', async () => {
    const result: GroupingResult = {
      intent: 'x',
      changeType: 'chore',
      groups: [],
      readingOrder: [],
      hasMechanical: false,
    };
    expect(await getCachedGrouping('abc')).toBeUndefined();
    await setCachedGrouping('abc', result);
    expect(await getCachedGrouping('abc')).toEqual(result);
  });
});
