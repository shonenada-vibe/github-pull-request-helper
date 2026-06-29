import { describe, it, expect, vi } from 'vitest';
import { runAnalysis, type AnalysisDeps } from './pipeline';
import { DEFAULT_SETTINGS } from './storage';
import type { PullRequestData, FileDiff } from './types';
import type { GroupingResponse } from './grouping/types';

function fileDiff(path: string, extra: Partial<FileDiff> = {}): FileDiff {
  return {
    path,
    status: 'modified',
    isBinary: false,
    additions: 3,
    deletions: 1,
    hunks: [],
    ...extra,
  };
}

function pr(files: FileDiff[]): PullRequestData {
  return {
    owner: 'o',
    repo: 'r',
    number: 1,
    title: 't',
    body: '',
    author: 'a',
    baseRef: 'main',
    headRef: 'feat',
    headSha: 'sha1',
    files,
    commitMessages: [],
    linkedIssues: [],
  };
}

const llmResponse: GroupingResponse = {
  intent: 'Add a cache.',
  changeType: 'feature',
  groups: [
    {
      id: 'g1',
      title: 'Cache',
      label: 'behavioral',
      rationale: 'New cache.',
      files: ['src/cache.ts'],
    },
  ],
  readingOrder: [{ groupId: 'g1', reason: 'Core change.' }],
};

function makeDeps(overrides: Partial<AnalysisDeps> = {}): AnalysisDeps {
  return {
    fetchPR: vi.fn(async () => pr([fileDiff('src/cache.ts'), fileDiff('bun.lockb')])),
    requestGrouping: vi.fn(async () => llmResponse),
    getCache: vi.fn(async () => undefined),
    setCache: vi.fn(async () => {}),
    ...overrides,
  };
}

const settings = { ...DEFAULT_SETTINGS, githubToken: 'g', anthropicApiKey: 'a' };

describe('runAnalysis', () => {
  it('runs the LLM on interesting files and appends a mechanical group', async () => {
    const deps = makeDeps();
    const { result, fromCache } = await runAnalysis(
      { owner: 'o', repo: 'r', number: 1, settings },
      deps,
    );

    expect(fromCache).toBe(false);
    // The LLM only sees interesting files.
    const sentContent = (deps.requestGrouping as ReturnType<typeof vi.fn>).mock
      .calls[0]![0].userContent as string;
    expect(sentContent).toContain('src/cache.ts');
    expect(sentContent).not.toContain('bun.lockb');

    expect(result.hasMechanical).toBe(true);
    expect(result.groups.at(-1)?.files).toEqual(['bun.lockb']);
    expect(result.readingOrder.at(-1)?.groupId).toBe('mechanical');
    expect(deps.setCache).toHaveBeenCalledWith('sha1', result);
  });

  it('returns the cached result without calling the LLM', async () => {
    const cached = { ...llmResponse, hasMechanical: false };
    const deps = makeDeps({ getCache: vi.fn(async () => cached) });
    const { result, fromCache } = await runAnalysis(
      { owner: 'o', repo: 'r', number: 1, settings },
      deps,
    );
    expect(fromCache).toBe(true);
    expect(result).toEqual(cached);
    expect(deps.requestGrouping).not.toHaveBeenCalled();
  });

  it('bypasses the cache when force is set', async () => {
    const deps = makeDeps({ getCache: vi.fn(async () => ({ ...llmResponse, hasMechanical: false })) });
    await runAnalysis({ owner: 'o', repo: 'r', number: 1, settings, force: true }, deps);
    expect(deps.requestGrouping).toHaveBeenCalledOnce();
  });

  it('skips the LLM when every file is mechanical', async () => {
    const deps = makeDeps({
      fetchPR: vi.fn(async () => pr([fileDiff('package-lock.json')])),
    });
    const { result } = await runAnalysis(
      { owner: 'o', repo: 'r', number: 1, settings },
      deps,
    );
    expect(deps.requestGrouping).not.toHaveBeenCalled();
    expect(result.changeType).toBe('chore');
    expect(result.hasMechanical).toBe(true);
  });
});
