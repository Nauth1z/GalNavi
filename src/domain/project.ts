import type { GalNaviProject, GuideDocument, GuideEdge, GuideNode } from './model';
import { CURRENT_SCHEMA_VERSION, stableId } from './model';
import { createSession, startProgress } from './progress';

export function createProject(title: string, rawText: string, guide: GuideDocument, now = Date.now()): GalNaviProject {
  const id = stableId('project', `${title}:${now}:${cryptoRandom()}`);
  const scopedGuide = namespaceGuide(guide, id);
  const session = createSession('第一周目', now);
  const root = scopedGuide.nodes.find((node) => node.kind === 'root') ?? scopedGuide.nodes[0];
  const started = root ? startProgress(session, root.id, scopedGuide, now) : session;
  return { schemaVersion: CURRENT_SCHEMA_VERSION, id, title, source: { rawText, format: 'plain_text' }, guide: scopedGuide, sessions: [started], activeSessionId: started.id, createdAt: now, updatedAt: now };
}

export function namespacedNodeId(projectId: string, node: Pick<GuideNode, 'id' | 'kind'>): string {
  return stableId(node.kind, `${projectId}:${node.id}`);
}

export function namespaceGuide(guide: GuideDocument, projectId: string): GuideDocument {
  const idMap = new Map(guide.nodes.map((node) => [node.id, namespacedNodeId(projectId, node)]));
  return {
    nodes: guide.nodes.map((node) => ({ ...node, id: idMap.get(node.id)! })),
    edges: guide.edges.map((edge) => ({ ...edge, id: stableId('edge', `${projectId}:${edge.id}`), source: idMap.get(edge.source) ?? edge.source, target: idMap.get(edge.target) ?? edge.target })),
  };
}

export function mergeUserEdits(previous: GuideDocument, parsed: GuideDocument, preserveNodeIds: Iterable<string> = []): GuideDocument {
  const previousById = new Map(previous.nodes.map((node) => [node.id, node]));
  const preserved = new Set(preserveNodeIds);
  const edited = new Map(previous.nodes.filter((node) => node.userEdited).map((node) => [node.id, node]));
  const nodes = parsed.nodes.map((node) => {
    const old = previousById.get(node.id);
    return edited.get(node.id) ?? (old?.position ? { ...node, position: old.position } : node);
  });
  for (const node of edited.values()) if (!nodes.some((candidate) => candidate.id === node.id)) nodes.push(node);
  for (const nodeId of preserved) {
    const node = previousById.get(nodeId);
    if (node && !nodes.some((candidate) => candidate.id === node.id)) nodes.push(node);
  }
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = parsed.edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));
  for (const edge of previous.edges) if (nodeIds.has(edge.source) && nodeIds.has(edge.target) && !edges.some((candidate) => candidate.id === edge.id)) edges.push(edge);
  return { nodes, edges };
}

export function updateNode(graph: GuideDocument, nodeId: string, changes: Partial<Omit<GuideNode, 'id'>>): GuideDocument {
  return { ...graph, nodes: graph.nodes.map((node) => node.id === nodeId ? { ...node, ...changes, userEdited: true } : node) };
}
export function deleteNode(graph: GuideDocument, nodeId: string): GuideDocument {
  return { nodes: graph.nodes.filter((node) => node.id !== nodeId), edges: graph.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId) };
}
export function upsertEdge(graph: GuideDocument, edge: GuideEdge): GuideDocument {
  return { ...graph, edges: [...graph.edges.filter((item) => item.id !== edge.id), edge] };
}
const cryptoRandom = () => globalThis.crypto?.randomUUID?.() ?? `${Math.random()}`;
