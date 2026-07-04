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

const pr = { owner: 'o', repo: 'r', number: 1 };

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
        pr,
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
        pr,
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

  it('routes to the local bridge via the OpenAI client when provider is local', async () => {
    const openaiFetch = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(
          JSON.stringify({ choices: [{ message: { content: JSON.stringify(grouping) } }] }),
          { status: 200 },
        ),
    );

    const result = await requestGroupingForSettings(
      {
        settings: { ...DEFAULT_SETTINGS, provider: 'local', localAgent: 'codex' },
        system: 's',
        userContent: 'u',
        pr,
      },
      { openaiFetch: openaiFetch as unknown as typeof fetch },
    );

    expect(openaiFetch).toHaveBeenCalledOnce();
    const call = openaiFetch.mock.calls[0]!;
    expect(String(call[0])).toBe('http://127.0.0.1:8765/v1/chat/completions');
    const body = JSON.parse(call[1]!.body as string);
    expect(body.model).toBe('codex');
    expect(result.intent).toBe('x');
  });

  it('routes to the Carevie client (with PR coordinates) when provider is carevie', async () => {
    const anthropicCreate = vi.fn();
    const carevieFetch = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(JSON.stringify(grouping), { status: 200 }),
    );

    const result = await requestGroupingForSettings(
      {
        settings: {
          ...DEFAULT_SETTINGS,
          provider: 'carevie',
          carevieToken: 'tok',
        },
        system: 's',
        userContent: 'u',
        pr: { owner: 'sundayfun', repo: 'siuper-tools', number: 20 },
      },
      {
        anthropicCreate: anthropicCreate as never,
        carevieFetch: carevieFetch as unknown as typeof fetch,
      },
    );

    expect(carevieFetch).toHaveBeenCalledOnce();
    expect(anthropicCreate).not.toHaveBeenCalled();
    const url = String(carevieFetch.mock.calls[0]![0]);
    expect(url).toContain('repo=sundayfun%2Fsiuper-tools');
    expect(url).toContain('pr=20');
    expect(result.intent).toBe('x');
  });
});
