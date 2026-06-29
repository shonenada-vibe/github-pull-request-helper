import { describe, it, expect } from 'vitest';
import { parsePrPath, isFilesTab } from './pr-url';

describe('parsePrPath', () => {
  it('parses the files tab', () => {
    expect(parsePrPath('/octocat/hello-world/pull/42/files')).toEqual({
      owner: 'octocat',
      repo: 'hello-world',
      number: 42,
    });
  });

  it('parses the conversation tab', () => {
    expect(parsePrPath('/a/b/pull/7')).toEqual({ owner: 'a', repo: 'b', number: 7 });
  });

  it('returns null for non-PR paths', () => {
    expect(parsePrPath('/a/b/issues/7')).toBeNull();
    expect(parsePrPath('/')).toBeNull();
  });
});

describe('isFilesTab', () => {
  it('is true only on the files tab', () => {
    expect(isFilesTab('/a/b/pull/7/files')).toBe(true);
    expect(isFilesTab('/a/b/pull/7')).toBe(false);
  });
});
