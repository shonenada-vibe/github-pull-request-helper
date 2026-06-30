import { defineBackground } from '#imports';
import { browser } from 'wxt/browser';
import {
  onAnalyze,
  isOpenOptionsRequest,
  type AnalyzeResponse,
  type ErrorKind,
} from '../lib/messaging';
import { getSettings, hasCredentials, getCachedGrouping, setCachedGrouping } from '../lib/storage';
import { fetchPullRequest, GithubApiError } from '../lib/github/client';
import { AnthropicError } from '../lib/anthropic/client';
import { OpenAIError } from '../lib/openai/client';
import { GroupingValidationError } from '../lib/grouping/validate';
import { requestGroupingForSettings } from '../lib/llm/dispatch';
import { runAnalysis } from '../lib/pipeline';

const RAW_SNIPPET_LIMIT = 2000;

function toErrorResponse(err: unknown): AnalyzeResponse {
  let kind: ErrorKind = 'unknown';
  let detail: string | undefined;
  if (err instanceof GithubApiError) {
    kind = err.rateLimited ? 'rate-limit' : 'github';
  } else if (err instanceof OpenAIError) {
    kind = err.rateLimited ? 'rate-limit' : 'openai';
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

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: unknown) => {
    if (isOpenOptionsRequest(message)) {
      void browser.runtime.openOptionsPage();
    }
    return false;
  });

  onAnalyze(async (req): Promise<AnalyzeResponse> => {
    const settings = await getSettings();
    if (!hasCredentials(settings)) {
      return {
        type: 'ERROR',
        error: 'Add a GitHub token and your LLM provider credentials in the extension options.',
        kind: 'missing-credentials',
      };
    }

    const started = Date.now();
    try {
      const { result, fromCache, diagnostics } = await runAnalysis(
        {
          owner: req.owner,
          repo: req.repo,
          number: req.number,
          settings,
          force: req.force,
        },
        {
          fetchPR: fetchPullRequest,
          requestGrouping: (args) => requestGroupingForSettings(args),
          getCache: getCachedGrouping,
          setCache: setCachedGrouping,
        },
      );
      return {
        type: 'RESULT',
        result,
        fromCache,
        debug: { ...diagnostics, fromCache, durationMs: Date.now() - started },
      };
    } catch (err) {
      return toErrorResponse(err);
    }
  });
});
