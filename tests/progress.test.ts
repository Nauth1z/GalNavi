import { describe, expect, it } from 'vitest';
import type { GuideDocument, GuideNode } from '../src/domain/model';
import { advanceProgress, createSession, loadProgress, rollbackProgress, startProgress } from '../src/domain/progress';
import { deriveGuideNodeVisualStates } from '../src/domain/visualState';

const node = (id: string, kind: GuideNode['kind'] = 'step'): GuideNode => ({ id, kind, label: id, parseConfidence: 1, parseWarnings: [], userEdited: false });
const graph: GuideDocument = {
  nodes: [node('root', 'root'), node('a'), node('b'), node('c'), node('end', 'ending'), node('save', 'save'), node('load', 'load')],
  edges: [
    { id: 'ra', source: 'root', target: 'a', kind: 'progress' },
    { id: 'ab', source: 'a', target: 'b', kind: 'choice' }, { id: 'ac', source: 'a', target: 'c', kind: 'choice' },
    { id: 'be', source: 'b', target: 'end', kind: 'progress' },
    { id: 'ls', source: 'load', target: 'save', kind: 'load_reference' },
  ],
};

describe('progress', () => {
  it('advances a single path and records selected edge', () => {
    const started = startProgress(createSession('test', 1), 'root', graph, 2);
    const result = advanceProgress(started, graph, undefined, 3);
    expect(result.status).toBe('advanced'); expect(result.session.currentNodeId).toBe('a'); expect(result.session.chosenEdgeIds).toContain('ra');
  });
  it('requires an explicit branch and records it', () => {
    const session = { ...createSession(), currentNodeId: 'a' };
    expect(advanceProgress(session, graph).status).toBe('branch_required');
    const result = advanceProgress(session, graph, 'ab');
    expect(result.session.currentNodeId).toBe('b'); expect(result.session.chosenEdgeIds).toContain('ab');
  });
  it('records an ending', () => {
    const result = advanceProgress({ ...createSession(), currentNodeId: 'b' }, graph);
    expect(result.session.completedEndingNodeIds).toContain('end');
  });
  it('rolls back from history repeatedly', () => {
    let session = startProgress(createSession('test', 1), 'root', graph, 2);
    session = advanceProgress(session, graph, undefined, 3).session;
    session = advanceProgress(session, graph, 'ab', 4).session;
    session = rollbackProgress(session, graph, 5);
    expect(session.currentNodeId).toBe('a');
    session = rollbackProgress(session, graph, 6);
    expect(session.currentNodeId).toBe('root');
  });
  it('loads only through a unique load reference', () => {
    const session = loadProgress({ ...createSession(), currentNodeId: 'load' }, graph);
    expect(session.currentNodeId).toBe('save');
  });
  it('rejects an invalid current node', () => {
    expect(() => advanceProgress({ ...createSession(), currentNodeId: 'missing' }, graph)).toThrow('当前进度节点不存在');
  });
  it('orders branch choices by target source rather than edge array order', () => {
    const orderedGraph: GuideDocument = {
      nodes: [node('root', 'root'), { ...node('first'), source: { startLine: 2, endLine: 2 } }, { ...node('second'), source: { startLine: 3, endLine: 3 } }],
      edges: [{ id: 'second-edge', source: 'root', target: 'second', kind: 'choice' }, { id: 'first-edge', source: 'root', target: 'first', kind: 'choice' }],
    };
    const result = advanceProgress({ ...createSession(), currentNodeId: 'root' }, orderedGraph);
    expect(result.status).toBe('branch_required');
    if (result.status === 'branch_required') expect(result.edgeIds).toEqual(['first-edge', 'second-edge']);
  });
  it('derives chosen and unselected route state only from the session record', () => {
    const session = advanceProgress({ ...createSession(), currentNodeId: 'a' }, graph, 'ab', 2).session;
    const states = deriveGuideNodeVisualStates(graph, session);
    expect(states.get('b')?.isCurrent).toBe(true);
    expect(states.get('a')?.isVisited).toBe(true);
    expect(states.get('c')?.isUnselectedBranch).toBe(true);
    expect(states.get('c')?.isOnChosenRoute).toBe(false);
  });
});
