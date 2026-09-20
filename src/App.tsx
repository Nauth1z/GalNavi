import { FileText, GitFork } from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { BranchDialog } from './components/BranchDialog';
import { DiagnosticsPanel } from './components/DiagnosticsPanel';
import { StatusBar } from './components/StatusBar';
import { TopBar } from './components/TopBar';
import { WindowChrome } from './components/WindowChrome';
import { NodeInspector } from './features/editor/NodeInspector';
import { NewProjectPanel } from './features/import/NewProjectPanel';
import { MiniMode } from './features/mini-mode/MiniMode';
import { ProjectSidebar } from './features/projects/ProjectSidebar';
import { projectRepository } from './storage/repository';
import { useProjectListStore } from './stores/projectListStore';
import { useUiStore, type WorkspaceView } from './stores/uiStore';
import { useWorkspaceStore } from './stores/workspaceStore';

const views: { id: WorkspaceView; label: string; icon: typeof GitFork }[] = [{ id: 'graph', label: '路线图', icon: GitFork }, { id: 'source', label: '原文', icon: FileText }];
const GraphView = lazy(() => import('./features/graph/GraphView').then((module) => ({ default: module.GraphView })));
const SourceView = lazy(() => import('./features/source/SourceView').then((module) => ({ default: module.SourceView })));

export default function App() {
  const refresh = useProjectListStore((state) => state.refresh); const replaceSummary = useProjectListStore((state) => state.replaceSummary); const { project, diagnostics, ignoredDiagnosticIds, reparse } = useWorkspaceStore(); const ui = useUiStore(); const [showNew, setShowNew] = useState(false);
  useEffect(() => { void refresh().catch((error: unknown) => ui.setError(error instanceof Error ? error.message : '项目列表读取失败')); }, [refresh]);
  useEffect(() => { if (ui.focusedLine && ui.view === 'source') requestAnimationFrame(() => document.getElementById(`source-line-${ui.focusedLine}`)?.scrollIntoView({ block: 'center' })); }, [ui.focusedLine, ui.view]);
  useEffect(() => { if (project) setShowNew(false); }, [project?.id]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
      if (useUiStore.getState().graphMode !== 'edit') return;
      if (event.key.toLowerCase() === 'z') { event.preventDefault(); void (event.shiftKey ? useWorkspaceStore.getState().redoGuide() : useWorkspaceStore.getState().undoGuide()); }
      if (event.key.toLowerCase() === 'y') { event.preventDefault(); void useWorkspaceStore.getState().redoGuide(); }
    };
    window.addEventListener('keydown', onKeyDown); return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
  const parsedStats = useMemo(() => { const visibleDiagnostics = diagnostics.filter((item) => !ignoredDiagnosticIds.includes(item.id)); return project ? {
    nodes: project.guide.nodes.length,
    choiceGroups: project.guide.nodes.filter((node) => node.kind === 'choice_group').length,
    saves: project.guide.nodes.filter((node) => node.kind === 'save').length,
    loads: project.guide.nodes.filter((node) => node.kind === 'load').length,
    endings: project.guide.nodes.filter((node) => node.kind === 'ending').length,
    warnings: visibleDiagnostics.filter((item) => item.severity === 'warning').length,
    errors: visibleDiagnostics.filter((item) => item.severity === 'error').length,
  } : undefined; }, [project?.guide, diagnostics, ignoredDiagnosticIds]);
  const beginNewProject = async () => {
    try {
      while (useWorkspaceStore.getState().saving) await new Promise((resolve) => window.setTimeout(resolve, 25));
      const workspace = useWorkspaceStore.getState(); const current = workspace.project;
      if (current) { await projectRepository.save(current); replaceSummary(current); }
      workspace.close(); ui.selectNode(); setShowNew(true);
    } catch (error) { ui.setError(`无法保存并退出当前项目：${error instanceof Error ? error.message : '本地存储不可用'}`); }
  };
  if (ui.miniMode) return <><MiniMode/><BranchDialog/></>;
  const sidebarVisible = !project || ui.graphMode === 'edit';
  return <div className={`app-shell${sidebarVisible ? '' : ' sidebar-hidden'}`}><WindowChrome/><TopBar/><div className="app-body"><ProjectSidebar visible={sidebarVisible} onNew={() => void beginNewProject()}/><main className="workspace">
    {!project || showNew ? <NewProjectPanel onCreated={() => setShowNew(false)}/> : <>
      <div className="view-tabs"><nav aria-label="工作区视图">{views.map(({ id, label, icon: Icon }) => <button key={id} className={ui.view === id ? 'active' : ''} aria-pressed={ui.view === id} onClick={() => ui.setView(id)}><Icon size={16}/>{label}</button>)}</nav>
        {parsedStats && <div className="parse-stats"><span>{parsedStats.nodes} 节点</span><span>{parsedStats.choiceGroups} 选择组</span><span>{parsedStats.saves} SAVE</span><span>{parsedStats.loads} LOAD</span><span>{parsedStats.endings} 结局</span><button className="warning" onClick={() => ui.showDiagnostics('warning')}><AlertTriangleIcon/>警告 {parsedStats.warnings}</button><button className="error" onClick={() => ui.showDiagnostics('error')}><ErrorIcon/>错误 {parsedStats.errors}</button><button onClick={() => void reparse()}>重新解析</button></div>}
      </div><div className="workspace-grid"><div className="main-view"><Suspense fallback={<p className="view-loading">正在打开视图…</p>}>{ui.view === 'graph' && <GraphView/>}{ui.view === 'source' && <SourceView/>}</Suspense></div><NodeInspector/></div>
    </>}</main></div><StatusBar/><BranchDialog/><DiagnosticsPanel/>{ui.error && <div role="alert" className="toast"><span>{ui.error}</span><button onClick={() => ui.setError()}>关闭</button></div>}</div>;
}

function AlertTriangleIcon() { return <span aria-hidden>⚠</span>; }
function ErrorIcon() { return <span aria-hidden>×</span>; }
