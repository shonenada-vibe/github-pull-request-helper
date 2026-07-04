import type { PullRequestData } from './types';
import { groupingCacheKey, type Settings, type CachedAnalysis } from './storage';
import type { GroupingResponse, GroupingResult, Group } from './grouping/types';
import type { RequestGroupingArgs } from './llm/dispatch';
import { partitionFiles, type ClassifiedFile } from './heuristics/classify';
import { buildSystemPrompt, buildUserContent } from './grouping/prompt';

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
  return settings.model;
}

function mechanicalGroup(mechanical: ClassifiedFile[]): Group {
  return {
    id: MECHANICAL_GROUP_ID,
    title: 'Mechanical / low-signal',
    label: 'mechanical',
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
  const keyFor = (sha: string) =>
    groupingCacheKey({
      provider: settings.provider,
      model,
      language: settings.language,
      sha,
    });

  if (!force) {
    // One cheap request for the head SHA is enough to serve a cache hit —
    // no diff download, no LLM call.
    const { headSha } = await deps.fetchPRHead(coords);
    const cached = await deps.getCache(keyFor(headSha));
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

  const pr = await deps.fetchPR(coords);
  const { interesting, mechanical } = partitionFiles(pr.files);
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
    response = await deps.requestGrouping({
      settings,
      system: buildSystemPrompt(settings.language),
      userContent: buildUserContent(pr, interesting),
      pr: { owner, repo, number },
    });
  }

  const result = finalize(response, mechanical);
  await deps.setCache(keyFor(pr.headSha), {
    result,
    savedAt: Date.now(),
    totalFiles: pr.files.length,
    interesting: interesting.length,
    mechanical: mechanical.length,
  });
  return { result, fromCache: false, diagnostics: { ...baseDiagnostics, usedLlm } };
}
