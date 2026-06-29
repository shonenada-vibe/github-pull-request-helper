import { browser } from 'wxt/browser';
import type { Effort, Model } from './anthropic/client';
import type { GroupingResult } from './grouping/types';

export type Provider = 'anthropic' | 'openai';

export interface Settings {
  githubToken: string;
  /** Which LLM backend to use for grouping. */
  provider: Provider;
  // Anthropic
  anthropicApiKey: string;
  model: Model;
  effort: Effort;
  // OpenAI-compatible (OpenAI, OpenRouter, Together, local servers, …)
  openaiApiKey: string;
  openaiBaseUrl: string;
  openaiModel: string;
}

export const DEFAULT_SETTINGS: Settings = {
  githubToken: '',
  provider: 'anthropic',
  anthropicApiKey: '',
  model: 'claude-opus-4-8',
  effort: 'medium',
  openaiApiKey: '',
  openaiBaseUrl: 'https://api.openai.com/v1',
  openaiModel: '',
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

/** True when the GitHub token and the active provider's credentials are present. */
export function hasCredentials(settings: Settings): boolean {
  if (settings.githubToken.length === 0) return false;
  if (settings.provider === 'openai') {
    return (
      settings.openaiApiKey.length > 0 &&
      settings.openaiBaseUrl.length > 0 &&
      settings.openaiModel.length > 0
    );
  }
  return settings.anthropicApiKey.length > 0;
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
