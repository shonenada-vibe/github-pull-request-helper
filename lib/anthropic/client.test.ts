import { describe, it, expect, vi } from 'vitest';
import { extractTextBlock, requestGrouping, AnthropicError } from './client';

const groupingJson = JSON.stringify({
  intent: 'Refactor the parser.',
  changeType: 'refactor',
  groups: [
    {
      id: 'g1',
      title: 'Parser',
      label: 'refactor',
      rationale: 'Extracted helper.',
      files: ['src/parse.ts'],
    },
  ],
  readingOrder: [{ groupId: 'g1', reason: 'Only group.' }],
});

describe('extractTextBlock', () => {
  it('returns the first text block', () => {
    expect(
      extractTextBlock({
        content: [
          { type: 'thinking' },
          { type: 'text', text: 'hello' },
        ],
      }),
    ).toBe('hello');
  });

  it('throws when there is no text block', () => {
    expect(() => extractTextBlock({ content: [{ type: 'thinking' }] })).toThrow(
      AnthropicError,
    );
  });
});

describe('requestGrouping', () => {
  it('validates and returns the grouping from the injected create fn', async () => {
    const createMessage = vi.fn(async () => ({
      content: [{ type: 'text', text: groupingJson }],
    }));

    const result = await requestGrouping(
      {
        apiKey: 'k',
        model: 'claude-opus-4-8',
        effort: 'medium',
        system: 'sys',
        userContent: 'user',
      },
      { createMessage },
    );

    expect(createMessage).toHaveBeenCalledOnce();
    expect(result.changeType).toBe('refactor');
    expect(result.groups[0]?.files).toEqual(['src/parse.ts']);
  });
});
