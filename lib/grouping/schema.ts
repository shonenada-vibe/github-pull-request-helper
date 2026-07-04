import { INTERESTING_LABELS, IMPORTANCE_LEVELS } from './types';

/**
 * JSON schema passed to Claude via `output_config.format`. Constrains the model
 * to return parseable grouping JSON.
 *
 * JSON-schema limitations to respect (enforced by the API): every object sets
 * `additionalProperties: false`; no min/max or string-length constraints (those
 * are validated client-side in `validate.ts`).
 */
export const GROUPING_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    intent: {
      type: 'string',
      description: 'One-paragraph plain-language summary of what the PR does and why.',
    },
    changeType: {
      type: 'string',
      description:
        "Overall change type, e.g. 'feature', 'bugfix', 'refactor', 'chore'.",
    },
    groups: {
      type: 'array',
      description: 'Reviewable units, clustered by concern.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string', description: 'Short stable id, e.g. "g1".' },
          title: { type: 'string', description: 'Short human-readable group title.' },
          label: { type: 'string', enum: [...INTERESTING_LABELS] },
          importance: {
            type: 'string',
            enum: [...IMPORTANCE_LEVELS],
            description:
              'Reviewer scrutiny this group deserves: high = core/riskiest changes, medium = supporting, low = peripheral.',
          },
          rationale: {
            type: 'string',
            description: 'One line: what this group changes / what to look for.',
          },
          files: {
            type: 'array',
            items: { type: 'string' },
            description: 'Paths of the files in this group (from the provided list).',
          },
        },
        required: ['id', 'title', 'label', 'importance', 'rationale', 'files'],
      },
    },
    readingOrder: {
      type: 'array',
      description: 'The order to read the groups, with a reason for each step.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          groupId: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['groupId', 'reason'],
      },
    },
  },
  required: ['intent', 'changeType', 'groups', 'readingOrder'],
} as const;
