import { describe, it, expect, vi } from 'vitest';
import {
  requestGrouping,
  reviewFilesUrl,
  parseCarevieBody,
  CarevieError,
} from './client';
import { GroupingValidationError } from '../grouping/validate';

const grouping = {
  intent: 'Adds a widget.',
  changeType: 'feature',
  groups: [
    { id: 'g1', title: 'Widget', label: 'behavioral', rationale: 'r', files: ['a.ts'] },
  ],
  readingOrder: [{ groupId: 'g1', reason: 'only' }],
};

const params = {
  token: 'tok',
  baseUrl: 'https://carevie.dolpc.com',
  owner: 'sundayfun',
  repo: 'siuper-tools',
  number: 20,
};

function mockFetch(body: string, status = 200) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
    return new Response(body, { status });
  });
}

describe('reviewFilesUrl', () => {
  it('builds the review-files endpoint with provider/repo/pr params', () => {
    expect(reviewFilesUrl(params)).toBe(
      'https://carevie.dolpc.com/api/review-files?provider=github&repo=sundayfun%2Fsiuper-tools&pr=20',
    );
  });

  it('tolerates a trailing slash on the base URL', () => {
    expect(reviewFilesUrl({ ...params, baseUrl: 'https://x.example/' })).toContain(
      'https://x.example/api/review-files?',
    );
  });
});

describe('parseCarevieBody', () => {
  it('parses a bare grouping response', () => {
    const res = parseCarevieBody(JSON.stringify(grouping));
    expect(res.groups[0]?.files).toEqual(['a.ts']);
  });

  it('unwraps a {data} envelope holding the grouping object', () => {
    const res = parseCarevieBody(JSON.stringify({ data: grouping }));
    expect(res.intent).toBe('Adds a widget.');
  });

  it('unwraps a {result} envelope holding a JSON string', () => {
    const res = parseCarevieBody(
      JSON.stringify({ result: JSON.stringify(grouping) }),
    );
    expect(res.changeType).toBe('feature');
  });

  it('throws a GroupingValidationError carrying the full raw body', () => {
    const body = JSON.stringify({ unexpected: true });
    let raw: string | undefined;
    try {
      parseCarevieBody(body);
    } catch (err) {
      expect(err).toBeInstanceOf(GroupingValidationError);
      raw = (err as GroupingValidationError).raw;
    }
    expect(raw).toBe(body);
  });
});

describe('requestGrouping', () => {
  it('sends a GET with the bearer token and returns the parsed grouping', async () => {
    const fetchMock = mockFetch(JSON.stringify(grouping));
    const res = await requestGrouping(params, fetchMock as unknown as typeof fetch);
    expect(res.groups).toHaveLength(1);

    const call = fetchMock.mock.calls[0]!;
    expect(String(call[0])).toContain('/api/review-files?provider=github');
    expect(call[1]!.method).toBe('GET');
    expect((call[1]!.headers as Record<string, string>).Authorization).toBe(
      'Bearer tok',
    );
  });

  it('maps 401 to a token error', async () => {
    const fetchMock = mockFetch('unauthorized', 401);
    await expect(
      requestGrouping(params, fetchMock as unknown as typeof fetch),
    ).rejects.toMatchObject({
      name: 'CarevieError',
      status: 401,
      rateLimited: false,
    });
  });

  it('flags 429 as rate limited', async () => {
    const fetchMock = mockFetch('slow down', 429);
    const err = await requestGrouping(
      params,
      fetchMock as unknown as typeof fetch,
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CarevieError);
    expect((err as CarevieError).rateLimited).toBe(true);
  });
});
