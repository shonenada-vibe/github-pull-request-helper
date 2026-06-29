export interface PrLocation {
  owner: string;
  repo: string;
  number: number;
}

const PR_PATH = /^\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:\/|$)/;

/**
 * Parse `owner/repo/number` from a GitHub PR pathname. Returns null when the
 * path is not a pull request page. Pure.
 *
 * @example parsePrPath('/octocat/hello/pull/42/files') -> {owner,repo,number:42}
 */
export function parsePrPath(pathname: string): PrLocation | null {
  const m = PR_PATH.exec(pathname);
  if (!m) return null;
  return { owner: m[1]!, repo: m[2]!, number: Number(m[3]) };
}

/** True for the "Files changed" tab specifically. */
export function isFilesTab(pathname: string): boolean {
  return /\/pull\/\d+\/files(?:\/|$)/.test(pathname);
}
