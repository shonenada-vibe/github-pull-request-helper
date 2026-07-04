/** Types describing the grouping/reading-order output produced by the LLM. */

export const INTERESTING_LABELS = [
  'behavioral',
  'refactor',
  'test',
  'config',
  'docs',
] as const;

export type InterestingLabel = (typeof INTERESTING_LABELS)[number];

/** Any label, including the pipeline-added `mechanical` bucket. */
export type GroupLabel = InterestingLabel | 'mechanical';

export const IMPORTANCE_LEVELS = ['high', 'medium', 'low'] as const;

/** How much reviewer scrutiny a group deserves. */
export type Importance = (typeof IMPORTANCE_LEVELS)[number];

export interface Group {
  /** Stable id referenced by the reading order. */
  id: string;
  title: string;
  label: GroupLabel;
  /** Optional for results cached before importance existed. */
  importance?: Importance;
  /** One-line reason this group exists / what to look for. */
  rationale: string;
  /** Paths of the files in this group. */
  files: string[];
}

export interface ReadingStep {
  groupId: string;
  /** Why this group is read at this point in the order. */
  reason: string;
}

/** The raw shape the model returns (interesting groups only). */
export interface GroupingResponse {
  intent: string;
  changeType: string;
  groups: Group[];
  readingOrder: ReadingStep[];
}

/** The final result after the pipeline merges in the mechanical group. */
export interface GroupingResult extends GroupingResponse {
  /** True when a mechanical group was appended by the pipeline. */
  hasMechanical: boolean;
}
