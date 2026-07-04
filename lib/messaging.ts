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
  /** When fromCache, the timestamp the entry was originally saved. */
  cachedAt?: number;
  durationMs: number;
  /** Per-phase trace lines from the background pipeline. */
  trace?: string[];
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
  | 'carevie'
  | 'unknown';

/** Content script -> background: open the extension Options page. */
export interface OpenOptionsRequest {
  type: 'OPEN_OPTIONS';
}

/** Background -> content script: a pipeline phase finished (live progress). */
export interface ProgressEvent {
  type: 'PROGRESS';
  line: string;
}

export type Message = AnalyzeRequest | OpenOptionsRequest | ProgressEvent;

export function isProgressEvent(value: unknown): value is ProgressEvent {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === 'PROGRESS' &&
    typeof (value as { line?: unknown }).line === 'string'
  );
}

/** Push a live progress line to the tab that requested the analysis. */
export function sendProgress(tabId: number, line: string): void {
  void browser.tabs.sendMessage(tabId, { type: 'PROGRESS', line }).catch(() => {
    // The tab may have navigated away; progress is best-effort.
  });
}

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

/** The subset of MessageSender the analyze handler needs. */
export interface AnalyzeSender {
  tab?: { id?: number };
}

/** Register the background handler. Returns nothing; call once in the worker. */
export function onAnalyze(
  handler: (req: AnalyzeRequest, sender: AnalyzeSender) => Promise<AnalyzeResponse>,
): void {
  browser.runtime.onMessage.addListener(
    (message: unknown, sender, sendResponse: (r: AnalyzeResponse) => void) => {
      if (!isAnalyzeRequest(message)) return false;
      handler(message, sender as AnalyzeSender)
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
