import { ArrowLeft, Check, Maximize2 } from 'lucide-react';
import { desktopPlatform } from '../../platform/desktop';
import { useUiStore } from '../../stores/uiStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';

export function MiniMode() {
  const project = useWorkspaceStore((state) => state.project); const advance = useWorkspaceStore((state) => state.advance); const rollback = useWorkspaceStore((state) => state.rollback);
  const setMiniMode = useUiStore((state) => state.setMiniMode); const setError = useUiStore((state) => state.setError); const session = project?.sessions.find((item) => item.id === project.activeSessionId) ?? project?.sessions[0]; const current = project?.guide.nodes.find((node) => node.id === session?.currentNodeId);
  const exit = async () => { try { await desktopPlatform.exitMiniMode(); setMiniMode(false); } catch (error) { setError(`无法恢复主窗口：${error instanceof Error ? error.message : '窗口权限不可用'}`); } };
  return <main className="mini-mode"><header><div className="mini-drag-handle" onMouseDown={() => void desktopPlatform.startDragging()}><strong>{project?.title ?? 'GalNavi'}</strong><small>{session?.name ?? '未开始'}</small></div><button className="icon-button" title="展开主窗口" aria-label="展开主窗口" onMouseDown={(event) => event.stopPropagation()} onClick={() => void exit()}><Maximize2 size={17}/></button></header>
    <section><span className="mini-kind">{current?.kind ?? '未定位'}</span><h1>{current?.label ?? '请选择当前步骤'}</h1><p>{current?.detail || '完成当前游戏操作后继续。'}</p></section>
    <footer><button onClick={() => void rollback()}><ArrowLeft size={16}/>上一步</button><button className="primary advance-button" onClick={() => void advance()}><Check size={16}/>完成并前进</button></footer>
  </main>;
}
