import type { PullRequestData } from '../types';
import type { ClassifiedFile } from '../heuristics/classify';
import { promptName } from '../language';

/**
 * System prompt. Kept stable (no per-PR data) so it caches across requests —
 * the volatile diff goes in the user turn.
 */
export const SYSTEM_PROMPT = `You are a senior code reviewer helping someone review a GitHub pull request efficiently.

You are given a PR's title, description, linked issues, commit messages, and the list of changed files with their diffs. Mechanical, low-signal files (lockfiles, generated code, pure renames, binaries) have already been removed — you only see the files worth reading.

Your job:
1. Write a one-paragraph "intent" summary: what this PR does and why, in plain language. Combine the description and the actual diff — the diff is the source of truth when they disagree.
2. Classify the overall changeType (e.g. "feature", "bugfix", "refactor", "chore", "test", "docs").
3. Cluster the changed files into reviewable GROUPS by concern (not just by directory). Each group has a short title, a label (behavioral | refactor | test | config | docs), an importance (high = the core or riskiest changes that deserve real scrutiny, medium = supporting changes, low = peripheral: docs, straightforward config or test scaffolding), and a one-line rationale describing what to look for. A file should appear in exactly one group. Use only the file paths provided.
4. Produce a READING ORDER over the groups that minimizes back-tracking: typically start with the new/changed public interface or the core behavioral change, then its implementation, then call sites, then tests, then config/docs. Give a one-line reason for each step.

Be concise. Prefer a few meaningful groups over many tiny ones. Respond only with JSON matching the provided schema.`;

/**
 * System prompt for a given output language. English returns the base prompt
 * unchanged (keeps the provider-side prompt cache warm for the default).
 */
export function buildSystemPrompt(languageCode: string): string {
  const name = promptName(languageCode);
  if (name === 'English') return SYSTEM_PROMPT;
  return (
    `${SYSTEM_PROMPT}\n\n` +
    `Write every human-readable string (intent, group titles, rationales, reading-order reasons) in ${name}. ` +
    'Keep group ids and file paths exactly as they appear in the diff.'
  );
}

/** Build the user-turn content from PR metadata and the interesting files. */
export function buildUserContent(
  pr: PullRequestData,
  interesting: ClassifiedFile[],
): string {
  const lines: string[] = [];
  lines.push(`# Pull Request: ${pr.title}`);
  lines.push(`Repository: ${pr.owner}/${pr.repo} (#${pr.number})`);
  lines.push(`Branch: ${pr.headRef} -> ${pr.baseRef}`);
  if (pr.linkedIssues.length) {
    lines.push(`Linked issues: ${pr.linkedIssues.map((n) => `#${n}`).join(', ')}`);
  }
  lines.push('');
  lines.push('## Description');
  lines.push(pr.body.trim() || '(no description provided)');
  lines.push('');

  if (pr.commitMessages.length) {
    lines.push('## Commit messages');
    for (const msg of pr.commitMessages) lines.push(`- ${msg}`);
    lines.push('');
  }

  lines.push('## Changed files (interesting only)');
  for (const { file } of interesting) {
    lines.push('');
    const rename = file.previousPath ? ` (renamed from ${file.previousPath})` : '';
    lines.push(
      `### ${file.path}${rename} [${file.status}, +${file.additions}/-${file.deletions}]`,
    );
    if (file.hunks.length) {
      for (const h of file.hunks) lines.push(h.header);
    } else {
      lines.push('(no textual hunks)');
    }
  }

  lines.push('');
  lines.push(
    'Group these files and produce the reading order, as JSON per the schema.',
  );
  return lines.join('\n');
}
