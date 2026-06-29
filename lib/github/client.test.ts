import { describe, it, expect, vi } from 'vitest';
import {
  parseLinkedIssues,
  mapFile,
  fetchPullRequest,
  GithubApiError,
} from './client';

describe('parseLinkedIssues', () => {
  it('extracts closing references, deduped', () => {
    const body = 'Fixes #12 and closes #34. Also Resolves: #12.';
    expect(parseLinkedIssues(body).sort()).toEqual([12, 34]);
  });

  it('ignores plain issue mentions', () => {
    expect(parseLinkedIssues('see #99 for context')).toEqual([]);
  });
});

describe('mapFile', () => {
  it('parses hunks from the patch', () => {
    const fd = mapFile({
      filename: 'src/a.ts',
      status: 'modified',
      additions: 2,
      deletions: 1,
      patch: '@@ -1,2 +1,3 @@\n-old\n+new\n+extra',
    });
    expect(fd.path).toBe('src/a.ts');
    expect(fd.hunks).toHaveLength(1);
    expect(fd.isBinary).toBe(false);
  });

  it('marks patch-less zero-change files as binary', () => {
    const fd = mapFile({
      filename: 'logo.png',
      status: 'added',
      additions: 0,
      deletions: 0,
    });
    expect(fd.isBinary).toBe(true);
  });

  it('captures rename info', () => {
    const fd = mapFile({
      filename: 'src/new.ts',
      previous_filename: 'src/old.ts',
      status: 'renamed',
      additions: 0,
      deletions: 0,
    });
    expect(fd.status).toBe('renamed');
    expect(fd.previousPath).toBe('src/old.ts');
  });
});

describe('fetchPullRequest', () => {
  function jsonResponse(body: unknown): Response {
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  it('assembles PR data from the API endpoints', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.endsWith('/pulls/7')) {
        return jsonResponse({
          title: 'Add caching',
          body: 'Speeds things up. Closes #5',
          user: { login: 'octocat' },
          base: { ref: 'main' },
          head: { ref: 'feat/cache', sha: 'abc123' },
        });
      }
      if (u.includes('/files')) {
        return jsonResponse([
          {
            filename: 'src/cache.ts',
            status: 'added',
            additions: 10,
            deletions: 0,
            patch: '@@ -0,0 +1,2 @@\n+a\n+b',
          },
        ]);
      }
      if (u.includes('/commits')) {
        return jsonResponse([{ commit: { message: 'Add cache\n\ndetails' } }]);
      }
      throw new Error(`unexpected url ${u}`);
    });

    const pr = await fetchPullRequest(
      { owner: 'o', repo: 'r', number: 7, token: 't' },
      fetchMock as unknown as typeof fetch,
    );

    expect(pr.title).toBe('Add caching');
    expect(pr.headSha).toBe('abc123');
    expect(pr.files).toHaveLength(1);
    expect(pr.commitMessages).toEqual(['Add cache']);
    expect(pr.linkedIssues).toEqual([5]);
  });

  it('throws a rate-limit error on 403 with no remaining quota', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response('rate limited', {
          status: 403,
          headers: { 'X-RateLimit-Remaining': '0' },
        }),
    );
    await expect(
      fetchPullRequest(
        { owner: 'o', repo: 'r', number: 1, token: 't' },
        fetchMock as unknown as typeof fetch,
      ),
    ).rejects.toMatchObject({ rateLimited: true } satisfies Partial<GithubApiError>);
  });
});
