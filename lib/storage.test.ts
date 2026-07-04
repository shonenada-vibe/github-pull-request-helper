import { describe, it, expect, beforeEach, vi } from 'vitest';

// In-memory fake of browser.storage.local.
const store = new Map<string, unknown>();
vi.mock('wxt/browser', () => ({
  browser: {
    storage: {
      local: {
        get: vi.fn(async (key: string | null) =>
          key === null
            ? Object.fromEntries(store)
            : store.has(key)
              ? { [key]: store.get(key) }
              : {},
        ),
        set: vi.fn(async (items: Record<string, unknown>) => {
          for (const [k, v] of Object.entries(items)) store.set(k, v);
        }),
        remove: vi.fn(async (keys: string | string[]) => {
          for (const k of Array.isArray(keys) ? keys : [keys]) store.delete(k);
        }),
      },
    },
  },
}));

import {
  getSettings,
  setSettings,
  hasCredentials,
  groupingCacheKey,
  getCachedGrouping,
  setCachedGrouping,
  clearGroupingCache,
  DEFAULT_SETTINGS,
  type CachedAnalysis,
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

  it('needs no API key for the local provider, just the bridge URL + agent', () => {
    const base = { ...DEFAULT_SETTINGS, githubToken: 'a', provider: 'local' as const };
    // Defaults (127.0.0.1 bridge, claude agent) are enough.
    expect(hasCredentials(base)).toBe(true);
    expect(hasCredentials({ ...base, localBaseUrl: '' })).toBe(false);
    expect(hasCredentials({ ...base, localAgent: '' })).toBe(false);
  });

  it('requires token + base URL for the carevie provider', () => {
    const base = { ...DEFAULT_SETTINGS, githubToken: 'a', provider: 'carevie' as const };
    // Default base URL is prefilled, so only the token is missing.
    expect(hasCredentials(base)).toBe(false);
    expect(hasCredentials({ ...base, carevieToken: 't' })).toBe(true);
    expect(hasCredentials({ ...base, carevieToken: 't', carevieBaseUrl: '' })).toBe(
      false,
    );
  });
});

describe('grouping cache', () => {
  const result: GroupingResult = {
    intent: 'x',
    changeType: 'chore',
    groups: [],
    readingOrder: [],
    hasMechanical: false,
  };

  function entry(savedAt = Date.now()): CachedAnalysis {
    return { result, savedAt, totalFiles: 3, interesting: 2, mechanical: 1 };
  }

  it('keys entries by provider, model, language, and sha', () => {
    const key = groupingCacheKey({
      provider: 'anthropic',
      model: 'claude-opus-4-8',
      language: 'zh-CN',
      sha: 'abc',
    });
    expect(key).toBe('grouping:v2:anthropic:claude-opus-4-8:zh-CN:abc');
  });

  it('stores and retrieves an entry', async () => {
    const key = groupingCacheKey({
      provider: 'p',
      model: 'm',
      language: 'en',
      sha: 'abc',
    });
    expect(await getCachedGrouping(key)).toBeUndefined();
    const e = entry();
    await setCachedGrouping(key, e);
    expect(await getCachedGrouping(key)).toEqual(e);
  });

  it('expires entries older than the TTL', async () => {
    const key = groupingCacheKey({
      provider: 'p',
      model: 'm',
      language: 'en',
      sha: 'old',
    });
    await setCachedGrouping(key, entry(Date.now() - 8 * 24 * 60 * 60 * 1000));
    expect(await getCachedGrouping(key)).toBeUndefined();
    expect(store.has(key)).toBe(false); // Expired entry was deleted.
  });

  it('evicts the oldest entries beyond the cap', async () => {
    for (let i = 0; i < 41; i++) {
      const key = groupingCacheKey({
        provider: 'p',
        model: 'm',
        language: 'en',
        sha: `sha${i}`,
      });
      // Older i = older savedAt.
      await setCachedGrouping(key, entry(Date.now() - (41 - i) * 1000));
    }
    const cacheKeys = [...store.keys()].filter((k) => k.startsWith('grouping:'));
    expect(cacheKeys).toHaveLength(40);
    expect(store.has('grouping:v2:p:m:en:sha0')).toBe(false); // Oldest evicted.
    expect(store.has('grouping:v2:p:m:en:sha40')).toBe(true);
  });

  it('clears all cache entries (including legacy v1) but not settings', async () => {
    store.set('grouping:legacy-sha', result);
    store.set('settings', DEFAULT_SETTINGS);
    const key = groupingCacheKey({
      provider: 'p',
      model: 'm',
      language: 'en',
      sha: 'x',
    });
    await setCachedGrouping(key, entry());
    expect(await clearGroupingCache()).toBe(2);
    expect(store.has('settings')).toBe(true);
    expect([...store.keys()].some((k) => k.startsWith('grouping:'))).toBe(false);
  });
});
