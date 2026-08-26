import type { GuideDocument, PlaySession, ProgressEvent } from './model';
import { stableId, unique } from './model';
import { getOrderedFlowEdges } from './graphOrder';

export type AdvanceResult =
  | { status: 'advanced' | 'finished'; session: PlaySession }
  | { status: 'branch_required'; session: PlaySession; edgeIds: string[] };

const nowId = (type: string, now: number) => stableId(type, `${now}:${Math.random()}`);

export function createSession(name = '第一周目', now = Date.now()): PlaySession {
  return { id: stableId('session', `${name}:${now}`), name, visitedNodeIds: [], chosenEdgeIds: [], completedEndingNodeIds: [], history: [], createdAt: now, updatedAt: now };
}

export function startProgress(session: PlaySession, nodeId: string, graph: GuideDocument, now = Date.now()): PlaySession {
  if (!graph.nodes.some((node) => node.id === nodeId)) throw new Error('起始节点不存在');
  const event: ProgressEvent = { id: nowId('event', now), type: 'start', nodeId, timestamp: now };
  return { ...session, currentNodeId: nodeId, history: [...session.history, event], updatedAt: now };
}

export function advanceProgress(session: PlaySession, graph: GuideDocument, selectedEdgeId?: string, now = Date.now()): AdvanceResult {
  const current = graph.nodes.find((node) => node.id === session.currentNodeId);
  if (!current) throw new Error('当前进度节点不存在');
  const outgoing = getOrderedFlowEdges(graph, current.id);
  if (outgoing.length === 0) {
    return { status: 'finished', session: visit(session, current.id, current.kind === 'ending', now) };
  }
  if (outgoing.length > 1 && !selectedEdgeId) {
    return { status: 'branch_required', session, edgeIds: outgoing.map((edge) => edge.id) };
  }
  const edge = selectedEdgeId ? outgoing.find((candidate) => candidate.id === selectedEdgeId) : outgoing[0];
  if (!edge) throw new Error('所选分支不属于当前节点');
  const target = graph.nodes.find((node) => node.id === edge.target);
  if (!target) throw new Error('目标节点不存在');
  const base = visit(session, current.id, false, now);
  const event: ProgressEvent = { id: nowId('event', now), type: 'advance', fromNodeId: current.id, toNodeId: target.id, edgeId: edge.id, timestamp: now };
  const next = {
    ...base,
    currentNodeId: target.id,
    chosenEdgeIds: unique([...base.chosenEdgeIds, edge.id]),
    completedEndingNodeIds: target.kind === 'ending' ? unique([...base.completedEndingNodeIds, target.id]) : base.completedEndingNodeIds,
    history: [...base.history, event], updatedAt: now,
  };
  return { status: 'advanced', session: next };
}

export function loadProgress(session: PlaySession, graph: GuideDocument, now = Date.now()): PlaySession {
  const current = graph.nodes.find((node) => node.id === session.currentNodeId);
  if (!current || current.kind !== 'load') throw new Error('当前节点不是读档节点');
  const refs = graph.edges.filter((edge) => edge.source === current.id && edge.kind === 'load_reference');
  if (refs.length !== 1) throw new Error('读档节点没有唯一存档目标');
  const saveNode = graph.nodes.find((node) => node.id === refs[0]?.target && node.kind === 'save');
  if (!saveNode) throw new Error('读档引用的存档节点不存在');
  const event: ProgressEvent = { id: nowId('event', now), type: 'load', fromNodeId: current.id, saveNodeId: saveNode.id, timestamp: now };
  return { ...visit(session, current.id, false, now), currentNodeId: saveNode.id, history: [...session.history, event], updatedAt: now };
}

export function rollbackProgress(session: PlaySession, graph: GuideDocument, now = Date.now()): PlaySession {
  const actionable = [...session.history].reverse().find((event) => event.type !== 'rollback');
  if (!actionable) return session;
  const remaining = session.history.slice(0, session.history.lastIndexOf(actionable));
  const replayed = replayHistory({ ...session, history: remaining }, graph);
  const toNodeId = replayed.currentNodeId ?? '';
  const rollback: ProgressEvent = { id: nowId('event', now), type: 'rollback', toNodeId, timestamp: now };
  return { ...replayed, history: [...remaining, rollback], updatedAt: now };
}

export function replayHistory(session: PlaySession, graph: GuideDocument): PlaySession {
  let currentNodeId: string | undefined;
  const visited: string[] = [];
  const chosen: string[] = [];
  const endings: string[] = [];
  for (const event of session.history) {
    if (event.type === 'start') currentNodeId = event.nodeId;
    if (event.type === 'advance') {
      visited.push(event.fromNodeId); chosen.push(event.edgeId); currentNodeId = event.toNodeId;
      if (graph.nodes.find((node) => node.id === event.toNodeId)?.kind === 'ending') endings.push(event.toNodeId);
    }
    if (event.type === 'load') { visited.push(event.fromNodeId); currentNodeId = event.saveNodeId; }
    if (event.type === 'rollback') currentNodeId = event.toNodeId || undefined;
  }
  return { ...session, currentNodeId, visitedNodeIds: unique(visited), chosenEdgeIds: unique(chosen), completedEndingNodeIds: unique(endings) };
}

function visit(session: PlaySession, nodeId: string, ending: boolean, now: number): PlaySession {
  return { ...session, visitedNodeIds: unique([...session.visitedNodeIds, nodeId]), completedEndingNodeIds: ending ? unique([...session.completedEndingNodeIds, nodeId]) : session.completedEndingNodeIds, updatedAt: now };
}
