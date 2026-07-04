import { browser } from 'wxt/browser';
import type { Effort, Model } from './anthropic/client';
import type { GroupingResult } from './grouping/types';
import { SYSTEM_PROMPT } from './grouping/prompt';

export type Provider = 'anthropic' | 'openai' | 'carevie' | 'local';

export interface Settings {
  githubToken: string;
  /** Which LLM backend to use for grouping. */
  provider: Provider;
  /** Output language code for the analysis (see lib/language.ts). */
  language: string;
  /** Automatically enable Review Mode (grouped file list) after analysis. */
  autoReviewMode: boolean;
  /** Start analysis automatically when opening a PR's Files changed tab. */
  autoAnalyze: boolean;
  /** The grouping system prompt; editable in the options, reset to default. */
  systemPrompt: string;
  // Anthropic
  anthropicApiKey: string;
  model: Model;
  effort: Effort;
  // OpenAI-compatible (OpenAI, OpenRouter, Together, local servers, …)
  openaiApiKey: string;
  openaiBaseUrl: string;
  openaiModel: string;
  // Carevie review service (server-side analysis by PR coordinates)
  carevieToken: string;
  carevieBaseUrl: string;
  // Local agent bridge (Claude Code / Codex via bridge/server.ts)
  localBaseUrl: string;
  /** Which agent the bridge should run: 'claude' or 'codex'. */
  localAgent: string;
  /** Matches the bridge's BRIDGE_TOKEN when set; optional. */
  localToken: string;
}

export const DEFAULT_SETTINGS: Settings = {
  githubToken: '',
  provider: 'anthropic',
  language: 'en',
  autoReviewMode: true,
  autoAnalyze: false,
  systemPrompt: SYSTEM_PROMPT,
  anthropicApiKey: '',
  model: 'claude-opus-4-8',
  effort: 'medium',
  openaiApiKey: '',
  openaiBaseUrl: 'https://api.openai.com/v1',
  openaiModel: '',
  carevieToken: '',
  carevieBaseUrl: 'https://carevie.dolpc.com',
  localBaseUrl: 'http://127.0.0.1:8765/v1',
  localAgent: 'claude',
  localToken: '',
};

const SETTINGS_KEY = 'settings';
const CACHE_PREFIX = 'grouping:';
const CACHE_V2_PREFIX = 'grouping:v2:';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 40;

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
  if (settings.provider === 'carevie') {
    return settings.carevieToken.length > 0 && settings.carevieBaseUrl.length > 0;
  }
  if (settings.provider === 'local') {
    // The bridge needs no API key; the optional token is checked server-side.
    return settings.localBaseUrl.length > 0 && settings.localAgent.length > 0;
  }
  return settings.anthropicApiKey.length > 0;
}

/** One cached analysis: the result plus enough metadata to skip re-fetching. */
export interface CachedAnalysis {
  result: GroupingResult;
  savedAt: number;
  totalFiles: number;
  interesting: number;
  mechanical: number;
}

/**
 * Cache key for an analysis. Includes provider, model, and language so
 * switching any of them re-analyzes instead of serving a stale variant;
 * the head SHA invalidates on new pushes.
 */
export function groupingCacheKey(p: {
  provider: string;
  model: string;
  language: string;
  sha: string;
}): string {
  return `${CACHE_V2_PREFIX}${p.provider}:${p.model}:${p.language}:${p.sha}`;
}

/** Fetch a cached analysis; expired entries are removed and treated as misses. */
export async function getCachedGrouping(
  key: string,
): Promise<CachedAnalysis | undefined> {
  const stored = await browser.storage.local.get(key);
  const entry = stored[key] as CachedAnalysis | undefined;
  if (!entry) return undefined;
  if (Date.now() - entry.savedAt > CACHE_TTL_MS) {
    await browser.storage.local.remove(key);
    return undefined;
  }
  return entry;
}

export async function setCachedGrouping(
  key: string,
  entry: CachedAnalysis,
): Promise<void> {
  await browser.storage.local.set({ [key]: entry });
  await evictOldEntries();
}

function savedAtOf(value: unknown): number {
  if (typeof value === 'object' && value !== null) {
    const at = (value as { savedAt?: unknown }).savedAt;
    if (typeof at === 'number') return at;
  }
  return 0; // Legacy v1 entries sort first and get evicted soonest.
}

/** Keep the cache bounded: drop the oldest entries past CACHE_MAX_ENTRIES. */
async function evictOldEntries(): Promise<void> {
  const all = await browser.storage.local.get(null);
  const entries = Object.entries(all).filter(([k]) => k.startsWith(CACHE_PREFIX));
  if (entries.length <= CACHE_MAX_ENTRIES) return;
  const excess = entries
    .sort((a, b) => savedAtOf(a[1]) - savedAtOf(b[1]))
    .slice(0, entries.length - CACHE_MAX_ENTRIES)
    .map(([k]) => k);
  await browser.storage.local.remove(excess);
}

/** Remove every cached analysis (v1 and v2). Returns how many were removed. */
export async function clearGroupingCache(): Promise<number> {
  const all = await browser.storage.local.get(null);
  const keys = Object.keys(all).filter((k) => k.startsWith(CACHE_PREFIX));
  if (keys.length) await browser.storage.local.remove(keys);
  return keys.length;
}
