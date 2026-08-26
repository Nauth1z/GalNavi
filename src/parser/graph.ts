import type { GuideDocument, GuideEdge, GuideNode, ParserDiagnostic } from '../domain/model';
import { stableId } from '../domain/model';
import { getPlaythroughLabel, isDisplayOnlyHeading, tokenKindToNodeKind } from './tokenize';
import type { InferredBlock } from './types';

export function buildGraph(blocks: InferredBlock[]): GuideDocument {
  const root: GuideNode = { id: 'root', kind: 'root', label: '开始', parseConfidence: 1, parseWarnings: [], userEdited: false };
  const nodes: GuideNode[] = [root];
  const edges: GuideEdge[] = [];
  let frontier = [root.id];
  const savesBySlot = new Map<string, string[]>();
  let pendingDisplayDetails: string[] = [];
  let collapsiblePlaythrough: { node: GuideNode; prompts: string[] } | undefined;
  for (const block of blocks) {
    if (block.kind === 'choice_group') {
      collapsiblePlaythrough = undefined;
      // A new explicit choice block is a safe parsing boundary. When several
      // prior routes are still open, attaching them to one group would invent
      // a route convergence, while cloning the group would grow exponentially.
      const parentId = frontier.length === 1 ? frontier[0]! : root.id;
      const group = toChoiceGroup(block, parentId, 0);
      nodes.push(group);
      edges.push(makeEdge(parentId, group.id, frontier.length === 1 ? 'progress' : 'unlock'));
      const choices = block.tokens.map((token, choiceIndex) => toNode(token, group.id, choiceIndex));
      nodes.push(...choices);
      for (const choice of choices) edges.push(makeEdge(group.id, choice.id, 'choice', choice.label));
      frontier = choices.map((choice) => choice.id);
      continue;
    }
    const token = block.tokens[0];
    if (!token) continue;
    if (token.kind === 'heading' && isDisplayOnlyHeading(token.text)) {
      collapsiblePlaythrough = undefined;
      pendingDisplayDetails.push(token.raw.trim());
      continue;
    }
    const playthroughLabel = token.kind === 'heading' || token.kind === 'instruction' ? getPlaythroughLabel(token.text) : undefined;
    if (playthroughLabel) {
      const prompt = token.raw.trim();
      if (collapsiblePlaythrough && collapsiblePlaythrough.prompts.length < 5) {
        collapsiblePlaythrough.prompts.push(prompt);
        collapsiblePlaythrough.node.label = '下一周目';
        collapsiblePlaythrough.node.detail = collapsiblePlaythrough.prompts.join('\n');
        collapsiblePlaythrough.node.source = { startLine: collapsiblePlaythrough.node.source?.startLine ?? token.source.startLine, endLine: token.source.endLine };
        frontier = [collapsiblePlaythrough.node.id];
        continue;
      }
      const playthrough: GuideNode = {
        id: stableId('section', `playthrough:${root.id}:${token.id}`), kind: 'section', label: playthroughLabel,
        detail: token.text === playthroughLabel ? undefined : prompt, source: token.source,
        parseConfidence: token.confidence, parseWarnings: [], userEdited: false,
      };
      applyPendingDetails([playthrough], pendingDisplayDetails);
      pendingDisplayDetails = [];
      nodes.push(playthrough); edges.push(makeEdge(root.id, playthrough.id, 'unlock')); frontier = [playthrough.id];
      collapsiblePlaythrough = { node: playthrough, prompts: [prompt] };
      continue;
    }
    collapsiblePlaythrough = undefined;
    if (token.kind === 'load') {
      const load = toNode(token, 'load-reference', 0);
      nodes.push(load);
      const saves = load.saveSlot ? savesBySlot.get(load.saveSlot) ?? [] : [];
      frontier = saves.length === 1 ? [saves[0]!] : [];
      continue;
    }
    if ((token.kind === 'heading' || token.kind === 'save') && frontier.length > 1) frontier = [];
    const parents = frontier.length ? frontier : [root.id];
    const created = parents.map((parentId, occurrence) => {
      const node = toNode(token, parentId, occurrence);
      nodes.push(node);
      edges.push(makeEdge(parentId, node.id, frontier.length ? 'progress' : 'unlock'));
      if (node.kind === 'save' && node.saveSlot) savesBySlot.set(node.saveSlot, [...(savesBySlot.get(node.saveSlot) ?? []), node.id]);
      return node;
    });
    if (created.some((node) => node.kind === 'step' || node.kind === 'section')) {
      applyPendingDetails(created, pendingDisplayDetails);
      pendingDisplayDetails = [];
    }
    if (created.every((node) => node.kind === 'ending')) pendingDisplayDetails = [];
    frontier = created.every((node) => node.kind === 'ending') ? [] : created.filter((node) => node.kind !== 'ending').map((node) => node.id);
  }
  return { nodes, edges };
}

function applyPendingDetails(nodes: GuideNode[], details: string[]): void {
  if (!details.length) return;
  const displayDetail = details.join('\n');
  for (const node of nodes) {
    if (node.kind !== 'step' && node.kind !== 'section') continue;
    node.detail = [displayDetail, node.detail].filter(Boolean).join('\n');
  }
}

export function resolveLoadReferences(graph: GuideDocument): { graph: GuideDocument; diagnostics: ParserDiagnostic[] } {
  const diagnostics: ParserDiagnostic[] = [];
  const edges = [...graph.edges];
  const savesBySlot = new Map<string, GuideNode[]>();
  for (const node of graph.nodes.filter((item) => item.kind === 'save' && item.saveSlot)) {
    savesBySlot.set(node.saveSlot as string, [...(savesBySlot.get(node.saveSlot as string) ?? []), node]);
  }
  for (const [slot, saves] of savesBySlot) if (saves.length > 1) diagnostics.push(diag('DUPLICATE_SAVE_SLOT', `存档槽位 ${slot} 出现 ${saves.length} 次`, 'warning', saves));
  for (const load of graph.nodes.filter((node) => node.kind === 'load')) {
    const candidates = load.saveSlot ? savesBySlot.get(load.saveSlot) ?? [] : [];
    if (candidates.length === 1) edges.push(makeEdge(load.id, candidates[0]?.id ?? '', 'load_reference', `LOAD ${load.saveSlot}`));
  }
  return { graph: { ...graph, edges }, diagnostics };
}

function toNode(token: InferredBlock['tokens'][number], parentContext: string, occurrence: number): GuideNode {
  const kind = tokenKindToNodeKind[token.kind as Exclude<typeof token.kind, 'blank'>];
  return {
    id: stableId(kind, `${token.source.startLine}:${token.source.endLine}:${parentContext}:${occurrence}:${token.id}`), kind, label: token.text || '未命名节点',
    saveSlot: token.metadata?.slot, endingType: token.metadata?.endingType, source: token.source,
    parseConfidence: token.confidence, parseWarnings: token.kind === 'unknown' ? ['无法可靠分类'] : [], userEdited: false,
  };
}
function toChoiceGroup(block: InferredBlock, parentContext: string, occurrence: number): GuideNode {
  return {
    id: stableId('choice-group', `${parentContext}:${occurrence}:${block.tokens.map((token) => token.id).join(':')}`), kind: 'choice_group', label: '选择分支',
    source: { startLine: block.tokens[0]?.source.startLine ?? 1, endLine: block.tokens.at(-1)?.source.endLine ?? 1 },
    parseConfidence: Math.min(...block.tokens.map((token) => token.confidence)), parseWarnings: block.warnings, userEdited: false,
  };
}
function makeEdge(source: string, target: string, kind: GuideEdge['kind'], label?: string): GuideEdge {
  return { id: stableId('edge', `${source}:${target}:${kind}`), source, target, kind, label };
}
function diag(code: string, message: string, severity: ParserDiagnostic['severity'], nodes: GuideNode[]): ParserDiagnostic {
  return { id: stableId('diag', `${code}:${nodes.map((node) => node.id).join(':')}`), code, message, severity,
    relatedNodeIds: nodes.map((node) => node.id), sourceRange: nodes[0]?.source };
}
