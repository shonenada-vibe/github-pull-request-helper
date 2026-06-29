import type { Hunk } from '../types';

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/**
 * Parse a single file's unified-diff `patch` (as returned by the GitHub
 * `/pulls/{n}/files` endpoint) into structured hunks.
 *
 * Pure function — no DOM or browser dependencies.
 *
 * @param patch The unified-diff text for one file, or undefined (binary files).
 */
export function parseHunks(patch: string | undefined | null): Hunk[] {
  if (!patch) return [];

  const hunks: Hunk[] = [];
  let current: Hunk | null = null;

  for (const line of patch.split('\n')) {
    const match = HUNK_HEADER.exec(line);
    if (match) {
      if (current) hunks.push(current);
      current = {
        header: line,
        oldStart: Number(match[1]),
        oldLines: match[2] === undefined ? 1 : Number(match[2]),
        newStart: Number(match[3]),
        newLines: match[4] === undefined ? 1 : Number(match[4]),
        addedLines: 0,
        removedLines: 0,
      };
      continue;
    }

    if (!current) continue;

    // `+++`/`---` file headers can appear before the first hunk; once inside a
    // hunk, a leading +/- is always an added/removed content line.
    if (line.startsWith('+')) current.addedLines += 1;
    else if (line.startsWith('-')) current.removedLines += 1;
  }

  if (current) hunks.push(current);
  return hunks;
}
