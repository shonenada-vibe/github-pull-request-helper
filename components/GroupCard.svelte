<script lang="ts">
  import { untrack } from 'svelte';
  import type { Group } from '../lib/grouping/types';
  import { scrollToFile } from './scroll-to-file';

  let { group, defaultOpen = true }: { group: Group; defaultOpen?: boolean } =
    $props();

  let open = $state(untrack(() => defaultOpen));

  const labelColors: Record<string, string> = {
    behavioral: 'bg-amber-100 text-amber-800',
    refactor: 'bg-violet-100 text-violet-800',
    test: 'bg-emerald-100 text-emerald-800',
    config: 'bg-sky-100 text-sky-800',
    docs: 'bg-slate-100 text-slate-700',
    mechanical: 'bg-gray-100 text-gray-500',
  };

  const importanceColors: Record<string, string> = {
    high: 'bg-red-100 text-red-800',
    medium: 'bg-amber-50 text-amber-700',
    low: 'bg-gray-100 text-gray-500',
  };
</script>

<div class="rounded-md border border-gray-200 bg-white">
  <button
    type="button"
    class="flex w-full items-center gap-2 px-3 py-2 text-left"
    onclick={() => (open = !open)}
  >
    <span class="text-gray-400">{open ? '▾' : '▸'}</span>
    <span class="flex-1 font-medium text-gray-900">{group.title}</span>
    {#if group.importance && group.label !== 'mechanical'}
      <span
        class="rounded-full px-2 py-0.5 text-xs font-medium {importanceColors[
          group.importance
        ]}"
        title="Importance"
      >
        {group.importance}
      </span>
    {/if}
    <span
      class="rounded-full px-2 py-0.5 text-xs font-medium {labelColors[
        group.label
      ] ?? 'bg-gray-100 text-gray-600'}"
    >
      {group.label}
    </span>
  </button>

  {#if open}
    <div class="border-t border-gray-100 px-3 py-2">
      <p class="mb-2 text-sm text-gray-600">{group.rationale}</p>
      <ul class="space-y-1">
        {#each group.files as file (file)}
          <li>
            <button
              type="button"
              class="w-full truncate text-left font-mono text-xs text-sky-700 hover:underline"
              title={file}
              onclick={() => scrollToFile(file)}
            >
              {file}
            </button>
          </li>
        {/each}
      </ul>
    </div>
  {/if}
</div>
