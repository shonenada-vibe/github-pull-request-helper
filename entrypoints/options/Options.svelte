<script lang="ts">
  import { onMount } from 'svelte';
  import {
    getSettings,
    setSettings,
    DEFAULT_SETTINGS,
    type Settings,
  } from '../../lib/storage';
  import { MODELS } from '../../lib/anthropic/client';

  let form = $state<Settings>({ ...DEFAULT_SETTINGS });
  let saved = $state(false);

  const efforts: Settings['effort'][] = ['low', 'medium', 'high'];

  onMount(async () => {
    form = await getSettings();
  });

  async function save(event: Event) {
    event.preventDefault();
    await setSettings($state.snapshot(form));
    saved = true;
    setTimeout(() => (saved = false), 2000);
  }
</script>

<main class="mx-auto max-w-xl p-6 font-sans text-gray-900">
  <h1 class="mb-1 text-xl font-semibold">github-differ settings</h1>
  <p class="mb-6 text-sm text-gray-500">
    Credentials are stored locally in this browser profile and never leave it
    except to call the GitHub and Anthropic APIs directly.
  </p>

  <form class="space-y-5" onsubmit={save}>
    <label class="block">
      <span class="text-sm font-medium">GitHub token (fine-grained PAT)</span>
      <input
        type="password"
        autocomplete="off"
        bind:value={form.githubToken}
        placeholder="github_pat_…"
        class="mt-1 w-full rounded border border-gray-300 px-3 py-2 font-mono text-sm"
      />
      <span class="mt-1 block text-xs text-gray-500">
        Read-only access to Pull requests + Contents.
      </span>
    </label>

    <label class="block">
      <span class="text-sm font-medium">Anthropic API key</span>
      <input
        type="password"
        autocomplete="off"
        bind:value={form.anthropicApiKey}
        placeholder="sk-ant-…"
        class="mt-1 w-full rounded border border-gray-300 px-3 py-2 font-mono text-sm"
      />
    </label>

    <div class="flex gap-4">
      <label class="block flex-1">
        <span class="text-sm font-medium">Model</span>
        <select
          bind:value={form.model}
          class="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
        >
          {#each MODELS as model (model)}
            <option value={model}>{model}</option>
          {/each}
        </select>
      </label>

      <label class="block flex-1">
        <span class="text-sm font-medium">Effort</span>
        <select
          bind:value={form.effort}
          class="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
        >
          {#each efforts as effort (effort)}
            <option value={effort}>{effort}</option>
          {/each}
        </select>
      </label>
    </div>

    <div class="flex items-center gap-3">
      <button
        type="submit"
        class="rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
      >
        Save
      </button>
      {#if saved}
        <span class="text-sm text-emerald-600">Saved ✓</span>
      {/if}
    </div>
  </form>
</main>
