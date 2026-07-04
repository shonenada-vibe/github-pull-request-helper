import type { Settings } from '../storage';
import type { GroupingResponse } from '../grouping/types';
import {
  requestGrouping as anthropicRequestGrouping,
  type CreateMessageFn,
} from '../anthropic/client';
import { requestGrouping as openaiRequestGrouping } from '../openai/client';
import { requestGrouping as carevieRequestGrouping } from '../carevie/client';

export interface RequestGroupingArgs {
  settings: Settings;
  system: string;
  userContent: string;
  /** PR coordinates, for providers (Carevie) that analyze server-side. */
  pr: { owner: string; repo: string; number: number };
}

/** Injectable transport hooks so the dispatcher is testable without the network. */
export interface DispatchDeps {
  /** Anthropic SDK message-create override. */
  anthropicCreate?: CreateMessageFn;
  /** OpenAI-compatible fetch override. */
  openaiFetch?: typeof fetch;
  /** Carevie fetch override. */
  carevieFetch?: typeof fetch;
}

/**
 * Route a grouping request to the configured provider. The pipeline calls this;
 * it does not know or care which backend is in use.
 */
export function requestGroupingForSettings(
  { settings, system, userContent, pr }: RequestGroupingArgs,
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

  if (settings.provider === 'carevie') {
    return carevieRequestGrouping(
      {
        token: settings.carevieToken,
        baseUrl: settings.carevieBaseUrl,
        owner: pr.owner,
        repo: pr.repo,
        number: pr.number,
        language: settings.language,
      },
      deps.carevieFetch,
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
