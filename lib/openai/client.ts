import { GROUPING_SCHEMA } from '../grouping/schema';
import { parseGroupingResponse } from '../grouping/validate';
import type { GroupingResponse } from '../grouping/types';

export class OpenAIError extends Error {
  status?: number;
  rateLimited: boolean;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'OpenAIError';
    this.status = status;
    this.rateLimited = status === 429;
  }
}

export interface OpenAIGroupingParams {
  apiKey: string;
  /** OpenAI-compatible base URL, e.g. https://api.openai.com/v1 */
  baseUrl: string;
  model: string;
  system: string;
  userContent: string;
}

interface ChatCompletion {
  choices?: Array<{ message?: { content?: string | null } }>;
}

/** Build the chat-completions endpoint from a (possibly trailing-slashed) base URL. */
export function chatCompletionsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
}

/** Pull the assistant message content out of a chat completion. Pure. */
export function extractContent(data: ChatCompletion): string {
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.length === 0) {
    throw new OpenAIError('completion contained no message content');
  }
  return content;
}

/**
 * Ask an OpenAI-compatible chat-completions endpoint to group the diff and
 * return validated grouping JSON. Uses structured outputs (`json_schema`); the
 * system prompt also instructs JSON, so servers that ignore `response_format`
 * still produce parseable output.
 *
 * @param fetchImpl Injectable fetch (defaults to global `fetch`) for testing.
 */
export async function requestGrouping(
  params: OpenAIGroupingParams,
  fetchImpl: typeof fetch = fetch,
): Promise<GroupingResponse> {
  const url = chatCompletionsUrl(params.baseUrl);
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${params.apiKey}`,
      },
      body: JSON.stringify({
        model: params.model,
        messages: [
          { role: 'system', content: params.system },
          { role: 'user', content: params.userContent },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'pr_grouping', strict: true, schema: GROUPING_SCHEMA },
        },
      }),
    });
  } catch (err) {
    // Network-level failure (no response): unreachable host, or the extension
    // lacks the host permission so the request died on CORS.
    throw new OpenAIError(
      `Could not reach ${new URL(url).origin} (${String(err)}). ` +
        'Check the extension has access to this host (re-save the options to grant it) ' +
        'and that the server is up.',
    );
  }

  if (!res.ok) {
    throw new OpenAIError(
      res.status === 429
        ? 'OpenAI-compatible API rate limit exceeded'
        : `OpenAI-compatible API error ${res.status}`,
      res.status,
    );
  }

  const data = (await res.json()) as ChatCompletion;
  return parseGroupingResponse(extractContent(data));
}
