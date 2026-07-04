<script lang="ts">
  import { panelState, pushLog } from './panel-state.svelte';
  import GroupCard from './GroupCard.svelte';
  import { scrollToFile } from './scroll-to-file';
  import { enableReviewMode, disableReviewMode } from './review-mode';
  import { sortGroupsByImportance } from '../lib/grouping/sort';
  import type { Group } from '../lib/grouping/types';

  const result = $derived(panelState.result);

  const groupsById = $derived(
    new Map<string, Group>((result?.groups ?? []).map((g) => [g.id, g])),
  );

  const sortedGroups = $derived(sortGroupsByImportance(result?.groups ?? []));

  let showDebug = $state(false);

  // Auto-open the debug section when the model returned raw output we captured.
  $effect(() => {
    if (panelState.detail) showDebug = true;
  });

  // User-resizable dimensions; height stays auto (capped) until first dragged.
  let panelEl = $state<HTMLElement | null>(null);
  let width = $state(480);
  let height = $state<number | null>(null);

  function startResize(down: PointerEvent) {
    const handle = down.currentTarget as HTMLElement;
    handle.setPointerCapture?.(down.pointerId);
    const rect = panelEl?.getBoundingClientRect();
    const startWidth = rect?.width || width;
    const startHeight = rect?.height || 480;
    const startX = down.clientX;
    const startY = down.clientY;

    function onMove(move: PointerEvent) {
      // Anchored to the right edge, so dragging left grows the panel.
      width = Math.min(
        Math.max(startWidth + (startX - move.clientX), 320),
        window.innerWidth - 32,
      );
      height = Math.min(
        Math.max(startHeight + (move.clientY - startY), 240),
        window.innerHeight - 96,
      );
    }
    function onUp() {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
    }
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    down.preventDefault();
  }

  // Ticks once a second while loading so the elapsed counter stays live.
  let now = $state(Date.now());
  $effect(() => {
    if (panelState.status !== 'loading') return;
    const id = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(id);
  });
  const elapsedSeconds = $derived(
    Math.max(0, Math.floor((now - (panelState.loadingSince ?? now)) / 1000)),
  );

  const statusDot = $derived(
    panelState.status === 'loading'
      ? 'animate-pulse bg-amber-500'
      : panelState.status === 'error'
        ? 'bg-red-500'
        : panelState.status === 'ready'
          ? 'bg-emerald-500'
          : 'bg-gray-400',
  );

  function jumpToGroup(groupId: string) {
    const group = groupsById.get(groupId);
    const first = group?.files[0];
    if (first) scrollToFile(first);
  }

  function copyLogs() {
    const text = panelState.logs.join('\n');
    void navigator.clipboard?.writeText(text);
  }

  function toggleReviewMode() {
    if (panelState.reviewMode) {
      disableReviewMode();
      panelState.reviewMode = false;
      pushLog('Review mode off — restored the default GitHub file order.');
    } else if (result) {
      if (enableReviewMode(result)) {
        panelState.reviewMode = true;
        pushLog('Review mode on — files grouped and sorted by the analysis.');
      } else {
        pushLog('Review mode: no file diff elements found on this page.');
      }
    }
  }
</script>

{#if panelState.visible && panelState.collapsed}
  <button
    type="button"
    class="fixed right-4 top-20 z-[9999] flex items-center gap-2 rounded-full border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-lg hover:bg-gray-100"
    title="Show github-differ panel"
    onclick={() => (panelState.collapsed = false)}
  >
    <span class="h-2 w-2 rounded-full {statusDot}"></span>
    differ
  </button>
{:else if panelState.visible}
  <aside
    bind:this={panelEl}
    class="fixed right-4 top-20 z-[9999] flex max-w-[92vw] flex-col overflow-hidden rounded-lg border border-gray-300 bg-gray-50 shadow-xl {height === null
      ? 'max-h-[86vh]'
      : ''}"
    style="width: {width}px;{height === null ? '' : ` height: ${height}px;`}"
  >
    <header
      class="flex items-center gap-2 border-b border-gray-200 bg-white px-3 py-2"
    >
      <span class="flex-1 font-semibold text-gray-900">github-differ</span>
      {#if panelState.status === 'ready' && result}
        <button
          type="button"
          class="rounded px-2 py-1 text-xs font-medium {panelState.reviewMode
            ? 'bg-sky-600 text-white hover:bg-sky-700'
            : 'border border-gray-300 text-gray-600 hover:bg-gray-100'}"
          title={panelState.reviewMode
            ? 'Back to the default GitHub file order'
            : 'Group and sort the diffs on the page by the analysis'}
          onclick={toggleReviewMode}
        >
          Review mode{panelState.reviewMode ? ' ✓' : ''}
        </button>
      {/if}
      {#if panelState.fromCache}
        <span
          class="text-xs text-gray-400"
          title={panelState.debug?.cachedAt
            ? `Loaded from cache, saved ${new Date(panelState.debug.cachedAt).toLocaleString()}`
            : 'Loaded from cache'}
        >
          cached
        </span>
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
        onclick={() => (panelState.collapsed = true)}
      >
        ✕
      </button>
    </header>

    <div class="flex-1 overflow-y-auto p-3">
      {#if panelState.status === 'idle'}
        <div class="space-y-3">
          <p class="text-sm text-gray-600">
            Analyze this pull request to get the intent, grouped diffs, and a
            suggested reading order.
          </p>
          <button
            type="button"
            class="rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700"
            onclick={() => panelState.onAnalyze?.()}
          >
            Analyze pull request
          </button>
        </div>
      {:else if panelState.status === 'loading'}
        <div class="space-y-2">
          <p class="animate-pulse text-sm text-gray-500">
            Analyzing pull request… {elapsedSeconds}s
          </p>
          {#if panelState.progress}
            <p class="font-mono text-xs text-gray-400">{panelState.progress}</p>
          {/if}
        </div>
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
            {#each sortedGroups as group (group.id)}
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

    <button
      type="button"
      class="absolute bottom-0 left-0 flex h-5 w-5 cursor-sw-resize items-start justify-end text-gray-300 hover:text-gray-500"
      aria-label="Resize panel"
      title="Drag to resize"
      onpointerdown={startResize}
    >
      <svg viewBox="0 0 8 8" class="h-2.5 w-2.5 rotate-90" fill="currentColor">
        <path d="M0 8 L8 0 L8 8 Z" />
      </svg>
    </button>
  </aside>
{/if}
