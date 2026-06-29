import type { FileDiff, FileStatus, PullRequestData } from '../types';
import { parseHunks } from '../diff/parse-diff';

export class GithubApiError extends Error {
  status: number;
  /** True when the failure is a GitHub rate-limit. */
  rateLimited: boolean;
  constructor(message: string, status: number, rateLimited = false) {
    super(message);
    this.name = 'GithubApiError';
    this.status = status;
    this.rateLimited = rateLimited;
  }
}

/** Raw shape of an item from `GET /pulls/{n}/files`. */
interface GithubFile {
  filename: string;
  previous_filename?: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
}

export interface FetchPullRequestParams {
  owner: string;
  repo: string;
  number: number;
  token: string;
}

const API = 'https://api.github.com';
const PER_PAGE = 100;

/** Extract issue numbers from `Closes #12` / `Fixes #34` style references. */
export function parseLinkedIssues(body: string): number[] {
  const re = /\b(?:close|closes|closed|fix|fixes|fixed|resolve|resolves|resolved)\b[:\s]+#(\d+)/gi;
  const found = new Set<number>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    found.add(Number(m[1]));
  }
  return [...found];
}

function mapStatus(status: string): FileStatus {
  switch (status) {
    case 'added':
    case 'removed':
    case 'modified':
    case 'renamed':
    case 'copied':
    case 'changed':
      return status;
    default:
      return 'modified';
  }
}

/** Convert a raw GitHub file entry into our FileDiff. Pure. */
export function mapFile(raw: GithubFile): FileDiff {
  const isBinary = raw.patch === undefined && raw.additions === 0 && raw.deletions === 0;
  return {
    path: raw.filename,
    previousPath: raw.previous_filename,
    status: mapStatus(raw.status),
    isBinary,
    additions: raw.additions,
    deletions: raw.deletions,
    hunks: parseHunks(raw.patch),
  };
}

type FetchImpl = typeof fetch;

async function ghGet(
  url: string,
  token: string,
  accept: string,
  fetchImpl: FetchImpl,
): Promise<Response> {
  const res = await fetchImpl(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: accept,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!res.ok) {
    const rateLimited =
      res.status === 403 && res.headers.get('X-RateLimit-Remaining') === '0';
    throw new GithubApiError(
      rateLimited
        ? 'GitHub API rate limit exceeded'
        : `GitHub API error ${res.status} for ${url}`,
      res.status,
      rateLimited,
    );
  }
  return res;
}

/**
 * Fetch everything needed to analyze a PR: metadata, changed files (paginated),
 * and commit messages.
 *
 * @param fetchImpl Injectable fetch (defaults to global `fetch`) for testing.
 */
export async function fetchPullRequest(
  { owner, repo, number, token }: FetchPullRequestParams,
  fetchImpl: FetchImpl = fetch,
): Promise<PullRequestData> {
  const base = `${API}/repos/${owner}/${repo}/pulls/${number}`;

  const metaRes = await ghGet(base, token, 'application/vnd.github+json', fetchImpl);
  const meta = (await metaRes.json()) as {
    title: string;
    body: string | null;
    user: { login: string } | null;
    base: { ref: string };
    head: { ref: string; sha: string };
  };

  const files: FileDiff[] = [];
  for (let page = 1; ; page++) {
    const res = await ghGet(
      `${base}/files?per_page=${PER_PAGE}&page=${page}`,
      token,
      'application/vnd.github+json',
      fetchImpl,
    );
    const batch = (await res.json()) as GithubFile[];
    files.push(...batch.map(mapFile));
    if (batch.length < PER_PAGE) break;
  }

  const commitsRes = await ghGet(
    `${base}/commits?per_page=${PER_PAGE}`,
    token,
    'application/vnd.github+json',
    fetchImpl,
  );
  const commits = (await commitsRes.json()) as Array<{
    commit: { message: string };
  }>;
  const commitMessages = commits.map((c) => c.commit.message.split('\n')[0] ?? '');

  const body = meta.body ?? '';
  return {
    owner,
    repo,
    number,
    title: meta.title,
    body,
    author: meta.user?.login ?? 'unknown',
    baseRef: meta.base.ref,
    headRef: meta.head.ref,
    headSha: meta.head.sha,
    files,
    commitMessages,
    linkedIssues: parseLinkedIssues(body),
  };
}
