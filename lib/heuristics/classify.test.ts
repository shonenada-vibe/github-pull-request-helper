import { describe, it, expect } from 'vitest';
import { classifyFile, partitionFiles } from './classify';
import type { FileDiff } from '../types';

function file(overrides: Partial<FileDiff>): FileDiff {
  return {
    path: 'src/app.ts',
    status: 'modified',
    isBinary: false,
    additions: 5,
    deletions: 2,
    hunks: [],
    ...overrides,
  };
}

describe('classifyFile', () => {
  it('flags lockfiles as mechanical', () => {
    expect(classifyFile(file({ path: 'package-lock.json' })).reason).toBe(
      'lockfile',
    );
    expect(classifyFile(file({ path: 'frontend/bun.lockb' })).classification).toBe(
      'mechanical',
    );
  });

  it('flags generated/vendored paths and files', () => {
    expect(classifyFile(file({ path: 'dist/bundle.js' })).reason).toBe(
      'generated/vendored',
    );
    expect(classifyFile(file({ path: 'app.min.js' })).classification).toBe(
      'mechanical',
    );
    expect(classifyFile(file({ path: 'api/service_pb2.py' })).classification).toBe(
      'mechanical',
    );
  });

  it('flags pure renames with no content change', () => {
    const renamed = file({ status: 'renamed', additions: 0, deletions: 0 });
    expect(classifyFile(renamed).reason).toBe('pure rename');
  });

  it('keeps a renamed file with edits interesting', () => {
    const renamed = file({ status: 'renamed', additions: 4, deletions: 1 });
    expect(classifyFile(renamed).classification).toBe('interesting');
  });

  it('flags binary files as mechanical', () => {
    expect(classifyFile(file({ path: 'logo.png', isBinary: true })).reason).toBe(
      'binary',
    );
  });

  it('treats ordinary source changes as interesting', () => {
    expect(classifyFile(file({ path: 'src/auth.ts' })).classification).toBe(
      'interesting',
    );
  });
});

describe('partitionFiles', () => {
  it('splits files into the two buckets', () => {
    const { interesting, mechanical } = partitionFiles([
      file({ path: 'src/auth.ts' }),
      file({ path: 'package-lock.json' }),
      file({ path: 'src/cache.ts' }),
    ]);
    expect(interesting.map((c) => c.file.path)).toEqual([
      'src/auth.ts',
      'src/cache.ts',
    ]);
    expect(mechanical.map((c) => c.file.path)).toEqual(['package-lock.json']);
  });
});
