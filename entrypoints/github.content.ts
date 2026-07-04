import { defineContentScript, createShadowRootUi } from '#imports';
import { mount, unmount } from 'svelte';
import Panel from '../components/Panel.svelte';
import { panelState, resetForLoading, pushLog } from '../components/panel-state.svelte';
import { enableReviewMode, disableReviewMode } from '../components/review-mode';
import { sendAnalyze, sendOpenOptions } from '../lib/messaging';
import { getSettings } from '../lib/storage';
import type { GroupingResult } from '../lib/grouping/types';
import { parsePrPath, isFilesTab, type PrLocation } from '../lib/pr-url';
import '../assets/tailwind.css';

export default defineContentScript({
  matches: ['https://github.com/*'],
  cssInjectionMode: 'ui',
  async main(ctx) {
    let current: PrLocation | null = null;

    panelState.onOpenOptions = () => sendOpenOptions();

    /**
     * Turn on Review Mode for a fresh result when the setting allows. GitHub
     * may still be rendering diffs when a (cached) result lands, so a failed
     * attempt retries once shortly after.
     */
    async function maybeAutoReview(loc: PrLocation, result: GroupingResult) {
      const settings = await getSettings();
      if (!settings.autoReviewMode) return;

      const attempt = () => {
        // The user may have navigated or toggled manually in the meantime.
        if (!current || current.number !== loc.number || panelState.reviewMode) {
          return true;
        }
        if (enableReviewMode(result)) {
          panelState.reviewMode = true;
          pushLog('Auto review mode: files grouped and sorted on the page.');
          return true;
        }
        return false;
      };

      if (!attempt()) {
        setTimeout(() => {
          if (!attempt()) {
            pushLog('Auto review mode: no file diff elements found on the page.');
          }
        }, 2000);
      }
    }

    async function analyze(loc: PrLocation, force = false) {
      current = loc;
      resetForLoading();
      const startedAt = Date.now();
      pushLog(
        `Analyzing ${loc.owner}/${loc.repo}#${loc.number}${force ? ' (forced refresh)' : ''}`,
      );

      let res;
      try {
        res = await sendAnalyze({ type: 'ANALYZE', ...loc, force });
      } catch (err) {
        // The background channel itself failed (worker asleep, reload, etc.).
        if (!current || current.number !== loc.number) return;
        panelState.status = 'error';
        panelState.error = `Could not reach the extension worker: ${String(err)}`;
        panelState.errorKind = 'unknown';
        pushLog(`Messaging error: ${String(err)}`);
        return;
      }

      // Ignore stale responses if the user navigated away mid-request.
      if (!current || current.number !== loc.number) {
        pushLog('Ignored a stale response (navigated away).');
        return;
      }

      const roundTrip = Date.now() - startedAt;
      if (res.type === 'RESULT') {
        panelState.status = 'ready';
        panelState.result = res.result;
        panelState.fromCache = res.fromCache;
        panelState.debug = res.debug;
        const d = res.debug;
        const cacheNote = d.fromCache
          ? `, from cache (saved ${d.cachedAt ? new Date(d.cachedAt).toLocaleString() : 'earlier'})`
          : '';
        pushLog(
          `Done in ${roundTrip}ms via ${d.provider}/${d.model || '(model unset)'} — ` +
            `${d.totalFiles} files (${d.interesting} interesting, ${d.mechanical} mechanical), ` +
            `${d.usedLlm ? 'LLM' : 'no LLM'}${cacheNote}.`,
        );
        pushLog(`Rendered ${res.result.groups.length} groups.`);
        void maybeAutoReview(loc, res.result);
      } else {
        panelState.status = 'error';
        panelState.error = res.error;
        panelState.errorKind = res.kind;
        panelState.detail = res.detail;
        pushLog(`Error (${res.kind}) after ${roundTrip}ms: ${res.error}`);
        if (res.detail) pushLog('Raw model output captured below.');
      }
    }

    panelState.onRefresh = () => {
      if (current) void analyze(current, true);
    };

    function evaluateLocation() {
      const loc = parsePrPath(window.location.pathname);
      if (loc && isFilesTab(window.location.pathname)) {
        // Only re-run when the PR actually changed.
        if (!current || current.number !== loc.number || current.repo !== loc.repo) {
          void analyze(loc);
        }
      } else {
        // Left the files tab — drop any DOM rearrangement (likely stale anyway).
        disableReviewMode();
        panelState.reviewMode = false;
        panelState.visible = false;
        current = null;
      }
    }

    // Mount the Shadow-DOM panel once; it reacts to panelState.
    const ui = await createShadowRootUi(ctx, {
      name: 'github-differ-panel',
      position: 'overlay',
      anchor: 'body',
      onMount: (container) => mount(Panel, { target: container }),
      onRemove: (app) => {
        if (app) void unmount(app);
      },
    });
    ui.mount();

    // GitHub uses Turbo/PJAX soft navigation — react to it, plus the initial load.
    ctx.addEventListener(window, 'wxt:locationchange', evaluateLocation);
    evaluateLocation();
  },
});
