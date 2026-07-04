import type { GroupingResult } from '../lib/grouping/types';
import type { ErrorKind, DebugInfo } from '../lib/messaging';
import { disableReviewMode } from './review-mode';

export type PanelStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface PanelState {
  /** Whether the panel applies to the current page (set by the content script). */
  visible: boolean;
  /** User preference: collapsed to the small reopen pill. Survives navigation. */
  collapsed: boolean;
  /** True while Review Mode has rearranged the GitHub file list. */
  reviewMode: boolean;
  status: PanelStatus;
  result?: GroupingResult;
  fromCache: boolean;
  error?: string;
  errorKind?: ErrorKind;
  /** Raw model output / extra context shown in the debug section on failure. */
  detail?: string;
  /** Diagnostics from the last successful analysis. */
  debug?: DebugInfo;
  /** Timestamped debug log lines, newest last. */
  logs: string[];
  /** Set by the content script; called when the user clicks "Refresh". */
  onRefresh?: () => void;
  /** Set by the content script; starts analysis from the idle state. */
  onAnalyze?: () => void;
  /** Set by the content script; opens the extension Options page. */
  onOpenOptions?: () => void;
}

/** Shared reactive panel state. The content script mutates it; Panel reads it. */
export const panelState: PanelState = $state({
  visible: false,
  collapsed: false,
  reviewMode: false,
  status: 'idle',
  fromCache: false,
  logs: [],
});

/** Append a timestamped debug line (also mirrored to the console). */
export function pushLog(line: string): void {
  const stamp = new Date().toLocaleTimeString();
  panelState.logs.push(`[${stamp}] ${line}`);
  console.debug('[github-differ]', line);
}

export function resetForLoading(): void {
  // A new analysis (or navigation) invalidates any rearranged file list.
  disableReviewMode();
  panelState.reviewMode = false;
  panelState.visible = true;
  panelState.status = 'loading';
  panelState.result = undefined;
  panelState.error = undefined;
  panelState.errorKind = undefined;
  panelState.detail = undefined;
  panelState.debug = undefined;
  panelState.logs = [];
}
