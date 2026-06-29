import Anthropic from '@anthropic-ai/sdk';
import { GROUPING_SCHEMA } from '../grouping/schema';
import { parseGroupingResponse } from '../grouping/validate';
import type { GroupingResponse } from '../grouping/types';

export type Effort = 'low' | 'medium' | 'high';

export const MODELS = [
  'claude-opus-4-8',
  'claude-sonnet-4-6',
  'claude-haiku-4-5',
] as const;
export type Model = (typeof MODELS)[number];

export class AnthropicError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'AnthropicError';
    this.status = status;
  }
}

/** Minimal shape of the message we read back — keeps deps injectable/testable. */
interface MessageLike {
  content: Array<{ type: string; text?: string }>;
}

export type CreateMessageFn = (req: {
  apiKey: string;
  model: string;
  effort: Effort;
  system: string;
  userContent: string;
}) => Promise<MessageLike>;

export interface GroupingRequestParams {
  apiKey: string;
  model: Model | string;
  effort: Effort;
  system: string;
  userContent: string;
}

/** Pull the first text block out of a model response. Pure. */
export function extractTextBlock(message: MessageLike): string {
  const block = message.content.find((b) => b.type === 'text' && b.text);
  if (!block?.text) {
    throw new AnthropicError('model response contained no text block');
  }
  return block.text;
}

/** Real SDK-backed message create. Calls Claude directly from the browser. */
const defaultCreateMessage: CreateMessageFn = async ({
  apiKey,
  model,
  effort,
  system,
  userContent,
}) => {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  // Extra fields (output_config, thinking) are valid API params; cast to satisfy
  // whichever SDK type version is installed.
  const request = {
    model,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    output_config: {
      effort,
      format: { type: 'json_schema', schema: GROUPING_SCHEMA },
    },
    system,
    messages: [{ role: 'user', content: userContent }],
  } as unknown as Anthropic.Messages.MessageCreateParamsNonStreaming;

  try {
    return (await client.messages.create(request)) as unknown as MessageLike;
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      throw new AnthropicError(err.message, err.status);
    }
    throw new AnthropicError(String(err));
  }
};

/**
 * Ask Claude to group the (interesting) diff. Returns validated grouping JSON.
 *
 * @param deps Injectable `createMessage` for tests; defaults to the real SDK.
 */
export async function requestGrouping(
  params: GroupingRequestParams,
  deps: { createMessage?: CreateMessageFn } = {},
): Promise<GroupingResponse> {
  const create = deps.createMessage ?? defaultCreateMessage;
  const message = await create(params);
  const text = extractTextBlock(message);
  return parseGroupingResponse(text);
}
