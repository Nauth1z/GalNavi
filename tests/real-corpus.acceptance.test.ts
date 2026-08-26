import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseGuide } from '../src/parser';
import { getMainLayoutGraph, layoutGuide } from '../src/layout/elkLayout';
import { createSession } from '../src/domain/progress';
import { deriveGuideNodeVisualStates } from '../src/domain/visualState';

const root = resolve(import.meta.dirname, '..');
const corpusFiles = readdirSync(root).filter((name) => name.toLowerCase().endsWith('.txt'));

describe('root real-guide read-only acceptance', () => {
  it.each(corpusFiles.map((name, index) => [`攻略样本 ${index + 1}`, name] as const))('parses %s without unhandled failures', async (alias, name) => {
    const text = readFileSync(resolve(root, name), 'utf8');
    const result = parseGuide(text);
    const nodeIds = new Set(result.graph.nodes.map((node) => node.id));
    expect(nodeIds.size).toBe(result.graph.nodes.length);
    for (const node of result.graph.nodes.filter((item) => item.kind !== 'root')) {
      expect(node.id.length).toBeGreaterThan(3);
      expect(node.source?.startLine).toBeGreaterThanOrEqual(1);
      expect(node.source?.endLine).toBeGreaterThanOrEqual(node.source?.startLine ?? 1);
    }
    for (const edge of result.graph.edges) {
      expect(nodeIds.has(edge.source)).toBe(true); expect(nodeIds.has(edge.target)).toBe(true);
    }
    expect(getMainLayoutGraph(result.graph).edges.some((edge) => edge.kind === 'load_reference')).toBe(false);
    expect(result.graph.nodes.filter((node) => node.kind === 'load').every((load) => !result.graph.edges.some((edge) => edge.target === load.id && edge.kind !== 'load_reference'))).toBe(true);
    const positions = await layoutGuide(result.graph);
    expect(positions.size).toBe(result.graph.nodes.length);
    const repeated = [...new Map(result.graph.nodes.filter((node) => node.kind !== 'root').map((node) => [node.label, result.graph.nodes.filter((candidate) => candidate.label === node.label)])).values()].find((nodes) => nodes.length > 1 && new Set(nodes.map((node) => node.source?.startLine)).size > 1);
    if (repeated) {
      expect(new Set(repeated.map((node) => node.id)).size).toBe(repeated.length);
      const session = { ...createSession('验收', 1), currentNodeId: repeated[0]!.id, visitedNodeIds: [repeated[0]!.id] };
      const states = deriveGuideNodeVisualStates(result.graph, session);
      expect(states.get(repeated[0]!.id)?.isVisited).toBe(true);
      expect(states.get(repeated[1]!.id)?.isVisited).toBe(false);
    }
    const summary = {
      file: alias, bytes: Buffer.byteLength(text), nodes: result.stats.nodes,
      saves: result.stats.saves, loads: result.stats.loads, endings: result.stats.endings,
      diagnostics: result.diagnostics.length,
      lowConfidenceBlocks: result.diagnostics.filter((item) => item.code === 'LOW_CONFIDENCE').length,
      loadDiagnostics: result.diagnostics.filter((item) => ['UNMATCHED_LOAD', 'AMBIGUOUS_LOAD'].includes(item.code)).length,
    };
    console.info(`[real-guide-summary] ${JSON.stringify(summary)}`);
    if (!text.trim()) expect(result.diagnostics.some((item) => item.code === 'EMPTY_GUIDE')).toBe(true);
  });
});
