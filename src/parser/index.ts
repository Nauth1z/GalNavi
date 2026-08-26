import type { ParserDiagnostic } from '../domain/model';
import { stableId } from '../domain/model';
import { validateGraph } from '../domain/validation';
import { buildGraph, resolveLoadReferences } from './graph';
import { normalizeText } from './normalize';
import { groupBlocks, inferStructure } from './structure';
import { tokenizeLines } from './tokenize';
import type { ParseResult } from './types';

export function parseGuide(rawText: string): ParseResult {
  const lines = normalizeText(rawText);
  const tokens = tokenizeLines(lines);
  if (!rawText.trim()) {
    const diagnostic: ParserDiagnostic = { id: 'diag-empty', severity: 'error', code: 'EMPTY_GUIDE', message: '攻略内容为空', suggestedFix: '请粘贴攻略文本后重新解析' };
    return { graph: { nodes: [], edges: [] }, diagnostics: [diagnostic], tokens, stats: stats([], [diagnostic]) };
  }
  const blocks = inferStructure(groupBlocks(tokens));
  const built = buildGraph(blocks);
  const resolved = resolveLoadReferences(built);
  const diagnostics = [...resolved.diagnostics, ...validateGraph(resolved.graph)];
  for (const token of tokens.filter((item) => item.kind === 'unknown')) diagnostics.push({
    id: stableId('diag', `unknown:${token.id}`), severity: 'warning', code: 'UNKNOWN_TEXT', message: '这段文本无法可靠分类', sourceRange: token.source, suggestedFix: '请手动标记为步骤、选项、存档、结局或忽略',
  });
  if (!resolved.graph.nodes.some((node) => node.kind === 'step')) diagnostics.push({ id: 'diag-no-step', severity: 'warning', code: 'NO_EFFECTIVE_STEPS', message: '没有识别出普通步骤，请检查解析结果' });
  const uniqueDiagnostics = [...new Map(diagnostics.map((item) => [item.id, item])).values()];
  return { graph: resolved.graph, diagnostics: uniqueDiagnostics, tokens, stats: stats(resolved.graph.nodes, uniqueDiagnostics) };
}

function stats(nodes: ParseResult['graph']['nodes'], diagnostics: ParserDiagnostic[]): ParseResult['stats'] {
  return {
    nodes: nodes.length, steps: nodes.filter((node) => node.kind === 'step').length,
    choiceGroups: nodes.filter((node) => node.kind === 'choice_group').length,
    saves: nodes.filter((node) => node.kind === 'save').length, loads: nodes.filter((node) => node.kind === 'load').length,
    endings: nodes.filter((node) => node.kind === 'ending').length,
    warnings: diagnostics.filter((item) => item.severity === 'warning').length,
    errors: diagnostics.filter((item) => item.severity === 'error').length,
  };
}

export * from './types';
export * from './normalize';
export * from './tokenize';
export * from './structure';
export * from './graph';
