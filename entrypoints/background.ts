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
import { requestGrouping, AnthropicError } from '../lib/anthropic/client';
import { runAnalysis } from '../lib/pipeline';

function toErrorResponse(err: unknown): AnalyzeResponse {
  let kind: ErrorKind = 'unknown';
  if (err instanceof GithubApiError) {
    kind = err.rateLimited ? 'rate-limit' : 'github';
  } else if (err instanceof AnthropicError) {
    kind = 'anthropic';
  }
  return { type: 'ERROR', error: err instanceof Error ? err.message : String(err), kind };
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
        error: 'Add a GitHub token and Anthropic API key in the extension options.',
        kind: 'missing-credentials',
      };
    }

    try {
      const { result, fromCache } = await runAnalysis(
        {
          owner: req.owner,
          repo: req.repo,
          number: req.number,
          settings,
          force: req.force,
        },
        {
          fetchPR: fetchPullRequest,
          requestGrouping,
          getCache: getCachedGrouping,
          setCache: setCachedGrouping,
        },
      );
      return { type: 'RESULT', result, fromCache };
    } catch (err) {
      return toErrorResponse(err);
    }
  });
});
