import type { PullRequestData } from './types';
import type { Settings } from './storage';
import type { GroupingResponse, GroupingResult, Group } from './grouping/types';
import type { RequestGroupingArgs } from './llm/dispatch';
import { partitionFiles, type ClassifiedFile } from './heuristics/classify';
import { SYSTEM_PROMPT, buildUserContent } from './grouping/prompt';

const MECHANICAL_GROUP_ID = 'mechanical';

export interface AnalysisDeps {
  fetchPR: (p: {
    owner: string;
    repo: string;
    number: number;
    token: string;
  }) => Promise<PullRequestData>;
  /** Provider-agnostic grouping request (dispatched by settings.provider). */
  requestGrouping: (args: RequestGroupingArgs) => Promise<GroupingResponse>;
  getCache: (sha: string) => Promise<GroupingResult | undefined>;
  setCache: (sha: string, result: GroupingResult) => Promise<void>;
}

export interface RunAnalysisParams {
  owner: string;
  repo: string;
  number: number;
  settings: Settings;
  force?: boolean;
}

export interface AnalysisOutcome {
  result: GroupingResult;
  fromCache: boolean;
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
  const pr = await deps.fetchPR({
    owner,
    repo,
    number,
    token: settings.githubToken,
  });

  if (!force) {
    const cached = await deps.getCache(pr.headSha);
    if (cached) return { result: cached, fromCache: true };
  }

  const { interesting, mechanical } = partitionFiles(pr.files);

  let response: GroupingResponse;
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
    response = await deps.requestGrouping({
      settings,
      system: SYSTEM_PROMPT,
      userContent: buildUserContent(pr, interesting),
    });
  }

  const result = finalize(response, mechanical);
  await deps.setCache(pr.headSha, result);
  return { result, fromCache: false };
}
