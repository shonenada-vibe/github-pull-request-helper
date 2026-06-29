import { describe, it, expect } from 'vitest';
import { parseHunks } from './parse-diff';

describe('parseHunks', () => {
  it('returns no hunks for empty/binary patches', () => {
    expect(parseHunks(undefined)).toEqual([]);
    expect(parseHunks(null)).toEqual([]);
    expect(parseHunks('')).toEqual([]);
  });

  it('parses a single hunk with add/remove counts', () => {
    const patch = [
      '@@ -1,3 +1,4 @@',
      ' context',
      '-removed line',
      '+added line one',
      '+added line two',
      ' more context',
    ].join('\n');

    const hunks = parseHunks(patch);
    expect(hunks).toHaveLength(1);
    expect(hunks[0]).toMatchObject({
      oldStart: 1,
      oldLines: 3,
      newStart: 1,
      newLines: 4,
      addedLines: 2,
      removedLines: 1,
    });
  });

  it('defaults line counts to 1 when omitted in the header', () => {
    const hunks = parseHunks('@@ -5 +6 @@\n+x');
    expect(hunks[0]).toMatchObject({ oldLines: 1, newLines: 1, addedLines: 1 });
  });

  it('parses multiple hunks', () => {
    const patch = [
      '@@ -1,2 +1,2 @@',
      '-a',
      '+b',
      '@@ -10,1 +10,2 @@',
      '+c',
    ].join('\n');

    const hunks = parseHunks(patch);
    expect(hunks).toHaveLength(2);
    expect(hunks[1]).toMatchObject({ oldStart: 10, addedLines: 1 });
  });

  it('keeps the raw header for jump links', () => {
    const hunks = parseHunks('@@ -1,1 +1,1 @@ function foo()\n+x');
    expect(hunks[0]?.header).toBe('@@ -1,1 +1,1 @@ function foo()');
  });
});
