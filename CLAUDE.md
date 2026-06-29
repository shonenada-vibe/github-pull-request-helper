# github-differ — Agent Guide

> A browser extension that reads a GitHub pull request and renders, directly on the
> **Files changed** page, a **logical grouping** of the diff plus a suggested
> **reading order** — so reviewers know *what* the PR does and *in what order* to read it.

This file defines how every AI agent works in this repo. Read it fully before doing anything.
For the technical design and conventions, read `PROJECT_CONTEXT.md`. For the task list, read `tasks.json`.

---

## Agent Workflow

Every agent MUST follow these steps in order. Do not skip steps.

### Step 1: Initialize Environment
- Run `./setup.sh` to install dependencies into the **local** project (never globally).
- The environment is isolated via `bun` + a local `node_modules/` — do **not** install system software.
  If a tool is missing, surface it; do not `apt`/`brew` install. Use Docker only if unavoidable.
- Start the dev build with `make dev` (runs `wxt dev`, which builds the unpacked extension with HMR).
  **Do not proceed until the dev build compiles cleanly.**

### Step 2: Select Next Task
- Read `tasks.json` and pick exactly ONE task, in this priority order:
  1. A task where `passes: false`.
  2. Respect dependencies — foundational tasks (scaffold, storage, clients) come before UI/pipeline.
  3. Among eligible tasks, pick the highest-priority incomplete one (top of the list wins).

### Step 3: Implement the Task
- Read the task `description` and `steps` carefully; satisfy every step.
- Follow existing patterns and the conventions in `PROJECT_CONTEXT.md`.
- Keep changes scoped to the task. Do not refactor unrelated code.

### Step 4: Test Thoroughly
- Add unit tests where logic warrants (diff parsing, heuristics, schema validation) — `make test`.
- For UI/content-script behavior, use Playwright (`make test:e2e`) against the fixture PR pages.
- `make lint` and `make typecheck` MUST pass with zero errors.
- Fix every error before continuing. No `// @ts-ignore` to silence real problems.

### Step 5: Update Progress
- Append your work to `PROGRESS/{task_id}.md`:
  ```
  ## [YYYY-MM-DD HH:MM] - Task: [task description]

  ### What was done:
  - [specific changes]

  ### Testing:
  - [how it was verified]

  ### Notes:
  - [anything the next agent should know]
  ```

### Step 6: Commit Changes
- Commit with a Google-style message: `<type>(<scope>): <summary>` first line, then a body.
  Example: `feat(pipeline): cluster diff hunks into reviewable groups`
- Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `build`.

### Step 7: Mark Task Complete
- In `tasks.json`, flip that task's `passes` from `false` to `true`.
- Mark `passes: true` ONLY after every step is verified.
- Never delete, reword, or reorder tasks. Never remove a task. Only flip the flag.

---

## Agent Key Rules
1. **One task per session** — finish it well.
2. **Test before marking complete** — every step must pass.
3. **Document in `PROGRESS/`** — help the next agent.
4. **Commit your changes** — keep git history clean.
5. **Never remove tasks** — only flip `passes: false` → `true`.

---

## Product North Star
A reviewer opens `github.com/<owner>/<repo>/pull/<n>/files` and, without leaving the page, gets:
- a one-paragraph **intent** summary (what & why) and a change-type label;
- the diff **grouped** into reviewable units (behavioral / refactor / test / config / mechanical);
- a **reading order** with a one-line rationale per group and jump links to the files/hunks;
- mechanical noise (lockfiles, generated files, pure formatting, renames) folded away by default.

Grouping + reading order is the core value — prioritize it over polish elsewhere.
