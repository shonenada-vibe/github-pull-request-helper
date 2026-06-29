import type { Settings } from '../storage';
import type { GroupingResponse } from '../grouping/types';
import {
  requestGrouping as anthropicRequestGrouping,
  type CreateMessageFn,
} from '../anthropic/client';
import { requestGrouping as openaiRequestGrouping } from '../openai/client';

export interface RequestGroupingArgs {
  settings: Settings;
  system: string;
  userContent: string;
}

/** Injectable transport hooks so the dispatcher is testable without the network. */
export interface DispatchDeps {
  /** Anthropic SDK message-create override. */
  anthropicCreate?: CreateMessageFn;
  /** OpenAI-compatible fetch override. */
  openaiFetch?: typeof fetch;
}

/**
 * Route a grouping request to the configured provider. The pipeline calls this;
 * it does not know or care which backend is in use.
 */
export function requestGroupingForSettings(
  { settings, system, userContent }: RequestGroupingArgs,
  deps: DispatchDeps = {},
): Promise<GroupingResponse> {
  if (settings.provider === 'openai') {
    return openaiRequestGrouping(
      {
        apiKey: settings.openaiApiKey,
        baseUrl: settings.openaiBaseUrl,
        model: settings.openaiModel,
        system,
        userContent,
      },
      deps.openaiFetch,
    );
  }

  return anthropicRequestGrouping(
    {
      apiKey: settings.anthropicApiKey,
      model: settings.model,
      effort: settings.effort,
      system,
      userContent,
    },
    { createMessage: deps.anthropicCreate },
  );
}
