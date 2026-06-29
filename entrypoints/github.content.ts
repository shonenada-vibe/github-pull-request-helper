import { defineContentScript, createShadowRootUi } from '#imports';
import { mount, unmount } from 'svelte';
import Panel from '../components/Panel.svelte';
import { panelState, resetForLoading } from '../components/panel-state.svelte';
import { sendAnalyze, sendOpenOptions } from '../lib/messaging';
import { parsePrPath, isFilesTab, type PrLocation } from '../lib/pr-url';
import '../assets/tailwind.css';

export default defineContentScript({
  matches: ['https://github.com/*'],
  cssInjectionMode: 'ui',
  async main(ctx) {
    let current: PrLocation | null = null;

    panelState.onOpenOptions = () => sendOpenOptions();

    async function analyze(loc: PrLocation, force = false) {
      current = loc;
      resetForLoading();
      const res = await sendAnalyze({ type: 'ANALYZE', ...loc, force });
      // Ignore stale responses if the user navigated away mid-request.
      if (!current || current.number !== loc.number) return;
      if (res.type === 'RESULT') {
        panelState.status = 'ready';
        panelState.result = res.result;
        panelState.fromCache = res.fromCache;
      } else {
        panelState.status = 'error';
        panelState.error = res.error;
        panelState.errorKind = res.kind;
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
