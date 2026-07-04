# github-differ — developer commands
# Bun-managed, local-only environment. See setup.sh.

.PHONY: setup dev build bridge test test\:e2e lint typecheck format zip clean

setup: ## Install dependencies
	./setup.sh

dev: ## Build the unpacked extension with HMR (Chrome MV3)
	bun run dev

build: ## Production build
	bun run build

bridge: ## Run the local-agent bridge (Claude Code / Codex) on 127.0.0.1:8765
	bun bridge/server.ts

test: ## Run unit tests (vitest)
	bun run test

test\:e2e: ## Run Playwright content-script/e2e tests
	bun run test:e2e

lint: ## Lint
	bun run lint

typecheck: ## Type-check without emitting
	bun run typecheck

format: ## Format with Prettier
	bun run format

zip: ## Package the extension for distribution
	bun run zip

clean: ## Remove build artifacts
	rm -rf .output node_modules/.cache
