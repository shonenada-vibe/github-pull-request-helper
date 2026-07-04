import { parseGroupingResponse, GroupingValidationError } from '../grouping/validate';
import type { GroupingResponse } from '../grouping/types';

export class CarevieError extends Error {
  status?: number;
  rateLimited: boolean;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'CarevieError';
    this.status = status;
    this.rateLimited = status === 429;
  }
}

export interface CarevieReviewParams {
  token: string;
  /** Service base URL, e.g. https://carevie.dolpc.com */
  baseUrl: string;
  owner: string;
  repo: string;
  number: number;
}

/** Build the review-files endpoint from a (possibly trailing-slashed) base URL. */
export function reviewFilesUrl(params: CarevieReviewParams): string {
  const base = params.baseUrl.replace(/\/+$/, '');
  const query = new URLSearchParams({
    provider: 'github',
    repo: `${params.owner}/${params.repo}`,
    pr: String(params.number),
  });
  return `${base}/api/review-files?${query}`;
}

/** Common envelope keys a review service might wrap its payload in. */
const ENVELOPE_KEYS = ['data', 'result', 'review', 'analysis', 'grouping'] as const;

/**
 * Parse the service response into a GroupingResponse. Tries the body as-is
 * first, then unwraps one level of a common envelope ({data}, {result}, …)
 * whose value may be the grouping object or a JSON string of it.
 */
export function parseCarevieBody(text: string): GroupingResponse {
  let firstError: unknown;
  try {
    return parseGroupingResponse(text);
  } catch (err) {
    firstError = err;
  }

  let outer: unknown;
  try {
    outer = JSON.parse(text);
  } catch {
    throw firstError;
  }
  if (typeof outer === 'object' && outer !== null && !Array.isArray(outer)) {
    for (const key of ENVELOPE_KEYS) {
      const inner = (outer as Record<string, unknown>)[key];
      if (inner == null) continue;
      const innerText = typeof inner === 'string' ? inner : JSON.stringify(inner);
      try {
        return parseGroupingResponse(innerText);
      } catch {
        // Fall through and report the original failure against the full body.
      }
    }
  }
  if (firstError instanceof GroupingValidationError) firstError.raw = text;
  throw firstError;
}

/**
 * Ask the Carevie review service for a PR analysis. Unlike the LLM providers,
 * this endpoint takes the PR coordinates and does its own fetching/grouping
 * server-side; we only validate the returned grouping JSON.
 *
 * @param fetchImpl Injectable fetch (defaults to global `fetch`) for testing.
 */
export async function requestGrouping(
  params: CarevieReviewParams,
  fetchImpl: typeof fetch = fetch,
): Promise<GroupingResponse> {
  const url = reviewFilesUrl(params);
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${params.token}` },
    });
  } catch (err) {
    // Network-level failure (no response): unreachable host, or the extension
    // lacks the host permission so the request died on CORS.
    throw new CarevieError(
      `Could not reach ${new URL(url).origin} (${String(err)}). ` +
        'Check the extension has access to this host (re-save the options to grant it, ' +
        'or reload the extension after an update) and that the service is up.',
    );
  }

  if (!res.ok) {
    throw new CarevieError(
      res.status === 401 || res.status === 403
        ? 'Carevie rejected the token — check it in the extension options'
        : res.status === 429
          ? 'Carevie API rate limit exceeded'
          : `Carevie API error ${res.status}`,
      res.status,
    );
  }

  return parseCarevieBody(await res.text());
}
