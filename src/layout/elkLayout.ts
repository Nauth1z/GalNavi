import type { GuideDocument, GuideEdge, GuideNode } from '../domain/model';
import { compareNodesByPreferredOrder, isMainLayoutEdge } from '../domain/graphOrder';
import { projectLoadBranchesForLayout } from '../domain/loadProjection';

export type NodePosition = { x: number; y: number };
export const GUIDE_NODE_WIDTH = 190;
export const GUIDE_NODE_HEIGHT = 76;
export const GUIDE_NODE_DETAIL_HEIGHT = 98;

export function getGuideNodeHeight(node: GuideNode): number {
  return node.detail ? GUIDE_NODE_DETAIL_HEIGHT : GUIDE_NODE_HEIGHT;
}

export function getMainLayoutGraph(graph: GuideDocument): GuideDocument {
  const projected = projectLoadBranchesForLayout(graph);
  const nodes = [...projected.nodes].sort(compareNodesByPreferredOrder);
  const nodeOrder = new Map(nodes.map((node, index) => [node.id, index]));
  const edges = projected.edges.filter(isMainLayoutEdge).sort((left, right) => compareEdges(left, right, nodeOrder));
  return { nodes, edges };
}

export async function layoutGuide(graph: GuideDocument): Promise<Map<string, NodePosition>> {
  const { default: ELK } = await import('elkjs/lib/elk.bundled.js');
  const elk = new ELK();
  const ordered = getMainLayoutGraph(graph);
  const result = await elk.layout({
    id: 'root', layoutOptions: {
      'elk.algorithm': 'layered', 'elk.direction': 'DOWN', 'elk.spacing.nodeNode': '45', 'elk.layered.spacing.nodeNodeBetweenLayers': '85',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES', 'elk.layered.crossingMinimization.forceNodeModelOrder': 'true',
    },
    children: ordered.nodes.map((node) => ({ id: node.id, width: GUIDE_NODE_WIDTH, height: getGuideNodeHeight(node) })),
    edges: ordered.edges.map((edge) => ({ id: edge.id, sources: [edge.source], targets: [edge.target] })),
  });
  const positions = new Map((result.children ?? []).map((node) => [node.id, { x: node.x ?? 0, y: node.y ?? 0 }]));
  enforceSiblingSourceOrder(ordered, positions);
  return positions;
}

export function applyPositions(graph: GuideDocument, positions: Map<string, NodePosition>): GuideDocument {
  return { ...graph, nodes: graph.nodes.map((node) => {
    const position = positions.get(node.id); return position ? { ...node, position } : node;
  }) };
}

function compareEdges(left: GuideEdge, right: GuideEdge, nodeOrder: Map<string, number>): number {
  return (nodeOrder.get(left.source) ?? Number.MAX_SAFE_INTEGER) - (nodeOrder.get(right.source) ?? Number.MAX_SAFE_INTEGER)
    || (nodeOrder.get(left.target) ?? Number.MAX_SAFE_INTEGER) - (nodeOrder.get(right.target) ?? Number.MAX_SAFE_INTEGER)
    || left.id.localeCompare(right.id);
}

function enforceSiblingSourceOrder(graph: GuideDocument, positions: Map<string, NodePosition>): void {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  for (const source of graph.nodes) {
    const targets = graph.edges.filter((edge) => edge.source === source.id).map((edge) => nodes.get(edge.target))
      .filter((node): node is GuideNode => Boolean(node)).sort(compareNodesByPreferredOrder);
    if (targets.length < 2) continue;
    const xSlots = targets.map((node) => positions.get(node.id)?.x).filter((x): x is number => x !== undefined).sort((a, b) => a - b);
    if (xSlots.length !== targets.length) continue;
    targets.forEach((node, index) => { const position = positions.get(node.id); if (position) positions.set(node.id, { ...position, x: xSlots[index]! }); });
  }
}
