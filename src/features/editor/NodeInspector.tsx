import { CheckCircle2, GitMerge, MapPin, Plus, Redo2, Scissors, Trash2, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { ENDING_TYPES, GUIDE_EDGE_KINDS, GUIDE_NODE_KINDS, type GuideEdgeKind, type GuideNodeKind } from '../../domain/model';
import { useUiStore } from '../../stores/uiStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';

export function NodeInspector() {
  const selectedId = useUiStore((state) => state.selectedNodeId); const selectNode = useUiStore((state) => state.selectNode);
  const graphMode = useUiStore((state) => state.graphMode); const view = useUiStore((state) => state.view);
  const store = useWorkspaceStore(); const [targetId, setTargetId] = useState(''); const [edgeKind, setEdgeKind] = useState<GuideEdgeKind>('progress');
  const project = store.project; const node = project?.guide.nodes.find((item) => item.id === selectedId);
  if (!project) return null;
  const session = project.sessions.find((item) => item.id === project.activeSessionId) ?? project.sessions[0];
  const isCurrent = Boolean(node && node.id === session?.currentNodeId);
  const readOnly = view === 'graph' && graphMode === 'play';
  if (readOnly && !node) return <aside className="inspector play-inspector"><h2>节点详情</h2><p className="muted">点击路线图中的节点查看详情；使用“聚焦当前位置”确认你所在的位置。</p></aside>;
  if (readOnly && node) return <aside className="inspector play-inspector"><h2>节点详情</h2><span className="node-kind-label">{node.kind.replace('_', ' ')}</span><h3 className="play-node-title">{node.label}</h3>{node.detail && <p className="play-node-detail">{node.detail}</p>}{node.saveSlot && <p className="slot">{node.kind.toUpperCase()} {node.saveSlot}</p>}{node.source && <p className="muted">原文第 {node.source.startLine}{node.source.endLine !== node.source.startLine ? `–${node.source.endLine}` : ''} 行</p>}<CurrentProgressButton isCurrent={isCurrent} onClick={() => void store.setCurrent(node.id)}/></aside>;
  if (!node) return <aside className="inspector"><div className="inspector-heading"><h2>节点属性</h2><HistoryButtons/></div><p className="muted">点击路线图节点或原文行以查看详情。</p><button onClick={() => void store.createNode().then((id) => selectNode(id))}><Plus size={15}/>创建节点</button><Diagnostics/></aside>;
  const relatedEdges = project.guide.edges.filter((edge) => edge.source === node.id || edge.target === node.id);
  const update = (changes: Parameters<typeof store.editNode>[1]) => void store.editNode(node.id, changes);
  return <aside className="inspector"><div className="inspector-heading"><div className="inspector-title"><h2 title={node.label}>节点属性</h2><span title={node.label}>{node.label}</span></div><div className="inspector-history"><HistoryButtons/></div></div>
    <label>类型<select value={node.kind} onChange={(event) => update({ kind: event.target.value as GuideNodeKind })}>{GUIDE_NODE_KINDS.map((kind) => <option key={kind}>{kind}</option>)}</select></label>
    <label>标题<input value={node.label} onChange={(event) => update({ label: event.target.value || '未命名节点' })}/></label>
    <label>详情<textarea rows={4} value={node.detail ?? ''} onChange={(event) => update({ detail: event.target.value })}/></label>
    {(node.kind === 'save' || node.kind === 'load') && <label>存档槽位<input value={node.saveSlot ?? ''} onChange={(event) => update({ saveSlot: event.target.value })}/></label>}
    {node.kind === 'ending' && <label>结局类型<select value={node.endingType ?? 'unknown'} onChange={(event) => update({ endingType: event.target.value as typeof ENDING_TYPES[number] })}>{ENDING_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>}
    {node.kind === 'load' && <label>对应 SAVE<select value={project.guide.edges.find((edge) => edge.source === node.id && edge.kind === 'load_reference')?.target ?? ''} onChange={(event) => void store.setLoadTarget(node.id, event.target.value || undefined)}><option value="">未绑定</option>{project.guide.nodes.filter((item) => item.kind === 'save').map((save) => <option key={save.id} value={save.id}>{save.label}</option>)}</select></label>}
    <CurrentProgressButton isCurrent={isCurrent} onClick={() => void store.setCurrent(node.id)}/>
    <div className="editor-actions"><button onClick={() => void store.splitNode(node.id)}><Scissors size={14}/>拆分</button><button onClick={() => void store.mergeNext(node.id)}><GitMerge size={14}/>合并相邻节点</button></div>
    <div className="edge-editor"><h3>连接</h3>{relatedEdges.map((edge) => { const relatedLabel = project.guide.nodes.find((item) => item.id === (edge.source === node.id ? edge.target : edge.source))?.label ?? '未命名节点'; return <div className="edge-row" key={edge.id}><span title={relatedLabel}>{edge.source === node.id ? '→' : '←'} {relatedLabel}</span><select aria-label={`修改与 ${relatedLabel} 的连接类型`} value={edge.kind} onChange={(event) => void store.editEdge(edge.id, event.target.value as GuideEdgeKind)}>{GUIDE_EDGE_KINDS.map((kind) => <option key={kind}>{kind}</option>)}</select><button className="icon-button" title={`删除与 ${relatedLabel} 的连接`} aria-label={`删除与 ${relatedLabel} 的连接`} onClick={() => void store.removeEdge(edge.id)}><Trash2 size={13}/></button></div>; })}
      <div className="new-edge"><select aria-label="新连接的目标节点" value={targetId} onChange={(event) => setTargetId(event.target.value)}><option value="">选择目标节点</option>{project.guide.nodes.filter((item) => item.id !== node.id).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select><select aria-label="新连接的类型" value={edgeKind} onChange={(event) => setEdgeKind(event.target.value as GuideEdgeKind)}>{GUIDE_EDGE_KINDS.map((kind) => <option key={kind}>{kind}</option>)}</select><button title="添加连接" aria-label="添加连接" disabled={!targetId} onClick={() => void store.addEdge(node.id, targetId, edgeKind)}><Plus size={14}/></button></div>
    </div><Diagnostics nodeId={node.id}/><div className="danger-zone"><span><strong>危险操作</strong><small>删除节点也会移除相关连接。</small></span><button className="danger" onClick={() => { if (confirm(`删除“${node.label}”吗？与它相关的 ${relatedEdges.length} 条连接也会删除。`)) void store.removeNode(node.id).then(() => selectNode()); }}><Trash2 size={14}/>删除节点</button></div>
  </aside>;
}

function CurrentProgressButton({ isCurrent, onClick }: { isCurrent: boolean; onClick: () => void }) {
  return <button className={`primary set-current-button ${isCurrent ? 'is-current' : ''}`} aria-pressed={isCurrent} disabled={isCurrent} onClick={onClick}>{isCurrent ? <CheckCircle2 size={16}/> : <MapPin size={16}/>} {isCurrent ? '当前进度' : '设为当前进度'}</button>;
}

function HistoryButtons() {
  const history = useWorkspaceStore((state) => state.guideHistory); const future = useWorkspaceStore((state) => state.guideFuture);
  const undo = useWorkspaceStore((state) => state.undoGuide); const redo = useWorkspaceStore((state) => state.redoGuide);
  return <span className="history-buttons"><button className="icon-button" aria-label="撤销图编辑" title="撤销图编辑 (Ctrl+Z)" disabled={history.length === 0} onClick={() => void undo()}><Undo2 size={15}/></button><button className="icon-button" aria-label="重做图编辑" title="重做图编辑 (Ctrl+Y)" disabled={future.length === 0} onClick={() => void redo()}><Redo2 size={15}/></button></span>;
}

function Diagnostics({ nodeId }: { nodeId?: string }) {
  const diagnostics = useWorkspaceStore((state) => state.diagnostics); const ignored = useWorkspaceStore((state) => state.ignoredDiagnosticIds); const selectNode = useUiStore((state) => state.selectNode); const setView = useUiStore((state) => state.setView);
  const visible = diagnostics.filter((item) => !ignored.includes(item.id));
  const shown = nodeId ? visible.filter((item) => item.relatedNodeIds?.includes(nodeId)) : visible;
  return <div className="diagnostics"><h3>解析诊断 <span>{shown.length}</span></h3>{shown.slice(0, 20).map((item) => <button key={item.id} className={`diagnostic ${item.severity}`} onClick={() => { selectNode(item.relatedNodeIds?.[0], item.sourceRange?.startLine); if (item.sourceRange) setView('source'); }}><strong>{item.code}</strong><span>{item.message}</span>{item.sourceRange && <small>第 {item.sourceRange.startLine} 行</small>}</button>)}{shown.length === 0 && <p className="muted">当前没有相关诊断。</p>}</div>;
}
