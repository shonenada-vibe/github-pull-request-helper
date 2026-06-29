import type { FileDiff } from '../types';

export type Classification = 'mechanical' | 'interesting';

export interface ClassifiedFile {
  file: FileDiff;
  classification: Classification;
  /** Why it was classified as mechanical (omitted for interesting files). */
  reason?: string;
}

const LOCKFILES = new Set([
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lockb',
  'bun.lock',
  'cargo.lock',
  'poetry.lock',
  'pdm.lock',
  'composer.lock',
  'gemfile.lock',
  'go.sum',
  'flake.lock',
]);

const GENERATED_PATH = /(^|\/)(dist|build|out|vendor|node_modules)\//i;
const GENERATED_FILE =
  /(\.min\.(js|css)|\.generated\.|_pb2\.py$|\.pb\.go$|\.lock$|\.map$)/i;

function basename(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx === -1 ? path : path.slice(idx + 1);
}

/**
 * Classify a changed file as `mechanical` (safe to skim/fold) or `interesting`
 * (worth an LLM grouping pass). Pure — no side effects.
 */
export function classifyFile(file: FileDiff): ClassifiedFile {
  const name = basename(file.path).toLowerCase();

  if (LOCKFILES.has(name)) {
    return { file, classification: 'mechanical', reason: 'lockfile' };
  }
  if (GENERATED_PATH.test(file.path) || GENERATED_FILE.test(file.path)) {
    return { file, classification: 'mechanical', reason: 'generated/vendored' };
  }
  // Pure rename/move with no content change.
  if (file.status === 'renamed' && file.additions === 0 && file.deletions === 0) {
    return { file, classification: 'mechanical', reason: 'pure rename' };
  }
  // Binary blobs (images, fonts) carry no reviewable logic.
  if (file.isBinary) {
    return { file, classification: 'mechanical', reason: 'binary' };
  }

  return { file, classification: 'interesting' };
}

export interface Partitioned {
  interesting: ClassifiedFile[];
  mechanical: ClassifiedFile[];
}

/** Split a file list into interesting vs mechanical buckets. */
export function partitionFiles(files: FileDiff[]): Partitioned {
  const interesting: ClassifiedFile[] = [];
  const mechanical: ClassifiedFile[] = [];
  for (const file of files) {
    const classified = classifyFile(file);
    (classified.classification === 'interesting' ? interesting : mechanical).push(
      classified,
    );
  }
  return { interesting, mechanical };
}
