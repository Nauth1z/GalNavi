import type { GuideDocument, GuideEdge, GuideNode } from './model';
import { compareNodesBySourceOrder, isMainLayoutEdge } from './graphOrder';

export interface LoadBranchProjection {
  loadNodeId: string;
  saveNodeId: string;
  branchEntryNodeId: string;
  flowEdgeId: string;
  saveToLoadEdgeId: string;
  loadToBranchEdgeId: string;
}

/**
 * Builds a view/layout-only LOAD path. The returned identifiers never enter the
 * persisted GuideDocument: progress continues to use the original SAVE → entry
 * edge and LOAD keeps its real load_reference edge.
 */
export function deriveLoadBranchProjections(graph: GuideDocument): LoadBranchProjection[] {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const usedFlowEdges = new Set<string>();
  // Walk backwards so that when the same save/branch is mentioned more than
  // once, the LOAD closest to the branch entry owns the visual path.
  const loadNodes = graph.nodes.filter((node) => node.kind === 'load').sort((left, right) => compareNodesBySourceOrder(right, left));
  const projections: LoadBranchProjection[] = [];

  for (const load of loadNodes) {
    const reference = graph.edges.find((edge) => edge.source === load.id && edge.kind === 'load_reference');
    if (!reference) continue;
    const candidate = graph.edges
      .filter((edge) => edge.source === reference.target && isMainLayoutEdge(edge) && !usedFlowEdges.has(edge.id))
      .map((edge) => ({ edge, target: nodes.get(edge.target) }))
      .filter((item): item is { edge: GuideEdge; target: GuideNode } => item.target !== undefined && isAfterLoad(item.target, load))
      .sort((left, right) => compareNodesBySourceOrder(left.target, right.target) || left.edge.id.localeCompare(right.edge.id))[0];
    if (!candidate) continue;
    usedFlowEdges.add(candidate.edge.id);
    projections.push({
      loadNodeId: load.id,
      saveNodeId: reference.target,
      branchEntryNodeId: candidate.edge.target,
      flowEdgeId: candidate.edge.id,
      saveToLoadEdgeId: `load-proxy-in:${load.id}`,
      loadToBranchEdgeId: `load-proxy-out:${load.id}`,
    });
  }
  return projections.sort((left, right) => compareNodesBySourceOrder(nodes.get(left.loadNodeId)!, nodes.get(right.loadNodeId)!));
}

export function projectLoadBranchesForLayout(graph: GuideDocument): GuideDocument {
  const projections = deriveLoadBranchProjections(graph);
  const replacedEdgeIds = new Set(projections.map((projection) => projection.flowEdgeId));
  const proxyEdges: GuideEdge[] = projections.flatMap((projection) => [
    { id: projection.saveToLoadEdgeId, source: projection.saveNodeId, target: projection.loadNodeId, kind: 'progress' },
    { id: projection.loadToBranchEdgeId, source: projection.loadNodeId, target: projection.branchEntryNodeId, kind: 'progress' },
  ]);
  return { ...graph, edges: [...graph.edges.filter((edge) => !replacedEdgeIds.has(edge.id)), ...proxyEdges] };
}

function isAfterLoad(node: GuideNode, load: GuideNode): boolean {
  const nodeLine = node.source?.startLine ?? Number.MAX_SAFE_INTEGER;
  const loadLine = load.source?.endLine ?? Number.MIN_SAFE_INTEGER;
  return nodeLine > loadLine;
}
