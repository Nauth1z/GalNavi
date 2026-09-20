import { ArrowLeft, Check, Crosshair } from 'lucide-react';
import { useUiStore } from '../stores/uiStore';
import { useWorkspaceStore } from '../stores/workspaceStore';

export function StatusBar() {
  const { project, advance, rollback } = useWorkspaceStore(); const selectNode = useUiStore((state) => state.selectNode); const setView = useUiStore((state) => state.setView); const requestNodeFocus = useUiStore((state) => state.requestNodeFocus);
  const session = project?.sessions.find((item) => item.id === project.activeSessionId) ?? project?.sessions[0]; const current = project?.guide.nodes.find((node) => node.id === session?.currentNodeId);
  if (!project) return null;
  const pathIds: string[] = [];
  for (const event of session?.history ?? []) {
    if (event.type === 'start') pathIds.push(event.nodeId);
    if (event.type === 'advance') pathIds.push(event.toNodeId);
    if (event.type === 'load') pathIds.push(event.saveNodeId);
    if (event.type === 'rollback' && event.toNodeId) pathIds.push(event.toNodeId);
  }
  const crumbs = pathIds.slice(-4).map((id) => project.guide.nodes.find((node) => node.id === id)?.label).filter((label): label is string => Boolean(label));
  const chapter = [...pathIds].reverse().map((id) => project.guide.nodes.find((node) => node.id === id)).find((node) => node?.kind === 'section');
  return <footer className="statusbar"><div className="progress-copy"><span title={`${chapter?.label ?? '当前进度'} · ${current?.label ?? '未设置'}`}>{chapter?.label ?? '当前进度'} <b aria-hidden>·</b> {current?.label ?? '未设置'}</span><strong title={`最近路径：${crumbs.length ? crumbs.join(' → ') : '尚未开始'}`}>最近路径：{crumbs.length ? crumbs.join(' → ') : '尚未开始'}</strong></div><nav><button title="回到上一步" disabled={!session?.history.length} onClick={() => void rollback()}><ArrowLeft size={16}/><span>上一步</span></button><button title="在路线图中聚焦当前位置" disabled={!current} onClick={() => { if (current) { setView('graph'); selectNode(current.id, current.source?.startLine); requestNodeFocus(current.id); } }}><Crosshair size={16}/><span className="focus-label">聚焦当前位置</span></button><button className="primary advance-button" disabled={!current} onClick={() => void advance()}><Check size={16}/><span>完成并前进</span></button></nav></footer>;
}
