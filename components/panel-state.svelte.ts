import type { GroupingResult } from '../lib/grouping/types';
import type { ErrorKind } from '../lib/messaging';

export type PanelStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface PanelState {
  visible: boolean;
  status: PanelStatus;
  result?: GroupingResult;
  fromCache: boolean;
  error?: string;
  errorKind?: ErrorKind;
  /** Set by the content script; called when the user clicks "Refresh". */
  onRefresh?: () => void;
  /** Set by the content script; opens the extension Options page. */
  onOpenOptions?: () => void;
}

/** Shared reactive panel state. The content script mutates it; Panel reads it. */
export const panelState: PanelState = $state({
  visible: false,
  status: 'idle',
  fromCache: false,
});

export function resetForLoading(): void {
  panelState.visible = true;
  panelState.status = 'loading';
  panelState.result = undefined;
  panelState.error = undefined;
  panelState.errorKind = undefined;
}
