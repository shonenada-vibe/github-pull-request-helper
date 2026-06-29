import {
  INTERESTING_LABELS,
  type GroupingResponse,
  type Group,
  type InterestingLabel,
  type ReadingStep,
} from './types';

export class GroupingValidationError extends Error {
  constructor(message: string) {
    super(`Invalid grouping response: ${message}`);
    this.name = 'GroupingValidationError';
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
    if (!Array.isArray(raw.files) || raw.files.some((f) => typeof f !== 'string')) {
      throw new GroupingValidationError(`groups[${i}].files must be string[]`);
    }
    return {
      id: asString(raw.id, `groups[${i}].id`),
      title: asString(raw.title, `groups[${i}].title`),
      label: asLabel(raw.label),
      rationale: asString(raw.rationale, `groups[${i}].rationale`),
      files: raw.files as string[],
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
