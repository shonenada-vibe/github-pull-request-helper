import { defineBackground } from '#imports';
import { browser } from 'wxt/browser';
import {
  onAnalyze,
  isOpenOptionsRequest,
  sendProgress,
  type AnalyzeResponse,
  type ErrorKind,
} from '../lib/messaging';
import {
  getSettings,
  hasCredentials,
  getCachedGrouping,
  setCachedGrouping,
  type Settings,
} from '../lib/storage';
import { originPattern } from '../lib/host-permission';
import {
  fetchPullRequest,
  fetchPullRequestHead,
  GithubApiError,
} from '../lib/github/client';
import { AnthropicError } from '../lib/anthropic/client';
import { OpenAIError } from '../lib/openai/client';
import { CarevieError } from '../lib/carevie/client';
import { GroupingValidationError } from '../lib/grouping/validate';
import { requestGroupingForSettings } from '../lib/llm/dispatch';
import { runAnalysis } from '../lib/pipeline';

const RAW_SNIPPET_LIMIT = 2000;

function toErrorResponse(err: unknown): Extract<AnalyzeResponse, { type: 'ERROR' }> {
  let kind: ErrorKind = 'unknown';
  let detail: string | undefined;
  if (err instanceof GithubApiError) {
    kind = err.rateLimited ? 'rate-limit' : 'github';
  } else if (err instanceof OpenAIError) {
    kind = err.rateLimited ? 'rate-limit' : 'openai';
  } else if (err instanceof CarevieError) {
    kind = err.rateLimited ? 'rate-limit' : 'carevie';
  } else if (err instanceof AnthropicError) {
    kind = err.status === 429 ? 'rate-limit' : 'anthropic';
  } else if (err instanceof GroupingValidationError) {
    // The model returned malformed grouping JSON — surface what it sent.
    kind = 'unknown';
    detail = err.raw?.slice(0, RAW_SNIPPET_LIMIT);
  }
  return {
    type: 'ERROR',
    error: err instanceof Error ? err.message : String(err),
    kind,
    detail,
  };
}

/**
 * The active provider's base-URL host permission, if it has NOT been granted.
 * Catches the common "manifest gained a host but the extension wasn't
 * reloaded / the grant was declined" case before it surfaces as an opaque
 * "Failed to fetch".
 */
async function ungrantedProviderHost(settings: Settings): Promise<string | null> {
  const baseUrl =
    settings.provider === 'openai'
      ? settings.openaiBaseUrl
      : settings.provider === 'carevie'
        ? settings.carevieBaseUrl
        : settings.provider === 'local'
          ? settings.localBaseUrl
          : null;
  if (!baseUrl) return null;
  const pattern = originPattern(baseUrl);
  if (!pattern) return null;
  try {
    return (await browser.permissions.contains({ origins: [pattern] }))
      ? null
      : pattern;
  } catch {
    return null; // Can't check — let the request itself report the failure.
  }
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: unknown) => {
    if (isOpenOptionsRequest(message)) {
      void browser.runtime.openOptionsPage();
    }
    return false;
  });

  onAnalyze(async (req, sender): Promise<AnalyzeResponse> => {
    const settings = await getSettings();
    if (!hasCredentials(settings)) {
      return {
        type: 'ERROR',
        error: 'Add a GitHub token and your LLM provider credentials in the extension options.',
        kind: 'missing-credentials',
      };
    }

    const ungranted = await ungrantedProviderHost(settings);
    if (ungranted) {
      return {
        type: 'ERROR',
        error:
          `The extension does not have permission to call ${ungranted}. ` +
          'Re-save the extension options to grant it (or reload the extension if it was just updated).',
        kind: settings.provider === 'carevie' ? 'carevie' : 'openai',
      };
    }

    const started = Date.now();
    const trace: string[] = [];
    const tabId = sender.tab?.id;
    const traceLine = (line: string) => {
      trace.push(line);
      // Stream each phase to the panel so long runs are not a black box.
      if (tabId !== undefined) sendProgress(tabId, line);
    };
    try {
      const { result, fromCache, cachedAt, diagnostics } = await runAnalysis(
        {
          owner: req.owner,
          repo: req.repo,
          number: req.number,
          settings,
          force: req.force,
        },
        {
          fetchPRHead: fetchPullRequestHead,
          fetchPR: fetchPullRequest,
          requestGrouping: (args) => requestGroupingForSettings(args),
          getCache: getCachedGrouping,
          setCache: setCachedGrouping,
          trace: traceLine,
        },
      );
      return {
        type: 'RESULT',
        result,
        fromCache,
        debug: {
          ...diagnostics,
          fromCache,
          cachedAt,
          durationMs: Date.now() - started,
          trace,
        },
      };
    } catch (err) {
      trace.push(
        `failed after ${Date.now() - started}ms: ${err instanceof Error ? err.name : typeof err}`,
      );
      return { ...toErrorResponse(err), debug: { trace } };
    }
  });
});
