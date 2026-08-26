import type { GuideDocument, GuideEdge, GuideNode } from './model';

export const MAIN_LAYOUT_EDGE_KINDS = ['progress', 'choice', 'unlock'] as const;
const mainLayoutKinds = new Set<string>(MAIN_LAYOUT_EDGE_KINDS);

export function compareNodesBySourceOrder(left: GuideNode, right: GuideNode): number {
  const leftLine = left.source?.startLine ?? Number.MAX_SAFE_INTEGER;
  const rightLine = right.source?.startLine ?? Number.MAX_SAFE_INTEGER;
  if (leftLine !== rightLine) return leftLine - rightLine;
  const leftEnd = left.source?.endLine ?? Number.MAX_SAFE_INTEGER;
  const rightEnd = right.source?.endLine ?? Number.MAX_SAFE_INTEGER;
  if (leftEnd !== rightEnd) return leftEnd - rightEnd;
  return left.id.localeCompare(right.id);
}

export function compareNodesByPreferredOrder(left: GuideNode, right: GuideNode): number {
  if (left.position && right.position && left.position.x !== right.position.x) return left.position.x - right.position.x;
  return compareNodesBySourceOrder(left, right);
}

export function isMainLayoutEdge(edge: GuideEdge): boolean {
  return mainLayoutKinds.has(edge.kind);
}

export function isPlayableFlowEdge(edge: GuideEdge): boolean {
  return isMainLayoutEdge(edge);
}

export function getOrderedFlowEdges(graph: GuideDocument, sourceId: string): GuideEdge[] {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  return graph.edges
    .filter((edge) => edge.source === sourceId && isPlayableFlowEdge(edge))
    .sort((left, right) => {
      const leftTarget = nodes.get(left.target);
      const rightTarget = nodes.get(right.target);
      if (leftTarget && rightTarget) {
        const nodeOrder = compareNodesByPreferredOrder(leftTarget, rightTarget);
        if (nodeOrder !== 0) return nodeOrder;
      } else if (leftTarget) return -1;
      else if (rightTarget) return 1;
      const labelOrder = (left.label ?? '').localeCompare(right.label ?? '');
      return labelOrder || left.id.localeCompare(right.id);
    });
}
