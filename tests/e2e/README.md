# End-to-end tests

`build-artifact.spec.ts` runs in CI/locally with no browser — it asserts the
production build (`make build`) wires the manifest and emits the content-script
and background bundles. Run it with `make test:e2e` (build first).

## Full in-browser smoke test (manual / CI with a display)

A complete e2e that loads the unpacked extension against a real GitHub PR page
requires Playwright browsers and valid credentials, so it is run manually or in
a CI job with a display:

1. `bunx playwright install chromium`
2. `make build`
3. Launch Chromium with the unpacked extension from `.output/chrome-mv3/` using a
   persistent context (`--disable-extensions-except` / `--load-extension`).
4. Set a GitHub PAT + Anthropic key on the Options page.
5. Open a PR's **Files changed** tab and assert the `github-differ` panel mounts,
   the reading order renders, and clicking a step scrolls to the file.

The panel rendering, error states, and file-jump behavior these steps cover are
already verified headlessly by `components/Panel.test.ts` (jsdom).
