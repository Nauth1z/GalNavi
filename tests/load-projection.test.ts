import { describe, expect, it } from 'vitest';
import type { GuideDocument, GuideNode } from '../src/domain/model';
import { deriveLoadBranchProjections, projectLoadBranchesForLayout } from '../src/domain/loadProjection';
import { advanceProgress, createSession } from '../src/domain/progress';
import { getMainLayoutGraph, layoutGuide } from '../src/layout/elkLayout';

const node = (id: string, kind: GuideNode['kind'], line: number): GuideNode => ({ id, kind, label: id, source: { startLine: line, endLine: line }, parseConfidence: 1, parseWarnings: [], userEdited: false });
const graph: GuideDocument = {
  nodes: [node('save', 'save', 1), node('a', 'choice', 2), node('end-a', 'ending', 3), node('load', 'load', 5), node('b', 'choice', 6), node('end-b', 'ending', 7)],
  edges: [
    { id: 'save-a', source: 'save', target: 'a', kind: 'progress' },
    { id: 'a-end', source: 'a', target: 'end-a', kind: 'progress' },
    { id: 'load-save', source: 'load', target: 'save', kind: 'load_reference' },
    { id: 'save-b', source: 'save', target: 'b', kind: 'progress' },
    { id: 'b-end', source: 'b', target: 'end-b', kind: 'progress' },
  ],
};

describe('LOAD layout projection', () => {
  it('keeps the persisted graph untouched while projecting SAVE → LOAD → branch', () => {
    const before = structuredClone(graph);
    const projection = deriveLoadBranchProjections(graph);
    expect(projection).toEqual([expect.objectContaining({ loadNodeId: 'load', saveNodeId: 'save', branchEntryNodeId: 'b', flowEdgeId: 'save-b' })]);
    const projected = projectLoadBranchesForLayout(graph);
    expect(graph).toEqual(before);
    expect(projected.edges).not.toContainEqual(expect.objectContaining({ id: 'save-b' }));
    expect(projected.edges).toContainEqual(expect.objectContaining({ source: 'save', target: 'load', kind: 'progress' }));
    expect(projected.edges).toContainEqual(expect.objectContaining({ source: 'load', target: 'b', kind: 'progress' }));
    expect(graph.edges).toContainEqual(expect.objectContaining({ id: 'save-b', source: 'save', target: 'b' }));
    expect(graph.edges).toContainEqual(expect.objectContaining({ id: 'load-save', kind: 'load_reference' }));
  });

  it('places LOAD beside the earlier SAVE branch and before its following entry', async () => {
    const main = getMainLayoutGraph(graph);
    expect(main.edges.some((edge) => edge.id === 'save-b')).toBe(false);
    expect(main.edges.some((edge) => edge.source === 'save' && edge.target === 'load')).toBe(true);
    expect(main.edges.some((edge) => edge.source === 'load' && edge.target === 'b')).toBe(true);
    const positions = await layoutGuide(graph);
    expect(positions.get('load')!.y).toBeGreaterThan(positions.get('save')!.y);
    expect(positions.get('b')!.y).toBeGreaterThan(positions.get('load')!.y);
    expect(positions.get('a')!.x).toBeLessThan(positions.get('load')!.x);
  });

  it('continues to advance through and record the real SAVE → branch edge', () => {
    const result = advanceProgress({ ...createSession('投影测试', 1), currentNodeId: 'save' }, graph, 'save-b', 2);
    expect(result.status).toBe('advanced');
    expect(result.session.currentNodeId).toBe('b');
    expect(result.session.chosenEdgeIds).toContain('save-b');
    expect(result.session.visitedNodeIds).not.toContain('load');
  });

  it('uses the LOAD closest to an entry when duplicate references point to one branch', () => {
    const duplicate: GuideDocument = {
      ...graph,
      nodes: [...graph.nodes, node('inline-load', 'load', 4)],
      edges: [...graph.edges, { id: 'inline-load-save', source: 'inline-load', target: 'save', kind: 'load_reference' }],
    };
    const projections = deriveLoadBranchProjections(duplicate);
    expect(projections.filter((projection) => projection.flowEdgeId === 'save-b')).toEqual([
      expect.objectContaining({ loadNodeId: 'load', branchEntryNodeId: 'b' }),
    ]);
  });
});
