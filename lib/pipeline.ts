import type { PullRequestData } from './types';
import { groupingCacheKey, type Settings, type CachedAnalysis } from './storage';
import type { GroupingResponse, GroupingResult, Group } from './grouping/types';
import type { RequestGroupingArgs } from './llm/dispatch';
import { partitionFiles, type ClassifiedFile } from './heuristics/classify';
import { buildSystemPrompt, buildUserContent, SYSTEM_PROMPT } from './grouping/prompt';

const MECHANICAL_GROUP_ID = 'mechanical';

interface PrCoords {
  owner: string;
  repo: string;
  number: number;
  token: string;
}

export interface AnalysisDeps {
  /** Cheap single-request head-SHA lookup, used for the cache check. */
  fetchPRHead: (p: PrCoords) => Promise<{ headSha: string }>;
  fetchPR: (p: PrCoords) => Promise<PullRequestData>;
  /** Provider-agnostic grouping request (dispatched by settings.provider). */
  requestGrouping: (args: RequestGroupingArgs) => Promise<GroupingResponse>;
  getCache: (key: string) => Promise<CachedAnalysis | undefined>;
  setCache: (key: string, entry: CachedAnalysis) => Promise<void>;
  /** Optional per-phase trace sink for the debug log. */
  trace?: (line: string) => void;
}

export interface RunAnalysisParams {
  owner: string;
  repo: string;
  number: number;
  settings: Settings;
  force?: boolean;
}

export interface AnalysisDiagnostics {
  provider: string;
  model: string;
  totalFiles: number;
  interesting: number;
  mechanical: number;
  usedLlm: boolean;
}

export interface AnalysisOutcome {
  result: GroupingResult;
  fromCache: boolean;
  /** When fromCache, the timestamp the entry was originally saved. */
  cachedAt?: number;
  diagnostics: AnalysisDiagnostics;
}

/** Human-facing model label for diagnostics and the cache key. */
function modelLabel(settings: Settings): string {
  if (settings.provider === 'openai') return settings.openaiModel;
  if (settings.provider === 'carevie') return 'review-files';
  if (settings.provider === 'local') return settings.localAgent;
  return settings.model;
}

function mechanicalGroup(mechanical: ClassifiedFile[]): Group {
  return {
    id: MECHANICAL_GROUP_ID,
    title: 'Mechanical / low-signal',
    label: 'mechanical',
    importance: 'low',
    rationale: 'Lockfiles, generated code, renames, and binaries — skim or skip.',
    files: mechanical.map((c) => c.file.path),
  };
}

/** Append the mechanical group (if any) and finalize the result. */
function finalize(
  response: GroupingResponse,
  mechanical: ClassifiedFile[],
): GroupingResult {
  if (mechanical.length === 0) {
    return { ...response, hasMechanical: false };
  }
  return {
    intent: response.intent,
    changeType: response.changeType,
    groups: [...response.groups, mechanicalGroup(mechanical)],
    readingOrder: [
      ...response.readingOrder,
      { groupId: MECHANICAL_GROUP_ID, reason: 'Skim last — no behavioral logic.' },
    ],
    hasMechanical: true,
  };
}

/**
 * End-to-end analysis: fetch -> classify -> (LLM) -> merge mechanical -> cache.
 * All side effects are injected via `deps`, so this is unit-testable.
 */
export async function runAnalysis(
  { owner, repo, number, settings, force }: RunAnalysisParams,
  deps: AnalysisDeps,
): Promise<AnalysisOutcome> {
  const coords = { owner, repo, number, token: settings.githubToken };
  const model = modelLabel(settings);
  const trace = deps.trace ?? (() => {});
  const timed = async <T>(label: string, work: Promise<T>): Promise<T> => {
    const started = Date.now();
    const value = await work;
    trace(`${label} in ${Date.now() - started}ms`);
    return value;
  };
  const keyFor = (sha: string) =>
    groupingCacheKey({
      provider: settings.provider,
      model,
      language: settings.language,
      sha,
    });

  trace(
    `settings: provider=${settings.provider}, model=${model}, lang=${settings.language}`,
  );

  if (!force) {
    // One cheap request for the head SHA is enough to serve a cache hit —
    // no diff download, no LLM call.
    const { headSha } = await timed('head lookup', deps.fetchPRHead(coords));
    trace(`head sha ${headSha.slice(0, 12)}`);
    const cached = await deps.getCache(keyFor(headSha));
    trace(
      cached
        ? `cache hit (saved ${new Date(cached.savedAt).toLocaleString()})`
        : 'cache miss',
    );
    if (cached) {
      return {
        result: cached.result,
        fromCache: true,
        cachedAt: cached.savedAt,
        diagnostics: {
          provider: settings.provider,
          model,
          totalFiles: cached.totalFiles,
          interesting: cached.interesting,
          mechanical: cached.mechanical,
          usedLlm: false,
        },
      };
    }
  }

  if (force) trace('cache skipped (forced refresh)');

  const pr = await timed('PR fetch', deps.fetchPR(coords));
  trace(
    `PR "${pr.title}" — ${pr.files.length} files, ${pr.commitMessages.length} commits, head ${pr.headSha.slice(0, 12)}`,
  );
  const { interesting, mechanical } = partitionFiles(pr.files);
  trace(`partition: ${interesting.length} interesting, ${mechanical.length} mechanical`);
  const baseDiagnostics = {
    provider: settings.provider,
    model,
    totalFiles: pr.files.length,
    interesting: interesting.length,
    mechanical: mechanical.length,
  };

  let response: GroupingResponse;
  let usedLlm = false;
  if (interesting.length === 0) {
    trace('all files mechanical — skipping the LLM');
    // Nothing worth an LLM pass — everything is mechanical.
    response = {
      intent:
        'This PR contains only mechanical changes (lockfiles, generated code, renames, or binaries).',
      changeType: 'chore',
      groups: [],
      readingOrder: [],
    };
  } else {
    usedLlm = true;
    const base = settings.systemPrompt.trim() || SYSTEM_PROMPT;
    if (base !== SYSTEM_PROMPT) trace('using a customized system prompt');
    const system = buildSystemPrompt(settings.language, base);
    const userContent = buildUserContent(pr, interesting);
    trace(`prompt: ${system.length} chars system, ${userContent.length} chars user`);
    response = await timed(
      `${settings.provider} request`,
      deps.requestGrouping({
        settings,
        system,
        userContent,
        pr: { owner, repo, number },
      }),
    );
    trace(
      `response: ${response.groups.length} groups, ${response.readingOrder.length} reading steps`,
    );
  }

  const result = finalize(response, mechanical);
  await deps.setCache(keyFor(pr.headSha), {
    result,
    savedAt: Date.now(),
    totalFiles: pr.files.length,
    interesting: interesting.length,
    mechanical: mechanical.length,
  });
  trace('cached the result');
  return { result, fromCache: false, diagnostics: { ...baseDiagnostics, usedLlm } };
}
