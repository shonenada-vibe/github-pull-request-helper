import { describe, it, expect, vi } from 'vitest';
import { requestGroupingForSettings } from './dispatch';
import { DEFAULT_SETTINGS } from '../storage';

const grouping = {
  intent: 'x',
  changeType: 'chore',
  groups: [
    { id: 'g1', title: 'T', label: 'config', rationale: 'r', files: ['a.ts'] },
  ],
  readingOrder: [{ groupId: 'g1', reason: 'only' }],
};

describe('requestGroupingForSettings', () => {
  it('routes to the Anthropic client when provider is anthropic', async () => {
    const anthropicCreate = vi.fn(async () => ({
      content: [{ type: 'text', text: JSON.stringify(grouping) }],
    }));
    const openaiFetch = vi.fn();

    const result = await requestGroupingForSettings(
      {
        settings: { ...DEFAULT_SETTINGS, provider: 'anthropic', anthropicApiKey: 'k' },
        system: 's',
        userContent: 'u',
      },
      { anthropicCreate, openaiFetch: openaiFetch as unknown as typeof fetch },
    );

    expect(anthropicCreate).toHaveBeenCalledOnce();
    expect(openaiFetch).not.toHaveBeenCalled();
    expect(result.changeType).toBe('chore');
  });

  it('routes to the OpenAI-compatible client when provider is openai', async () => {
    const anthropicCreate = vi.fn();
    const openaiFetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ choices: [{ message: { content: JSON.stringify(grouping) } }] }),
          { status: 200 },
        ),
    );

    const result = await requestGroupingForSettings(
      {
        settings: {
          ...DEFAULT_SETTINGS,
          provider: 'openai',
          openaiApiKey: 'k',
          openaiModel: 'gpt-4o-mini',
        },
        system: 's',
        userContent: 'u',
      },
      {
        anthropicCreate: anthropicCreate as never,
        openaiFetch: openaiFetch as unknown as typeof fetch,
      },
    );

    expect(openaiFetch).toHaveBeenCalledOnce();
    expect(anthropicCreate).not.toHaveBeenCalled();
    expect(result.groups[0]?.files).toEqual(['a.ts']);
  });
});
