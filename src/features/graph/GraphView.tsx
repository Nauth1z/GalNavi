import { useCallback, useEffect, useMemo, useState } from 'react';
import { Background, BackgroundVariant, ControlButton, Controls, Handle, MarkerType, MiniMap, Position, ReactFlow, useNodesState, type Connection, type Edge, type Node, type NodeProps, type OnNodeDrag, type ReactFlowInstance } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { AlertTriangle, Bookmark, CheckCircle2, CircleDot, CircleX, Flag, GitBranch, Lock, MapPin, Play, Plus, Redo2, RotateCcw, Undo2, Unlock, Upload } from 'lucide-react';
import type { GuideNode } from '../../domain/model';
import { deriveLoadBranchProjections } from '../../domain/loadProjection';
import { deriveGuideNodeVisualStates, type GuideNodeVisualState } from '../../domain/visualState';
import { GUIDE_NODE_HEIGHT, GUIDE_NODE_WIDTH, layoutGuide } from '../../layout/elkLayout';
import { useUiStore } from '../../stores/uiStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';

type GuideFlowData = { guide: GuideNode; visual: GuideNodeVisualState; editing: boolean; hasError: boolean };
type GuideFlowNode = Node<GuideFlowData, 'guide'>;
const icons: Partial<Record<GuideNode['kind'], typeof Play>> = { root: Play, choice_group: GitBranch, save: Bookmark, load: Upload, ending: Flag };
const kindLabels: Record<GuideNode['kind'], string> = { root: '起点', section: '章节', step: '步骤', choice_group: '选择组', choice: '选项', save: 'SAVE', load: 'LOAD', ending: '结局', condition: '条件', note: '注记' };
const emptyVisual: GuideNodeVisualState = { isCurrent: false, isVisited: false, isOnChosenRoute: false, isAvailableNext: false, isUnselectedBranch: false };

function GuideNodeCard({ data, selected }: NodeProps<GuideFlowNode>) {
  const Icon = icons[data.guide.kind] ?? Play; const low = data.guide.parseConfidence < 0.6; const state = data.visual;
  const classes = ['flow-card', `kind-${data.guide.kind}`, data.guide.endingType && `ending-${data.guide.endingType}`, data.guide.detail && 'has-detail', state.isCurrent && 'current', state.isVisited && 'visited', state.isOnChosenRoute && 'chosen-route', state.isAvailableNext && 'available-next', state.isUnselectedBranch && 'unselected-branch', selected && 'selected'].filter(Boolean).join(' ');
  return <div className={classes} data-node-id={data.guide.id}>
    <Handle type="target" position={Position.Top}/><div className="flow-card-top"><span className="flow-kind"><Icon size={13}/>{kindLabels[data.guide.kind]}</span><span className="flow-status">
      {state.isCurrent && <MapPin className="current-marker" size={15} aria-label="当前位置"/>}
      {state.isAvailableNext && !state.isCurrent && <CircleDot className="next-marker" size={15} aria-label="可执行下一步"/>}
      {state.isVisited && !state.isCurrent && <CheckCircle2 className="visited-marker" size={15} aria-label="已完成"/>}
      {data.hasError && data.editing && <CircleX className="error-marker" size={15} aria-label="解析错误"/>}
      {low && data.editing && !data.hasError && <AlertTriangle className="confidence" size={15} aria-label="低置信度"/>}
    </span></div><strong className="flow-title" title={data.guide.label}>{data.guide.label}</strong>
    {data.guide.saveSlot && <small className="slot">{data.guide.kind.toUpperCase()} {data.guide.saveSlot}</small>}
    {data.guide.detail && <small className="flow-detail">{data.guide.detail}</small>}
    {data.editing && data.guide.source && <small className="source-range">第 {data.guide.source.startLine} 行</small>}
    {state.isUnselectedBranch && <span className="sr-only">未选择分支</span>}<Handle type="source" position={Position.Bottom}/>
  </div>;
}
const nodeTypes = { guide: GuideNodeCard };

export function GraphView() {
  const store = useWorkspaceStore();
  const { project, diagnostics, savePosition, savePositions, guideHistory, guideFuture, undoGuide, redoGuide, addEdge, removeEdge, createNode } = store;
  const { selectNode, selectedNodeId, focusNodeId, focusRequest, graphMode } = useUiStore(); const editing = graphMode === 'edit';
  const [layouting, setLayouting] = useState(false); const [canvasInteractive, setCanvasInteractive] = useState(true); const [flow, setFlow] = useState<ReactFlowInstance<GuideFlowNode>>();
  const session = project?.sessions.find((item) => item.id === project.activeSessionId) ?? project?.sessions[0];
  const loadProjections = useMemo(() => project ? deriveLoadBranchProjections(project.guide) : [], [project?.guide]);
  const visualStates = useMemo(() => project ? deriveGuideNodeVisualStates(project.guide, session) : new Map<string, GuideNodeVisualState>(), [project?.guide, session]);
  const errorNodeIds = useMemo(() => new Set(diagnostics.filter((item) => item.severity === 'error').flatMap((item) => item.relatedNodeIds ?? [])), [diagnostics]);
  const sourceNodes = useMemo<GuideFlowNode[]>(() => project?.guide.nodes.filter((item) => !item.ignored).map((item, index) => ({
    id: item.id, type: 'guide', position: item.position ?? { x: (index % 5) * 230, y: Math.floor(index / 5) * 130 },
    data: { guide: item, visual: visualStates.get(item.id) ?? emptyVisual, editing, hasError: errorNodeIds.has(item.id) }, selected: item.id === selectedNodeId,
  })) ?? [], [project?.guide.nodes, visualStates, editing, errorNodeIds, selectedNodeId]);
  const [nodes, setNodes, onNodesChange] = useNodesState<GuideFlowNode>(sourceNodes);
  useEffect(() => setNodes(sourceNodes), [setNodes, sourceNodes]);
  const edges = useMemo<Edge[]>(() => {
    if (!project) return [];
    const projectionsByFlowEdge = new Map(loadProjections.map((projection) => [projection.flowEdgeId, projection]));
    const actualEdges = project.guide.edges.flatMap<Edge>((edge) => {
      if (projectionsByFlowEdge.has(edge.id) || edge.kind === 'load_reference') return [];
    const chosen = session?.chosenEdgeIds.includes(edge.id) ?? false; const unselected = visualStates.get(edge.target)?.isUnselectedBranch ?? false;
      return [{ id: edge.id, source: edge.source, target: edge.target, label: edge.label,
      className: `flow-edge kind-${edge.kind} ${chosen ? 'chosen' : ''} ${unselected ? 'unselected' : ''}`,
        markerEnd: { type: MarkerType.ArrowClosed }, deletable: editing }];
    });
    const proxyEdges = loadProjections.flatMap<Edge>((projection) => {
      const chosen = session?.chosenEdgeIds.includes(projection.flowEdgeId) ?? false;
      const unselected = visualStates.get(projection.branchEntryNodeId)?.isUnselectedBranch ?? false;
      const className = `flow-edge kind-load_branch ${chosen ? 'chosen' : ''} ${unselected ? 'unselected' : ''}`;
      return [
        { id: projection.saveToLoadEdgeId, source: projection.saveNodeId, target: projection.loadNodeId, className, markerEnd: { type: MarkerType.ArrowClosed }, deletable: false },
        { id: projection.loadToBranchEdgeId, source: projection.loadNodeId, target: projection.branchEntryNodeId, className, markerEnd: { type: MarkerType.ArrowClosed }, deletable: false },
      ];
    });
    return [...actualEdges, ...proxyEdges];
  }, [project, loadProjections, session?.chosenEdgeIds, visualStates, editing]);
  const focusNode = useCallback((nodeId: string) => {
    const node = flow?.getNode(nodeId); if (!flow || !node) return;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    void flow.setCenter(node.position.x + (node.measured?.width ?? GUIDE_NODE_WIDTH) / 2, node.position.y + (node.measured?.height ?? GUIDE_NODE_HEIGHT) / 2, {
      zoom: 0.9,
      duration: reducedMotion ? 0 : 1000,
      interpolate: 'smooth',
      ease: (progress) => 1 - Math.pow(1 - progress, 3),
    });
  }, [flow]);
  useEffect(() => { if (selectedNodeId) focusNode(selectedNodeId); }, [focusNode, selectedNodeId]);
  useEffect(() => { if (focusNodeId && focusRequest > 0) focusNode(focusNodeId); }, [focusNode, focusNodeId, focusRequest]);
  const onDragStop: OnNodeDrag<GuideFlowNode> = useCallback((_event, node) => { if (editing && canvasInteractive) void savePosition(node.id, node.position); }, [editing, canvasInteractive, savePosition]);
  const relayout = async () => {
    if (!project || !confirm('重新自动布局会替换全部已保存坐标。确定继续吗？')) return;
    setLayouting(true);
    try { const positions = await layoutGuide(project.guide); await savePositions(positions); }
    catch (error) { alert(`自动布局失败，原坐标已保留：${error instanceof Error ? error.message : '未知错误'}`); } finally { setLayouting(false); }
  };
  const onNodeClick = (_event: React.MouseEvent, node: GuideFlowNode) => {
    if (!canvasInteractive) return;
    const loadTarget = node.data.guide.kind === 'load' ? project?.guide.edges.find((edge) => edge.source === node.id && edge.kind === 'load_reference')?.target : undefined;
    if (loadTarget) { const save = project?.guide.nodes.find((item) => item.id === loadTarget); selectNode(loadTarget, save?.source?.startLine); return; }
    selectNode(node.id, node.data.guide.source?.startLine);
  };
  const onConnect = useCallback((connection: Connection) => { if (editing && canvasInteractive && connection.source && connection.target) void addEdge(connection.source, connection.target, 'progress'); }, [editing, canvasInteractive, addEdge]);
  return <section className={`graph-view mode-${graphMode} ${canvasInteractive ? '' : 'canvas-locked'}`}>{editing && <div className="graph-toolbar"><span className="graph-edit-tools"><button aria-label="撤销图编辑" title="撤销图编辑 (Ctrl+Z)" onClick={() => void undoGuide()} disabled={guideHistory.length === 0}><Undo2 size={15}/></button><button aria-label="重做图编辑" title="重做图编辑 (Ctrl+Y)" onClick={() => void redoGuide()} disabled={guideFuture.length === 0}><Redo2 size={15}/></button><button title="创建节点" onClick={() => void createNode().then((id) => selectNode(id))}><Plus size={15}/>节点</button><button title="重新自动布局" onClick={() => void relayout()} disabled={layouting}><RotateCcw size={15}/>{layouting ? '布局中…' : '自动布局'}</button></span></div>}
    <ReactFlow<GuideFlowNode> nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onInit={setFlow} onNodeClick={onNodeClick} onNodeDragStop={onDragStop} onConnect={onConnect} onEdgesDelete={(deleted) => { if (editing && canvasInteractive) deleted.forEach((edge) => void removeEdge(edge.id)); }} nodesDraggable={editing && canvasInteractive} nodesConnectable={editing && canvasInteractive} elementsSelectable={canvasInteractive} fitView minZoom={0.15} maxZoom={2} onlyRenderVisibleElements><Background variant={BackgroundVariant.Dots} gap={22} size={1} color="rgba(148, 163, 184, 0.16)"/><Controls showInteractive={false}><ControlButton className="react-flow__controls-interactive" title={canvasInteractive ? '锁定节点交互（仍可平移和缩放）' : '解锁节点交互'} aria-label={canvasInteractive ? '锁定路线图节点交互' : '解锁路线图节点交互'} aria-pressed={!canvasInteractive} onClick={() => setCanvasInteractive((current) => !current)}>{canvasInteractive ? <Unlock/> : <Lock/>}</ControlButton></Controls><MiniMap<GuideFlowNode> pannable zoomable ariaLabel="路线图缩略导航" bgColor="#111827" maskColor="rgba(11, 15, 25, 0.68)" maskStrokeColor="#64748b" maskStrokeWidth={2} nodeBorderRadius={4} nodeStrokeColor="#94a3b8" nodeStrokeWidth={3} offsetScale={10} nodeColor={(node) => {
      const visual = node.data.visual;
      if (visual.isCurrent) return '#8b5cf6';
      if (visual.isAvailableNext) return '#06b6d4';
      if (visual.isVisited) return '#22c55e';
      if (visual.isUnselectedBranch) return '#334155';
      return '#64748b';
    }}/></ReactFlow>
  </section>;
}
