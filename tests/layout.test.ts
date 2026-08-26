import { describe, expect, it } from 'vitest';
import type { GuideDocument, GuideNode } from '../src/domain/model';
import { compareNodesByPreferredOrder, compareNodesBySourceOrder } from '../src/domain/graphOrder';
import { getMainLayoutGraph, layoutGuide } from '../src/layout/elkLayout';

const node = (id: string, line?: number): GuideNode => ({ id, kind: id === 'root' ? 'root' : 'choice', label: id, source: line ? { startLine: line, endLine: line } : undefined, parseConfidence: 1, parseWarnings: [], userEdited: false });
const graph = (nodeOrder: string[], edgeOrder: string[]): GuideDocument => {
  const byId = new Map([node('root'), node('a', 10), node('b', 20), node('c', 30)].map((item) => [item.id, item]));
  const edges = new Map(['a', 'b', 'c'].map((id) => [id, { id: `edge-${id}`, source: 'root', target: id, kind: 'choice' as const }]));
  return { nodes: nodeOrder.map((id) => byId.get(id)!), edges: [...edgeOrder.map((id) => edges.get(id)!), { id: 'load-ref', source: 'c', target: 'root', kind: 'load_reference' as const }] };
};

describe('stable DOWN layout', () => {
  it('uses source then stable id ordering even when ranges are missing or equal', () => {
    expect([node('z'), node('b', 1), node('a', 1)].sort(compareNodesBySourceOrder).map((item) => item.id)).toEqual(['a', 'b', 'z']);
  });
  it('keeps an explicitly saved manual left-to-right order ahead of source order', () => {
    const left = { ...node('later', 30), position: { x: 10, y: 20 } };
    const right = { ...node('earlier', 2), position: { x: 200, y: 20 } };
    expect([right, left].sort(compareNodesByPreferredOrder).map((item) => item.id)).toEqual(['later', 'earlier']);
  });
  it('excludes LOAD references from the main ELK graph', () => {
    expect(getMainLayoutGraph(graph(['c', 'root', 'a', 'b'], ['c', 'a', 'b'])).edges.map((edge) => edge.kind)).toEqual(['choice', 'choice', 'choice']);
  });
  it('keeps A, B and C left-to-right regardless of input node and edge order', async () => {
    const first = await layoutGuide(graph(['c', 'root', 'a', 'b'], ['c', 'a', 'b']));
    const second = await layoutGuide(graph(['b', 'a', 'c', 'root'], ['b', 'c', 'a']));
    for (const positions of [first, second]) expect([positions.get('a')!.x, positions.get('b')!.x, positions.get('c')!.x]).toEqual([...['a', 'b', 'c'].map((id) => positions.get(id)!.x)].sort((a, b) => a - b));
    expect(first.get('a')!.y).toBeGreaterThan(first.get('root')!.y);
  });
});
