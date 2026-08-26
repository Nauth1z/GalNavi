import { create } from 'zustand';

export type WorkspaceView = 'graph' | 'source';
export type GraphMode = 'play' | 'edit';
export type DiagnosticFilter = 'all' | 'warning' | 'error';
interface UiState {
  view: WorkspaceView;
  graphMode: GraphMode;
  selectedNodeId?: string;
  focusedLine?: number;
  focusNodeId?: string;
  focusRequest: number;
  miniMode: boolean;
  alwaysOnTop: boolean;
  diagnosticsOpen: boolean;
  diagnosticFilter: DiagnosticFilter;
  error?: string;
  setView: (view: WorkspaceView) => void;
  setGraphMode: (mode: GraphMode) => void;
  selectNode: (nodeId?: string, line?: number) => void;
  requestNodeFocus: (nodeId: string) => void;
  setMiniMode: (enabled: boolean) => void;
  setAlwaysOnTop: (enabled: boolean) => void;
  showDiagnostics: (filter?: DiagnosticFilter) => void;
  hideDiagnostics: () => void;
  setError: (error?: string) => void;
}

export const useUiStore = create<UiState>((set) => ({
  view: 'graph', graphMode: 'play', focusRequest: 0, miniMode: false, alwaysOnTop: false, diagnosticsOpen: false, diagnosticFilter: 'all',
  setView: (view) => set({ view }),
  setGraphMode: (graphMode) => set({ graphMode }),
  selectNode: (selectedNodeId, focusedLine) => set({ selectedNodeId, focusedLine }),
  requestNodeFocus: (focusNodeId) => set((state) => ({ focusNodeId, focusRequest: state.focusRequest + 1 })),
  setMiniMode: (miniMode) => set({ miniMode }),
  setAlwaysOnTop: (alwaysOnTop) => set({ alwaysOnTop }),
  showDiagnostics: (diagnosticFilter = 'all') => set({ diagnosticsOpen: true, diagnosticFilter }),
  hideDiagnostics: () => set({ diagnosticsOpen: false }),
  setError: (error) => set({ error }),
}));
