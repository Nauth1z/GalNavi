import type { GuideDocument, ParserDiagnostic } from './model';
import { stableId } from './model';
import { deriveLoadBranchProjections } from './loadProjection';
import { isPlayableFlowEdge } from './graphOrder';

const diagnostic = (code: string, message: string, severity: ParserDiagnostic['severity'], relatedNodeIds?: string[]): ParserDiagnostic => ({
  id: stableId('diag', `${code}:${message}:${relatedNodeIds?.join(',') ?? ''}`), code, message, severity, relatedNodeIds,
});

export function validateGraph(graph: GuideDocument): ParserDiagnostic[] {
  const result: ParserDiagnostic[] = [];
  const ids = new Set(graph.nodes.map((node) => node.id));
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const validFlow = graph.edges.filter((edge) => isPlayableFlowEdge(edge) && ids.has(edge.source) && ids.has(edge.target));
  const projectedLoadIds = new Set(deriveLoadBranchProjections(graph).map((projection) => projection.loadNodeId));
  for (const edge of graph.edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) result.push(diagnostic('INVALID_EDGE_REFERENCE', `连接 ${edge.id} 引用了不存在的节点`, 'error'));
  }
  const incident = new Set(graph.edges.flatMap((edge) => [edge.source, edge.target]));
  for (const node of graph.nodes) {
    if (node.kind === 'load') {
      const references = graph.edges.filter((edge) => edge.source === node.id && edge.kind === 'load_reference');
      const candidates = node.saveSlot ? graph.nodes.filter((candidate) => candidate.kind === 'save' && candidate.saveSlot === node.saveSlot) : [];
      if (references.length === 0) {
        if (candidates.length > 1) result.push({ ...diagnostic('AMBIGUOUS_LOAD', `“${node.label}”对应多个存档候选`, 'warning', [node.id, ...candidates.map((candidate) => candidate.id)]), sourceRange: node.source });
        else result.push({ ...diagnostic('UNMATCHED_LOAD', `无法为“${node.label}”找到对应存档`, 'error', [node.id]), sourceRange: node.source });
      } else if (references.length > 1) {
        const targets = references.map((edge) => edge.target).filter((id, index, items) => ids.has(id) && items.indexOf(id) === index);
        result.push({ ...diagnostic('AMBIGUOUS_LOAD', `“${node.label}”存在多个读档引用`, 'warning', [node.id, ...targets]), sourceRange: node.source });
      } else {
        const reference = references[0]!;
        const target = nodesById.get(reference.target);
        const slotsMatch = !node.saveSlot || node.saveSlot === target?.saveSlot;
        if (target?.kind !== 'save' || !slotsMatch) {
          result.push({ ...diagnostic('INVALID_LOAD_REFERENCE', `“${node.label}”没有指向同槽位的有效 SAVE`, 'error', [node.id, reference.target]), sourceRange: node.source });
        } else if (!projectedLoadIds.has(node.id)) {
          result.push({ ...diagnostic('LOAD_BRANCH_NOT_FOUND', `“${node.label}”之后没有可显示的读档分支`, 'warning', [node.id, target.id]), sourceRange: node.source });
        }
      }
      continue;
    }
    if (node.kind !== 'root' && !incident.has(node.id)) result.push(diagnostic('ISOLATED_NODE', `“${node.label}”是孤立节点`, 'warning', [node.id]));
    if (node.kind !== 'root' && !validFlow.some((edge) => edge.target === node.id)) result.push(diagnostic('NO_ENTRY', `“${node.label}”没有流程入口`, 'warning', [node.id]));
    if (node.kind === 'ending' && validFlow.some((edge) => edge.source === node.id)) result.push(diagnostic('ENDING_HAS_OUTGOING', `结局“${node.label}”仍有流程出边`, 'error', [node.id]));
    if (node.kind === 'choice_group' && validFlow.filter((edge) => edge.source === node.id && edge.kind === 'choice').length < 2) result.push(diagnostic('INCOMPLETE_CHOICE_GROUP', `选择组“${node.label}”不足两个分支`, 'warning', [node.id]));
    if (node.parseConfidence < 0.6) result.push({ ...diagnostic('LOW_CONFIDENCE', `“${node.label}”的解析置信度较低`, 'warning', [node.id]), sourceRange: node.source });
  }
  const colors = new Map<string, 0 | 1 | 2>();
  const outgoing = new Map<string, string[]>();
  for (const edge of validFlow) outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target]);
  const visit = (id: string): boolean => {
    if (colors.get(id) === 1) return true;
    if (colors.get(id) === 2) return false;
    colors.set(id, 1);
    for (const target of outgoing.get(id) ?? []) if (visit(target)) return true;
    colors.set(id, 2); return false;
  };
  if (graph.nodes.some((node) => visit(node.id))) result.push(diagnostic('FLOW_CYCLE', '普通流程边中存在环', 'error'));
  return dedupe(result);
}

function dedupe(items: ParserDiagnostic[]): ParserDiagnostic[] {
  const seen = new Set<string>();
  return items.filter((item) => !seen.has(item.id) && Boolean(seen.add(item.id)));
}
