<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from 'wxt/browser';
  import {
    getSettings,
    setSettings,
    DEFAULT_SETTINGS,
    type Settings,
  } from '../../lib/storage';
  import { MODELS } from '../../lib/anthropic/client';
  import { originPattern } from '../../lib/host-permission';

  let form = $state<Settings>({ ...DEFAULT_SETTINGS });
  let saved = $state(false);

  const efforts: Settings['effort'][] = ['low', 'medium', 'high'];

  onMount(async () => {
    form = await getSettings();
  });

  async function ensureHostPermission(baseUrl: string) {
    const pattern = originPattern(baseUrl);
    if (!pattern) return;
    try {
      const has = await browser.permissions.contains({ origins: [pattern] });
      if (!has) await browser.permissions.request({ origins: [pattern] });
    } catch {
      // Best-effort: still save even if the grant is declined/unavailable.
    }
  }

  async function save(event: Event) {
    event.preventDefault();
    if (form.provider === 'openai') await ensureHostPermission(form.openaiBaseUrl);
    if (form.provider === 'carevie') await ensureHostPermission(form.carevieBaseUrl);
    await setSettings($state.snapshot(form));
    saved = true;
    setTimeout(() => (saved = false), 2000);
  }
</script>

<main class="mx-auto max-w-xl p-6 font-sans text-gray-900">
  <h1 class="mb-1 text-xl font-semibold">github-differ settings</h1>
  <p class="mb-6 text-sm text-gray-500">
    Credentials are stored locally in this browser profile and never leave it
    except to call the GitHub and your chosen LLM API directly.
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
      <span class="text-sm font-medium">LLM provider</span>
      <select
        bind:value={form.provider}
        class="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
      >
        <option value="anthropic">Anthropic (Claude)</option>
        <option value="openai">OpenAI-compatible</option>
        <option value="carevie">Carevie (review service)</option>
      </select>
    </label>

    {#if form.provider === 'anthropic'}
      <fieldset class="space-y-4 rounded border border-gray-200 p-4">
        <legend class="px-1 text-xs font-semibold uppercase text-gray-500">
          Anthropic
        </legend>
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
      </fieldset>
    {:else if form.provider === 'openai'}
      <fieldset class="space-y-4 rounded border border-gray-200 p-4">
        <legend class="px-1 text-xs font-semibold uppercase text-gray-500">
          OpenAI-compatible
        </legend>
        <label class="block">
          <span class="text-sm font-medium">API key</span>
          <input
            type="password"
            autocomplete="off"
            bind:value={form.openaiApiKey}
            placeholder="sk-…"
            class="mt-1 w-full rounded border border-gray-300 px-3 py-2 font-mono text-sm"
          />
        </label>
        <label class="block">
          <span class="text-sm font-medium">Base URL</span>
          <input
            type="text"
            autocomplete="off"
            spellcheck="false"
            bind:value={form.openaiBaseUrl}
            placeholder="https://api.openai.com/v1"
            class="mt-1 w-full rounded border border-gray-300 px-3 py-2 font-mono text-sm"
          />
          <span class="mt-1 block text-xs text-gray-500">
            Works with OpenAI, OpenRouter, Together, or a local server (LM Studio,
            Ollama). You'll be asked to grant access to this host on save.
          </span>
        </label>
        <label class="block">
          <span class="text-sm font-medium">Model</span>
          <input
            type="text"
            autocomplete="off"
            spellcheck="false"
            bind:value={form.openaiModel}
            placeholder="gpt-4o-mini"
            class="mt-1 w-full rounded border border-gray-300 px-3 py-2 font-mono text-sm"
          />
        </label>
      </fieldset>
    {:else}
      <fieldset class="space-y-4 rounded border border-gray-200 p-4">
        <legend class="px-1 text-xs font-semibold uppercase text-gray-500">
          Carevie
        </legend>
        <label class="block">
          <span class="text-sm font-medium">API token</span>
          <input
            type="password"
            autocomplete="off"
            bind:value={form.carevieToken}
            placeholder="Bearer token"
            class="mt-1 w-full rounded border border-gray-300 px-3 py-2 font-mono text-sm"
          />
        </label>
        <label class="block">
          <span class="text-sm font-medium">Base URL</span>
          <input
            type="text"
            autocomplete="off"
            spellcheck="false"
            bind:value={form.carevieBaseUrl}
            placeholder="https://carevie.dolpc.com"
            class="mt-1 w-full rounded border border-gray-300 px-3 py-2 font-mono text-sm"
          />
          <span class="mt-1 block text-xs text-gray-500">
            The service analyzes the PR server-side from its coordinates — no model
            or prompt configuration needed. You'll be asked to grant access to this
            host on save.
          </span>
        </label>
      </fieldset>
    {/if}

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
