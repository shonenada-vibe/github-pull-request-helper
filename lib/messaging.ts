import { browser } from 'wxt/browser';
import type { GroupingResult } from './grouping/types';

/** Content script -> background: analyze this PR. */
export interface AnalyzeRequest {
  type: 'ANALYZE';
  owner: string;
  repo: string;
  number: number;
  /** When true, bypass the cache and re-run analysis. */
  force?: boolean;
}

/** Diagnostics surfaced in the panel's debug section. */
export interface DebugInfo {
  provider: string;
  model: string;
  totalFiles: number;
  interesting: number;
  mechanical: number;
  usedLlm: boolean;
  fromCache: boolean;
  durationMs: number;
}

export type AnalyzeResponse =
  | { type: 'RESULT'; result: GroupingResult; fromCache: boolean; debug: DebugInfo }
  | {
      type: 'ERROR';
      error: string;
      kind: ErrorKind;
      /** Extra debugging context, e.g. the raw model output that failed to parse. */
      detail?: string;
      debug?: Partial<DebugInfo>;
    };

export type ErrorKind =
  | 'missing-credentials'
  | 'github'
  | 'rate-limit'
  | 'anthropic'
  | 'openai'
  | 'unknown';

/** Content script -> background: open the extension Options page. */
export interface OpenOptionsRequest {
  type: 'OPEN_OPTIONS';
}

export type Message = AnalyzeRequest | OpenOptionsRequest;

/** Typed send from the content script. */
export function sendAnalyze(req: AnalyzeRequest): Promise<AnalyzeResponse> {
  return browser.runtime.sendMessage(req) as Promise<AnalyzeResponse>;
}

/** Ask the background worker to open the Options page. */
export function sendOpenOptions(): void {
  void browser.runtime.sendMessage({ type: 'OPEN_OPTIONS' } satisfies OpenOptionsRequest);
}

export function isOpenOptionsRequest(value: unknown): value is OpenOptionsRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === 'OPEN_OPTIONS'
  );
}

/** Register the background handler. Returns nothing; call once in the worker. */
export function onAnalyze(
  handler: (req: AnalyzeRequest) => Promise<AnalyzeResponse>,
): void {
  browser.runtime.onMessage.addListener(
    (message: unknown, _sender, sendResponse: (r: AnalyzeResponse) => void) => {
      if (!isAnalyzeRequest(message)) return false;
      handler(message)
        .then(sendResponse)
        .catch((err) =>
          sendResponse({ type: 'ERROR', error: String(err), kind: 'unknown' }),
        );
      return true; // keep the channel open for the async response
    },
  );
}

export function isAnalyzeRequest(value: unknown): value is AnalyzeRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === 'ANALYZE'
  );
}
