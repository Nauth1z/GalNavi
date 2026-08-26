import { describe, expect, it } from 'vitest';
import type { GuideDocument, GuideNode } from '../src/domain/model';
import { validateGraph } from '../src/domain/validation';

const node = (id: string, kind: GuideNode['kind'] = 'step'): GuideNode => ({ id, kind, label: id, parseConfidence: 1, parseWarnings: [], userEdited: false });

describe('graph validation', () => {
  it('detects isolated nodes and missing entries', () => {
    const codes = validateGraph({ nodes: [node('root', 'root'), node('alone')], edges: [] }).map((item) => item.code);
    expect(codes).toContain('ISOLATED_NODE'); expect(codes).toContain('NO_ENTRY');
  });
  it('detects invalid edge references', () => {
    expect(validateGraph({ nodes: [node('root', 'root')], edges: [{ id: 'e', source: 'root', target: 'missing', kind: 'progress' }] }).some((item) => item.code === 'INVALID_EDGE_REFERENCE')).toBe(true);
  });
  it('detects normal flow cycles but ignores load references', () => {
    const nodes = [node('a', 'root'), node('b')];
    expect(validateGraph({ nodes, edges: [{ id: '1', source: 'a', target: 'b', kind: 'progress' }, { id: '2', source: 'b', target: 'a', kind: 'progress' }] }).some((item) => item.code === 'FLOW_CYCLE')).toBe(true);
    expect(validateGraph({ nodes, edges: [{ id: '1', source: 'a', target: 'b', kind: 'progress' }, { id: '2', source: 'b', target: 'a', kind: 'load_reference' }] }).some((item) => item.code === 'FLOW_CYCLE')).toBe(false);
  });
  it('detects ending outflow and incomplete choice groups', () => {
    const graph: GuideDocument = { nodes: [node('root', 'root'), node('end', 'ending'), node('group', 'choice_group')], edges: [{ id: '1', source: 'root', target: 'end', kind: 'progress' }, { id: '2', source: 'end', target: 'group', kind: 'progress' }] };
    const codes = validateGraph(graph).map((item) => item.code);
    expect(codes).toContain('ENDING_HAS_OUTGOING'); expect(codes).toContain('INCOMPLETE_CHOICE_GROUP');
  });

  it('accepts a uniquely referenced LOAD with a following display branch', () => {
    const root = node('root', 'root');
    const save = { ...node('save', 'save'), saveSlot: '1', source: { startLine: 2, endLine: 2 } };
    const load = { ...node('load', 'load'), saveSlot: '1', source: { startLine: 5, endLine: 5 } };
    const branch = { ...node('branch'), source: { startLine: 6, endLine: 6 } };
    const graph: GuideDocument = { nodes: [root, save, load, branch], edges: [
      { id: 'root-save', source: root.id, target: save.id, kind: 'progress' },
      { id: 'load-save', source: load.id, target: save.id, kind: 'load_reference' },
      { id: 'save-branch', source: save.id, target: branch.id, kind: 'progress' },
    ] };
    const loadCodes = validateGraph(graph).filter((item) => item.relatedNodeIds?.includes(load.id)).map((item) => item.code);
    expect(loadCodes).toEqual([]);
  });

  it('reports meaningful LOAD reference and display-branch failures instead of NO_ENTRY', () => {
    const root = node('root', 'root');
    const save = { ...node('save', 'save'), saveSlot: '1', source: { startLine: 2, endLine: 2 } };
    const unmatched = { ...node('unmatched', 'load'), saveSlot: '9', source: { startLine: 4, endLine: 4 } };
    const noBranch = { ...node('no-branch', 'load'), saveSlot: '1', source: { startLine: 5, endLine: 5 } };
    const graph: GuideDocument = { nodes: [root, save, unmatched, noBranch], edges: [
      { id: 'root-save', source: root.id, target: save.id, kind: 'progress' },
      { id: 'load-save', source: noBranch.id, target: save.id, kind: 'load_reference' },
    ] };
    const diagnostics = validateGraph(graph);
    expect(diagnostics).toContainEqual(expect.objectContaining({ code: 'UNMATCHED_LOAD', relatedNodeIds: [unmatched.id] }));
    expect(diagnostics).toContainEqual(expect.objectContaining({ code: 'LOAD_BRANCH_NOT_FOUND', relatedNodeIds: [noBranch.id, save.id] }));
    expect(diagnostics.filter((item) => item.relatedNodeIds?.some((id) => id === unmatched.id || id === noBranch.id)).some((item) => item.code === 'NO_ENTRY')).toBe(false);
  });

  it('detects ambiguous and invalid LOAD references', () => {
    const save1 = { ...node('save-1', 'save'), saveSlot: '1' };
    const save2 = { ...node('save-2', 'save'), saveSlot: '1' };
    const ambiguous = { ...node('ambiguous', 'load'), saveSlot: '1' };
    const invalid = { ...node('invalid', 'load'), saveSlot: '2' };
    const target = node('not-save');
    const graph: GuideDocument = { nodes: [node('root', 'root'), save1, save2, ambiguous, invalid, target], edges: [
      { id: 'invalid-ref', source: invalid.id, target: target.id, kind: 'load_reference' },
    ] };
    const diagnostics = validateGraph(graph);
    expect(diagnostics).toContainEqual(expect.objectContaining({ code: 'AMBIGUOUS_LOAD', relatedNodeIds: [ambiguous.id, save1.id, save2.id] }));
    expect(diagnostics).toContainEqual(expect.objectContaining({ code: 'INVALID_LOAD_REFERENCE', relatedNodeIds: [invalid.id, target.id] }));
  });
});
