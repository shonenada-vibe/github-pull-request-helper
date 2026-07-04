/**
 * Pure helpers for the local-agent bridge: compose the prompt for a headless
 * CLI agent (Claude Code or Codex), pick the command, and dig the grouping
 * JSON out of whatever the agent printed.
 */

export interface ChatMessage {
  role: string;
  content: string;
}

/** Flatten chat messages into one headless prompt. */
export function composePrompt(messages: ChatMessage[]): string {
  const parts = messages
    .filter((m) => typeof m.content === 'string' && m.content.length > 0)
    .map((m) => m.content);
  parts.push(
    'Respond with ONLY the grouping JSON object — no prose, no markdown fences.',
  );
  return parts.join('\n\n');
}

export interface AgentCommand {
  argv: string[];
  /** Prompt delivered on stdin when set; otherwise it is already in argv. */
  stdin?: string;
}

/**
 * Map the requested "model" to a headless CLI invocation. Anything containing
 * "codex" runs the Codex CLI; everything else runs Claude Code.
 */
export function commandFor(model: string, prompt: string): AgentCommand {
  if (/codex/i.test(model)) {
    return { argv: ['codex', 'exec', '--skip-git-repo-check', prompt] };
  }
  return { argv: ['claude', '-p', '--output-format', 'json'], stdin: prompt };
}

function isGrouping(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as { groups?: unknown }).groups) &&
    typeof (value as { intent?: unknown }).intent === 'string'
  );
}

function tryParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Yield every balanced top-level `{...}` substring (string-literal aware). */
function* balancedObjects(text: string): Generator<string> {
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '{') continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let j = i; j < text.length; j++) {
      const c = text[j];
      if (inString) {
        if (escaped) escaped = false;
        else if (c === '\\') escaped = true;
        else if (c === '"') inString = false;
      } else if (c === '"') inString = true;
      else if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) {
          yield text.slice(i, j + 1);
          i = j;
          break;
        }
      }
    }
  }
}

function groupingFromText(text: string): string | null {
  let found: string | null = null;
  for (const candidate of balancedObjects(text)) {
    if (isGrouping(tryParse(candidate))) found = candidate; // keep the last
  }
  return found;
}

/**
 * Extract the grouping JSON from agent stdout. Handles: raw grouping JSON,
 * the `claude -p --output-format json` envelope (grouping inside `.result`),
 * and free-form output with the JSON embedded (Codex), fenced or not.
 */
export function extractGroupingJson(stdout: string): string {
  const trimmed = stdout.trim();

  const direct = tryParse(trimmed);
  if (isGrouping(direct)) return trimmed;
  if (typeof (direct as { result?: unknown } | undefined)?.result === 'string') {
    const inner = groupingFromText((direct as { result: string }).result);
    if (inner) return inner;
  }

  const embedded = groupingFromText(trimmed);
  if (embedded) return embedded;

  throw new Error(
    `no grouping JSON found in agent output (${trimmed.length} chars)`,
  );
}
