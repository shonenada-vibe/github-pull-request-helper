import {
  INTERESTING_LABELS,
  type GroupingResponse,
  type Group,
  type InterestingLabel,
  type ReadingStep,
} from './types';

export class GroupingValidationError extends Error {
  /** The raw model text that failed to validate (for debugging). */
  raw?: string;
  constructor(message: string) {
    super(`Invalid grouping response: ${message}`);
    this.name = 'GroupingValidationError';
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Coerce a group's `files` into a `string[]`, tolerating the common ways models
 * drift from the schema: an array of `{path}`/`{filename}` objects, or a single
 * delimited string. Throws only when an entry is genuinely unusable.
 */
function coerceFiles(value: unknown, field: string): string[] {
  if (value == null) return [];
  if (typeof value === 'string') {
    return value
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  if (!Array.isArray(value)) {
    throw new GroupingValidationError(`${field} must be an array of file paths`);
  }
  return value.map((item, j) => {
    if (typeof item === 'string') return item;
    if (isObject(item)) {
      const candidate = item.path ?? item.filename ?? item.file ?? item.name;
      if (typeof candidate === 'string') return candidate;
    }
    throw new GroupingValidationError(
      `${field}[${j}] must be a file path string or an object with a path`,
    );
  });
}

function asString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new GroupingValidationError(`${field} must be a string`);
  }
  return value;
}

function asLabel(value: unknown): InterestingLabel {
  if (
    typeof value === 'string' &&
    (INTERESTING_LABELS as readonly string[]).includes(value)
  ) {
    return value as InterestingLabel;
  }
  throw new GroupingValidationError(`invalid group label: ${String(value)}`);
}

/**
 * Parse and validate the raw JSON text returned by the model into a typed
 * GroupingResponse. Throws GroupingValidationError on any structural problem.
 * Pure — safe to unit test without the SDK.
 */
export function parseGroupingResponse(text: string): GroupingResponse {
  try {
    return parseGroupingResponseInner(text);
  } catch (err) {
    if (err instanceof GroupingValidationError) {
      // Carry the raw text so the UI/console can show what the model returned.
      err.raw = text;
    }
    throw err;
  }
}

function parseGroupingResponseInner(text: string): GroupingResponse {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new GroupingValidationError('response was not valid JSON');
  }
  if (!isObject(data)) throw new GroupingValidationError('expected an object');

  const intent = asString(data.intent, 'intent');
  const changeType = asString(data.changeType, 'changeType');

  if (!Array.isArray(data.groups)) {
    throw new GroupingValidationError('groups must be an array');
  }
  const groups: Group[] = data.groups.map((raw, i) => {
    if (!isObject(raw)) {
      throw new GroupingValidationError(`groups[${i}] must be an object`);
    }
    return {
      id: asString(raw.id, `groups[${i}].id`),
      title: asString(raw.title, `groups[${i}].title`),
      label: asLabel(raw.label),
      rationale: asString(raw.rationale, `groups[${i}].rationale`),
      files: coerceFiles(raw.files, `groups[${i}].files`),
    };
  });

  if (!Array.isArray(data.readingOrder)) {
    throw new GroupingValidationError('readingOrder must be an array');
  }
  const knownIds = new Set(groups.map((g) => g.id));
  const readingOrder: ReadingStep[] = data.readingOrder.map((raw, i) => {
    if (!isObject(raw)) {
      throw new GroupingValidationError(`readingOrder[${i}] must be an object`);
    }
    const groupId = asString(raw.groupId, `readingOrder[${i}].groupId`);
    if (!knownIds.has(groupId)) {
      throw new GroupingValidationError(
        `readingOrder[${i}] references unknown group "${groupId}"`,
      );
    }
    return { groupId, reason: asString(raw.reason, `readingOrder[${i}].reason`) };
  });

  return { intent, changeType, groups, readingOrder };
}
