import { create } from 'zustand';
import type { GalNaviProject, GuideDocument, GuideEdge, GuideNode, ParserDiagnostic } from '../domain/model';
import { stableId } from '../domain/model';
import { deleteNode, mergeUserEdits, namespacedNodeId, namespaceGuide, updateNode, upsertEdge } from '../domain/project';
import { advanceProgress, rollbackProgress, startProgress } from '../domain/progress';
import { validateGraph } from '../domain/validation';
import { parseGuide } from '../parser';
import { projectRepository } from '../storage/repository';
import { useProjectListStore } from './projectListStore';
import { useUiStore } from './uiStore';

interface WorkspaceState {
  project?: GalNaviProject;
  diagnostics: ParserDiagnostic[];
  ignoredDiagnosticIds: string[];
  pendingBranchEdgeIds: string[];
  saving: boolean;
  saveError?: string;
  guideHistory: GuideDocument[];
  guideFuture: GuideDocument[];
  open: (project: GalNaviProject, diagnostics?: ParserDiagnostic[]) => void;
  close: () => void;
  commit: (project: GalNaviProject, diagnostics?: ParserDiagnostic[]) => Promise<void>;
  commitGuide: (guide: GuideDocument, diagnostics?: ParserDiagnostic[]) => Promise<void>;
  undoGuide: () => Promise<void>;
  redoGuide: () => Promise<void>;
  reparse: () => Promise<void>;
  ignoreDiagnostic: (id: string) => void;
  rename: (title: string) => Promise<void>;
  editNode: (id: string, changes: Partial<Omit<GuideNode, 'id'>>) => Promise<void>;
  removeNode: (id: string) => Promise<void>;
  createNode: (kind?: GuideNode['kind']) => Promise<string | undefined>;
  splitNode: (id: string) => Promise<void>;
  mergeNext: (id: string) => Promise<void>;
  savePosition: (id: string, position: { x: number; y: number }) => Promise<void>;
  savePositions: (positions: Map<string, { x: number; y: number }>) => Promise<void>;
  setLoadTarget: (loadId: string, saveId?: string) => Promise<void>;
  addEdge: (source: string, target: string, kind: GuideEdge['kind']) => Promise<void>;
  editEdge: (id: string, kind: GuideEdge['kind']) => Promise<void>;
  removeEdge: (id: string) => Promise<void>;
  dismissBranch: () => void;
  advance: (edgeId?: string) => Promise<void>;
  rollback: () => Promise<void>;
  setCurrent: (nodeId: string) => Promise<void>;
}

const activeSession = (project: GalNaviProject) => project.sessions.find((item) => item.id === project.activeSessionId) ?? project.sessions[0];
const replaceSession = (project: GalNaviProject, session: NonNullable<ReturnType<typeof activeSession>>): GalNaviProject => ({ ...project, sessions: project.sessions.map((item) => item.id === session.id ? session : item), activeSessionId: session.id, updatedAt: Date.now() });

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  diagnostics: [], ignoredDiagnosticIds: [], pendingBranchEdgeIds: [], saving: false, guideHistory: [], guideFuture: [],
  open: (project, diagnostics = validateGraph(project.guide)) => set({ project, diagnostics, ignoredDiagnosticIds: [], pendingBranchEdgeIds: [], saving: false, saveError: undefined, guideHistory: [], guideFuture: [] }),
  close: () => set({ project: undefined, diagnostics: [], ignoredDiagnosticIds: [], pendingBranchEdgeIds: [], saving: false, saveError: undefined, guideHistory: [], guideFuture: [] }),
  commit: async (project, diagnostics = validateGraph(project.guide)) => {
    const updated = { ...project, updatedAt: Date.now() };
    set({ project: updated, diagnostics, saving: true, saveError: undefined });
    try { await projectRepository.save(updated); useProjectListStore.getState().replaceSummary(updated); }
    catch (error) {
      const message = error instanceof Error ? error.message : '未知存储错误';
      set({ saveError: message }); useUiStore.getState().setError(`自动保存失败：${message}`);
    } finally { set({ saving: false }); }
  },
  commitGuide: async (guide, diagnostics = validateGraph(guide)) => {
    const project = get().project; if (!project || guide === project.guide) return;
    set((state) => ({ guideHistory: [...state.guideHistory.slice(-99), project.guide], guideFuture: [] }));
    await get().commit({ ...project, guide }, diagnostics);
  },
  undoGuide: async () => {
    const project = get().project; const history = get().guideHistory; const previous = history.at(-1); if (!project || !previous) return;
    set((state) => ({ guideHistory: state.guideHistory.slice(0, -1), guideFuture: [...state.guideFuture.slice(-99), project.guide] }));
    await get().commit({ ...project, guide: previous });
  },
  redoGuide: async () => {
    const project = get().project; const future = get().guideFuture; const next = future.at(-1); if (!project || !next) return;
    set((state) => ({ guideHistory: [...state.guideHistory.slice(-99), project.guide], guideFuture: state.guideFuture.slice(0, -1) }));
    await get().commit({ ...project, guide: next });
  },
  reparse: async () => {
    const project = get().project; if (!project) return;
    set({ ignoredDiagnosticIds: [] });
    const parsed = parseGuide(project.source.rawText);
    const parsedIdMap = new Map(parsed.graph.nodes.map((node) => [node.id, namespacedNodeId(project.id, node)]));
    const reparsedGuide = namespaceGuide(parsed.graph, project.id);
    const progressNodeIds = project.sessions.flatMap((session) => [session.currentNodeId, ...session.visitedNodeIds, ...session.completedEndingNodeIds,
      ...session.history.flatMap((event) => event.type === 'start' ? [event.nodeId] : event.type === 'advance' ? [event.fromNodeId, event.toNodeId] : event.type === 'load' ? [event.fromNodeId, event.saveNodeId] : [event.toNodeId])]).filter((id): id is string => Boolean(id));
    const merged = mergeUserEdits(project.guide, reparsedGuide, progressNodeIds);
    const remappedParserDiagnostics = parsed.diagnostics.map((item) => ({ ...item, relatedNodeIds: item.relatedNodeIds?.map((id) => parsedIdMap.get(id) ?? id) }));
    const diagnostics = [...remappedParserDiagnostics, ...validateGraph(merged)].filter((item, index, items) => items.findIndex((candidate) => candidate.id === item.id) === index);
    await get().commitGuide(merged, diagnostics);
  },
  ignoreDiagnostic: (id) => {
    const diagnostic = get().diagnostics.find((item) => item.id === id);
    if (diagnostic?.severity === 'warning') set((state) => ({ ignoredDiagnosticIds: [...new Set([...state.ignoredDiagnosticIds, id])] }));
  },
  rename: async (title) => { const project = get().project; if (project && title.trim()) await get().commit({ ...project, title: title.trim() }); },
  editNode: async (id, changes) => { const project = get().project; if (project) await get().commitGuide(updateNode(project.guide, id, changes)); },
  removeNode: async (id) => { const project = get().project; if (project) await get().commitGuide(deleteNode(project.guide, id)); },
  createNode: async (kind = 'step') => {
    const project = get().project; if (!project) return undefined;
    const id = stableId('manual', `${project.id}:${Date.now()}:${Math.random()}`);
    const node: GuideNode = { id, kind, label: '新建节点', parseConfidence: 1, parseWarnings: [], userEdited: true, position: { x: 120, y: 120 } };
    await get().commitGuide({ ...project.guide, nodes: [...project.guide.nodes, node] }); return id;
  },
  splitNode: async (id) => {
    const project = get().project; const original = project?.guide.nodes.find((node) => node.id === id); if (!project || !original || original.label.length < 2) return;
    const at = Math.ceil(original.label.length / 2); const secondId = stableId('manual', `${project.id}:${id}:split:${Date.now()}`);
    const first = { ...original, label: original.label.slice(0, at).trim(), userEdited: true };
    const second: GuideNode = { ...original, id: secondId, label: original.label.slice(at).trim() || '拆分节点', userEdited: true, position: original.position ? { x: original.position.x, y: original.position.y + 140 } : undefined };
    const outgoing = project.guide.edges.filter((edge) => edge.source === id);
    const retained = project.guide.edges.filter((edge) => edge.source !== id);
    const bridge: GuideEdge = { id: stableId('edge', `${id}:${secondId}:progress`), source: id, target: secondId, kind: 'progress' };
    await get().commitGuide({ nodes: project.guide.nodes.map((node) => node.id === id ? first : node).concat(second), edges: [...retained, bridge, ...outgoing.map((edge) => ({ ...edge, source: secondId, id: stableId('edge', `${secondId}:${edge.target}:${edge.kind}`) }))] });
  },
  mergeNext: async (id) => {
    const project = get().project; if (!project) return;
    const link = project.guide.edges.find((edge) => edge.source === id && edge.kind === 'progress');
    const first = project.guide.nodes.find((node) => node.id === id); const second = link && project.guide.nodes.find((node) => node.id === link.target);
    if (!link || !first || !second) return;
    const merged: GuideNode = { ...first, label: `${first.label} / ${second.label}`, detail: [first.detail, second.detail].filter(Boolean).join('\n'), source: first.source && second.source ? { startLine: Math.min(first.source.startLine, second.source.startLine), endLine: Math.max(first.source.endLine, second.source.endLine) } : first.source ?? second.source, userEdited: true };
    const edges = project.guide.edges.filter((edge) => edge.id !== link.id && edge.source !== second.id && edge.target !== second.id);
    for (const edge of project.guide.edges.filter((item) => item.source === second.id)) edges.push({ ...edge, source: id, id: stableId('edge', `${id}:${edge.target}:${edge.kind}`) });
    await get().commitGuide({ nodes: project.guide.nodes.filter((node) => node.id !== second.id).map((node) => node.id === id ? merged : node), edges });
  },
  savePosition: async (id, position) => {
    const project = get().project; if (!project) return;
    await get().commitGuide({ ...project.guide, nodes: project.guide.nodes.map((node) => node.id === id ? { ...node, position } : node) });
  },
  savePositions: async (positions) => {
    const project = get().project; if (!project) return;
    await get().commitGuide({ ...project.guide, nodes: project.guide.nodes.map((node) => positions.has(node.id) ? { ...node, position: positions.get(node.id) } : node) });
  },
  setLoadTarget: async (loadId, saveId) => {
    const project = get().project; if (!project) return;
    const edges = project.guide.edges.filter((edge) => !(edge.source === loadId && edge.kind === 'load_reference'));
    if (saveId) edges.push({ id: stableId('edge', `${loadId}:${saveId}:load_reference`), source: loadId, target: saveId, kind: 'load_reference' });
    await get().commitGuide({ ...project.guide, edges });
  },
  addEdge: async (source, target, kind) => { const project = get().project; if (project) await get().commitGuide(upsertEdge(project.guide, { id: stableId('edge', `${source}:${target}:${kind}`), source, target, kind })); },
  editEdge: async (id, kind) => { const project = get().project; const edge = project?.guide.edges.find((item) => item.id === id); if (project && edge) await get().commitGuide(upsertEdge(project.guide, { ...edge, kind })); },
  removeEdge: async (id) => { const project = get().project; if (project) await get().commitGuide({ ...project.guide, edges: project.guide.edges.filter((edge) => edge.id !== id) }); },
  dismissBranch: () => set({ pendingBranchEdgeIds: [] }),
  advance: async (edgeId) => {
    const project = get().project; const session = project && activeSession(project); if (!project || !session) return;
    try {
      const result = advanceProgress(session, project.guide, edgeId);
      if (result.status === 'branch_required') set({ pendingBranchEdgeIds: result.edgeIds });
      else {
        set({ pendingBranchEdgeIds: [] }); await get().commit(replaceSession(project, result.session));
        const current = project.guide.nodes.find((node) => node.id === result.session.currentNodeId);
        useUiStore.getState().selectNode(current?.id, current?.source?.startLine);
      }
    } catch (error) { throw new Error(error instanceof Error ? error.message : '进度更新失败'); }
  },
  rollback: async () => {
    const project = get().project; const session = project && activeSession(project); if (!project || !session) return;
    const rolledBack = rollbackProgress(session, project.guide); await get().commit(replaceSession(project, rolledBack));
    const current = project.guide.nodes.find((node) => node.id === rolledBack.currentNodeId);
    useUiStore.getState().selectNode(current?.id, current?.source?.startLine);
  },
  setCurrent: async (nodeId) => {
    const project = get().project; const session = project && activeSession(project); const node = project?.guide.nodes.find((candidate) => candidate.id === nodeId);
    if (project && session && node) { await get().commit(replaceSession(project, startProgress(session, nodeId, project.guide))); useUiStore.getState().selectNode(node.id, node.source?.startLine); }
  },
}));
