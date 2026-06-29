/** Shared domain types used across the worker, content script, and lib modules. */

export type FileStatus =
  | 'added'
  | 'modified'
  | 'removed'
  | 'renamed'
  | 'copied'
  | 'changed';

/** A single hunk within a file's patch. */
export interface Hunk {
  /** The raw `@@ ... @@` header line. */
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  addedLines: number;
  removedLines: number;
}

/** A single changed file in a pull request. */
export interface FileDiff {
  path: string;
  /** Previous path when the file was renamed/copied. */
  previousPath?: string;
  status: FileStatus;
  isBinary: boolean;
  additions: number;
  deletions: number;
  hunks: Hunk[];
}

/** Everything fetched for a pull request, ready for analysis. */
export interface PullRequestData {
  owner: string;
  repo: string;
  number: number;
  title: string;
  body: string;
  author: string;
  baseRef: string;
  headRef: string;
  headSha: string;
  files: FileDiff[];
  /** Commit subject lines, oldest-first. */
  commitMessages: string[];
  /** Issue numbers closed by this PR (parsed from the body). */
  linkedIssues: number[];
}
