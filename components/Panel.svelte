<script lang="ts">
  import { panelState } from './panel-state.svelte';
  import GroupCard from './GroupCard.svelte';
  import { scrollToFile } from './scroll-to-file';
  import type { Group } from '../lib/grouping/types';

  const result = $derived(panelState.result);

  const groupsById = $derived(
    new Map<string, Group>((result?.groups ?? []).map((g) => [g.id, g])),
  );

  let showDebug = $state(false);

  // Auto-open the debug section when the model returned raw output we captured.
  $effect(() => {
    if (panelState.detail) showDebug = true;
  });

  function jumpToGroup(groupId: string) {
    const group = groupsById.get(groupId);
    const first = group?.files[0];
    if (first) scrollToFile(first);
  }

  function copyLogs() {
    const text = panelState.logs.join('\n');
    void navigator.clipboard?.writeText(text);
  }
</script>

{#if panelState.visible}
  <aside
    class="fixed right-4 top-20 z-[9999] flex max-h-[80vh] w-[360px] flex-col overflow-hidden rounded-lg border border-gray-300 bg-gray-50 shadow-xl"
  >
    <header
      class="flex items-center gap-2 border-b border-gray-200 bg-white px-3 py-2"
    >
      <span class="flex-1 font-semibold text-gray-900">github-differ</span>
      {#if panelState.fromCache}
        <span class="text-xs text-gray-400" title="Loaded from cache">cached</span>
      {/if}
      <button
        type="button"
        class="rounded px-2 py-1 text-sm text-gray-500 hover:bg-gray-100"
        title="Re-analyze"
        onclick={() => panelState.onRefresh?.()}
      >
        ↻
      </button>
      <button
        type="button"
        class="rounded px-2 py-1 text-sm text-gray-500 hover:bg-gray-100"
        title="Hide"
        onclick={() => (panelState.visible = false)}
      >
        ✕
      </button>
    </header>

    <div class="flex-1 overflow-y-auto p-3">
      {#if panelState.status === 'loading'}
        <p class="animate-pulse text-sm text-gray-500">Analyzing pull request…</p>
      {:else if panelState.status === 'error'}
        <div class="space-y-3">
          <p class="text-sm text-red-700">{panelState.error}</p>
          {#if panelState.errorKind === 'missing-credentials'}
            <button
              type="button"
              class="rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700"
              onclick={() => panelState.onOpenOptions?.()}
            >
              Open settings
            </button>
          {:else}
            <button
              type="button"
              class="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100"
              onclick={() => panelState.onRefresh?.()}
            >
              Retry
            </button>
          {/if}
        </div>
      {:else if panelState.status === 'ready' && result}
        <section class="space-y-4">
          <div>
            <span
              class="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700"
            >
              {result.changeType}
            </span>
            <p class="mt-2 text-sm text-gray-700">{result.intent}</p>
          </div>

          {#if result.readingOrder.length}
            <div>
              <h2 class="mb-1 text-xs font-semibold uppercase text-gray-500">
                Reading order
              </h2>
              <ol class="space-y-1">
                {#each result.readingOrder as step, i (step.groupId)}
                  <li class="flex gap-2 text-sm">
                    <span class="font-mono text-gray-400">{i + 1}.</span>
                    <button
                      type="button"
                      class="flex-1 text-left hover:underline"
                      onclick={() => jumpToGroup(step.groupId)}
                    >
                      <span class="font-medium text-gray-900">
                        {groupsById.get(step.groupId)?.title ?? step.groupId}
                      </span>
                      <span class="block text-xs text-gray-500">{step.reason}</span>
                    </button>
                  </li>
                {/each}
              </ol>
            </div>
          {/if}

          <div class="space-y-2">
            <h2 class="text-xs font-semibold uppercase text-gray-500">Groups</h2>
            {#each result.groups as group (group.id)}
              <GroupCard {group} defaultOpen={group.label !== 'mechanical'} />
            {/each}
          </div>
        </section>
      {/if}

      {#if panelState.logs.length}
        <div class="mt-4 border-t border-gray-200 pt-2">
          <button
            type="button"
            class="flex w-full items-center gap-1 text-xs font-semibold uppercase text-gray-500"
            onclick={() => (showDebug = !showDebug)}
          >
            <span class="text-gray-400">{showDebug ? '▾' : '▸'}</span>
            Debug log ({panelState.logs.length})
          </button>
          {#if showDebug}
            <div class="mt-2 space-y-2">
              <div class="flex justify-end">
                <button
                  type="button"
                  class="text-xs text-sky-700 hover:underline"
                  onclick={copyLogs}
                >
                  Copy log
                </button>
              </div>
              <pre
                class="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-gray-900 p-2 text-[11px] leading-snug text-gray-100">{panelState.logs.join(
                  '\n',
                )}</pre>
              {#if panelState.detail}
                <div>
                  <p class="mb-1 text-xs font-semibold text-gray-500">
                    Raw model output (failed to parse)
                  </p>
                  <pre
                    class="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-gray-900 p-2 text-[11px] leading-snug text-amber-100">{panelState.detail}</pre>
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </aside>
{/if}
