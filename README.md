# github-differ

A browser extension that helps you **review GitHub pull requests faster** by reading the diff and
rendering, right on the **Files changed** page:

- a short **intent** summary (what the PR does & why) with a change-type label,
- the diff **grouped** into reviewable units (behavioral / refactor / test / config / mechanical),
- a suggested **reading order** with a one-line rationale and jump links,
- mechanical noise (lockfiles, generated files, pure formatting, renames) folded away by default.

The grouping and reading order are produced by a heuristic pre-pass (cheap, no LLM) followed by a
Claude call that clusters the remaining "interesting" hunks.

## Status

Early development. See `tasks.json` for the roadmap, `PROJECT_CONTEXT.md` for the design, and
`CLAUDE.md` for the agent workflow.

## Stack

TypeScript · [WXT](https://wxt.dev) (Manifest V3) · Svelte · Tailwind · Bun · `@anthropic-ai/sdk`.

## Quick start

```bash
./setup.sh        # installs deps locally (requires Bun)
make dev          # build unpacked extension with HMR
```

Load `build/chrome-mv3/` as an unpacked extension, open the Options page, and add:

- a **GitHub fine-grained PAT** (read-only: Pull requests + Contents),
- an **LLM provider**:
  - **Anthropic** — an Anthropic API key + model (defaults to `claude-opus-4-8`), or
  - **OpenAI-compatible** — an API key, base URL (e.g. `https://api.openai.com/v1`, OpenRouter,
    Together, or a local LM Studio/Ollama server), and a model name. Custom base URLs prompt for
    host access on save.

> ⚠️ **Security note:** the MVP calls the Claude API directly from the browser, so the Anthropic key is
> stored client-side. Fine for personal use with your own key; for wider distribution, route Claude
> calls through a backend proxy that holds the key (post-MVP).
