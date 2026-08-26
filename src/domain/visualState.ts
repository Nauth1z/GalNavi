import type { GuideDocument, PlaySession } from './model';
import { getOrderedFlowEdges } from './graphOrder';

export interface GuideNodeVisualState {
  isCurrent: boolean;
  isVisited: boolean;
  isOnChosenRoute: boolean;
  isAvailableNext: boolean;
  isUnselectedBranch: boolean;
}

export function deriveGuideNodeVisualStates(graph: GuideDocument, session?: PlaySession): Map<string, GuideNodeVisualState> {
  const currentId = session?.currentNodeId;
  const visited = new Set(session?.visitedNodeIds ?? []);
  const chosenEdges = new Set(session?.chosenEdgeIds ?? []);
  const chosenRoute = new Set<string>([...visited, ...(currentId ? [currentId] : [])]);
  for (const event of session?.history ?? []) {
    if (event.type === 'start') chosenRoute.add(event.nodeId);
    if (event.type === 'advance') { chosenRoute.add(event.fromNodeId); chosenRoute.add(event.toNodeId); }
    if (event.type === 'load') { chosenRoute.add(event.fromNodeId); chosenRoute.add(event.saveNodeId); }
    if (event.type === 'rollback' && event.toNodeId) chosenRoute.add(event.toNodeId);
  }

  const available = new Set(currentId ? getOrderedFlowEdges(graph, currentId).map((edge) => edge.target) : []);
  const unselected = new Set<string>();
  const queue: string[] = [];
  for (const node of graph.nodes) {
    const outgoing = getOrderedFlowEdges(graph, node.id);
    if (outgoing.length < 2 || !outgoing.some((edge) => chosenEdges.has(edge.id))) continue;
    for (const edge of outgoing) if (!chosenEdges.has(edge.id) && !chosenRoute.has(edge.target)) queue.push(edge.target);
  }
  while (queue.length) {
    const nodeId = queue.shift();
    if (!nodeId || unselected.has(nodeId) || chosenRoute.has(nodeId)) continue;
    unselected.add(nodeId);
    for (const edge of getOrderedFlowEdges(graph, nodeId)) queue.push(edge.target);
  }

  return new Map(graph.nodes.map((node) => [node.id, {
    isCurrent: node.id === currentId,
    isVisited: visited.has(node.id),
    isOnChosenRoute: chosenRoute.has(node.id),
    isAvailableNext: available.has(node.id),
    isUnselectedBranch: unselected.has(node.id),
  }]));
}
