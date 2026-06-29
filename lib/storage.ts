import { browser } from 'wxt/browser';
import type { Effort, Model } from './anthropic/client';
import type { GroupingResult } from './grouping/types';

export interface Settings {
  githubToken: string;
  anthropicApiKey: string;
  model: Model;
  effort: Effort;
}

export const DEFAULT_SETTINGS: Settings = {
  githubToken: '',
  anthropicApiKey: '',
  model: 'claude-opus-4-8',
  effort: 'medium',
};

const SETTINGS_KEY = 'settings';
const CACHE_PREFIX = 'grouping:';

export async function getSettings(): Promise<Settings> {
  const stored = await browser.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(stored[SETTINGS_KEY] as Partial<Settings>) };
}

export async function setSettings(settings: Settings): Promise<void> {
  await browser.storage.local.set({ [SETTINGS_KEY]: settings });
}

/** True when both required credentials are present. */
export function hasCredentials(settings: Settings): boolean {
  return settings.githubToken.length > 0 && settings.anthropicApiKey.length > 0;
}

/** Grouping results are cached by PR head SHA so re-opening a PR is instant. */
export async function getCachedGrouping(
  sha: string,
): Promise<GroupingResult | undefined> {
  const key = CACHE_PREFIX + sha;
  const stored = await browser.storage.local.get(key);
  return stored[key] as GroupingResult | undefined;
}

export async function setCachedGrouping(
  sha: string,
  result: GroupingResult,
): Promise<void> {
  await browser.storage.local.set({ [CACHE_PREFIX + sha]: result });
}
