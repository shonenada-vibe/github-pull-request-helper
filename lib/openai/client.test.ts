import { describe, it, expect, vi } from 'vitest';
import {
  chatCompletionsUrl,
  extractContent,
  requestGrouping,
  OpenAIError,
} from './client';

const groupingJson = JSON.stringify({
  intent: 'Add a feature flag.',
  changeType: 'feature',
  groups: [
    {
      id: 'g1',
      title: 'Flag',
      label: 'config',
      rationale: 'New flag.',
      files: ['src/flags.ts'],
    },
  ],
  readingOrder: [{ groupId: 'g1', reason: 'Only group.' }],
});

describe('chatCompletionsUrl', () => {
  it('appends the endpoint, normalizing trailing slashes', () => {
    expect(chatCompletionsUrl('https://api.openai.com/v1')).toBe(
      'https://api.openai.com/v1/chat/completions',
    );
    expect(chatCompletionsUrl('http://localhost:1234/v1/')).toBe(
      'http://localhost:1234/v1/chat/completions',
    );
  });
});

describe('extractContent', () => {
  it('returns the first choice message content', () => {
    expect(
      extractContent({ choices: [{ message: { content: 'hi' } }] }),
    ).toBe('hi');
  });

  it('throws on an empty completion', () => {
    expect(() => extractContent({ choices: [] })).toThrow(OpenAIError);
  });
});

describe('requestGrouping', () => {
  it('posts a structured-output request and validates the response', async () => {
    const fetchMock = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(
          JSON.stringify({ choices: [{ message: { content: groupingJson } }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );

    const result = await requestGrouping(
      {
        apiKey: 'sk-test',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o-mini',
        system: 'sys',
        userContent: 'user',
      },
      fetchMock as unknown as typeof fetch,
    );

    expect(result.changeType).toBe('feature');
    const call = fetchMock.mock.calls[0]!;
    expect(call[0]).toBe('https://api.openai.com/v1/chat/completions');
    const init = call[1]!;
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer sk-test');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('gpt-4o-mini');
    expect(body.response_format.type).toBe('json_schema');
    expect(body.messages[0].role).toBe('system');
  });

  it('throws a rate-limit error on 429', async () => {
    const fetchMock = vi.fn(async () => new Response('slow down', { status: 429 }));
    await expect(
      requestGrouping(
        {
          apiKey: 'k',
          baseUrl: 'https://api.openai.com/v1',
          model: 'm',
          system: 's',
          userContent: 'u',
        },
        fetchMock as unknown as typeof fetch,
      ),
    ).rejects.toMatchObject({ rateLimited: true } satisfies Partial<OpenAIError>);
  });

  it('wraps a network-level failure with the host and a permission hint', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const err = await requestGrouping(
      {
        apiKey: 'k',
        baseUrl: 'https://api.example.com/v1',
        model: 'm',
        system: 's',
        userContent: 'u',
      },
      fetchMock as unknown as typeof fetch,
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OpenAIError);
    expect((err as OpenAIError).message).toContain('https://api.example.com');
    expect((err as OpenAIError).message).toContain('Failed to fetch');
  });
});
