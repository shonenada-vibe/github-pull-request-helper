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
    fetchPRHead: vi.fn(async () => ({ headSha: 'sha1' })),
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
    // Cached under a key carrying provider/model/language and the head sha.
    const [key, entry] = (deps.setCache as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(key).toBe(`grouping:v2:anthropic:${settings.model}:en:sha1`);
    expect(entry.result).toEqual(result);
    expect(entry).toMatchObject({ totalFiles: 2, interesting: 1, mechanical: 1 });
  });

  it('serves a cache hit from the head sha alone, without fetching the diff', async () => {
    const cached = {
      result: { ...llmResponse, hasMechanical: false },
      savedAt: 123,
      totalFiles: 2,
      interesting: 1,
      mechanical: 1,
    };
    const deps = makeDeps({ getCache: vi.fn(async () => cached) });
    const { result, fromCache, cachedAt, diagnostics } = await runAnalysis(
      { owner: 'o', repo: 'r', number: 1, settings },
      deps,
    );
    expect(fromCache).toBe(true);
    expect(cachedAt).toBe(123);
    expect(result).toEqual(cached.result);
    expect(diagnostics).toMatchObject({ totalFiles: 2, usedLlm: false });
    expect(deps.requestGrouping).not.toHaveBeenCalled();
    expect(deps.fetchPR).not.toHaveBeenCalled(); // Only the head lookup ran.
  });

  it('bypasses the cache (and the head lookup) when force is set', async () => {
    const deps = makeDeps({ getCache: vi.fn(async () => undefined) });
    await runAnalysis({ owner: 'o', repo: 'r', number: 1, settings, force: true }, deps);
    expect(deps.requestGrouping).toHaveBeenCalledOnce();
    expect(deps.getCache).not.toHaveBeenCalled();
    expect(deps.fetchPRHead).not.toHaveBeenCalled();
  });

  it('emits a per-phase trace covering fetch, partition, LLM, and cache', async () => {
    const lines: string[] = [];
    const deps = makeDeps({ trace: (line) => lines.push(line) });
    await runAnalysis({ owner: 'o', repo: 'r', number: 1, settings }, deps);

    const joined = lines.join('\n');
    expect(joined).toContain('settings: provider=anthropic');
    expect(joined).toMatch(/head lookup in \d+ms/);
    expect(joined).toContain('cache miss');
    expect(joined).toMatch(/PR fetch in \d+ms/);
    expect(joined).toContain('partition: 1 interesting, 1 mechanical');
    expect(joined).toMatch(/chars system, \d+ chars user/);
    expect(joined).toMatch(/anthropic request in \d+ms/);
    expect(joined).toContain('cached the result');
  });

  it('traces a cache hit without fetching the diff', async () => {
    const lines: string[] = [];
    const cached = {
      result: { ...llmResponse, hasMechanical: false },
      savedAt: Date.now(),
      totalFiles: 2,
      interesting: 1,
      mechanical: 1,
    };
    const deps = makeDeps({
      getCache: vi.fn(async () => cached),
      trace: (line) => lines.push(line),
    });
    await runAnalysis({ owner: 'o', repo: 'r', number: 1, settings }, deps);
    expect(lines.join('\n')).toContain('cache hit (saved ');
  });

  it('includes the language in the system prompt and the cache key', async () => {
    const deps = makeDeps();
    await runAnalysis(
      { owner: 'o', repo: 'r', number: 1, settings: { ...settings, language: 'zh-CN' } },
      deps,
    );
    const args = (deps.requestGrouping as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(args.system).toContain('Simplified Chinese');
    const [key] = (deps.setCache as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(key).toContain(':zh-CN:');
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
