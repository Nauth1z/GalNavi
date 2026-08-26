import { describe, expect, it } from 'vitest';
import { galNaviProjectSchema } from '../src/domain/model';
import { createProject, mergeUserEdits } from '../src/domain/project';
import { parseGuide } from '../src/parser';
import { exportProjectJson, importProjectJson } from '../src/storage/serialization';

describe('project serialization', () => {
  it('exports and imports a schema-validated project', () => {
    const parsed = parseGuide('开始\nSAVE 1\nGOOD END');
    const project = createProject('测试项目', '开始\nSAVE 1\nGOOD END', parsed.graph, 1);
    expect(importProjectJson(exportProjectJson(project))).toEqual(project);
    expect(galNaviProjectSchema.parse(project).schemaVersion).toBe(1);
    expect(project.guide.nodes.some((node) => parsed.graph.nodes.some((unscoped) => unscoped.id === node.id))).toBe(false);
  });
  it('can export a reset copy rooted at the beginning without mutating local progress', () => {
    const parsed = parseGuide('开始\nSAVE 1\nGOOD END');
    const project = createProject('测试项目', '开始\nSAVE 1\nGOOD END', parsed.graph, 10);
    const root = project.guide.nodes.find((node) => node.kind === 'root')!;
    const originalSession = project.sessions[0]!;
    project.sessions = [{
      ...originalSession,
      currentNodeId: project.guide.nodes.at(-1)!.id,
      visitedNodeIds: [root.id],
      chosenEdgeIds: [project.guide.edges[0]!.id],
      completedEndingNodeIds: [project.guide.nodes.at(-1)!.id],
      history: [...originalSession.history, { id: 'event-advance', type: 'advance', fromNodeId: root.id, toNodeId: project.guide.nodes.at(-1)!.id, edgeId: project.guide.edges[0]!.id, timestamp: 11 }],
    }];
    const localSnapshot = structuredClone(project);

    const exported = importProjectJson(exportProjectJson(project, { includeProgress: false }));
    const exportedSession = exported.sessions[0]!;

    expect(exportedSession.currentNodeId).toBe(root.id);
    expect(exportedSession.visitedNodeIds).toEqual([]);
    expect(exportedSession.chosenEdgeIds).toEqual([]);
    expect(exportedSession.completedEndingNodeIds).toEqual([]);
    expect(exportedSession.history).toHaveLength(1);
    expect(exportedSession.history[0]).toMatchObject({ type: 'start', nodeId: root.id });
    expect(project).toEqual(localSnapshot);
  });
  it('keeps progress by default and when explicitly requested', () => {
    const project = createProject('测试项目', '开始', parseGuide('开始').graph, 20);
    expect(importProjectJson(exportProjectJson(project))).toEqual(project);
    expect(importProjectJson(exportProjectJson(project, { includeProgress: true }))).toEqual(project);
  });
  it('rejects corrupt and unsupported JSON', () => {
    expect(() => importProjectJson('{bad')).toThrow('项目 JSON 已损坏');
    expect(() => importProjectJson(JSON.stringify({ schemaVersion: 99 }))).toThrow('不支持的项目版本');
  });
  it('preserves user-edited nodes when reparsing', () => {
    const first = parseGuide('剧情开始\nSAVE 1').graph;
    const edited = { ...first, nodes: first.nodes.map((item) => item.kind === 'step' ? { ...item, label: '用户标题', userEdited: true } : item) };
    const merged = mergeUserEdits(edited, parseGuide('剧情开始\nSAVE 1').graph);
    expect(merged.nodes.some((item) => item.label === '用户标题' && item.userEdited)).toBe(true);
  });
  it('preserves saved positions without treating layout as a content edit', () => {
    const first = parseGuide('剧情开始\nSAVE 1').graph;
    const target = first.nodes.find((node) => node.kind === 'step')!;
    const positioned = { ...first, nodes: first.nodes.map((node) => node.id === target.id ? { ...node, position: { x: 22, y: 44 } } : node) };
    const merged = mergeUserEdits(positioned, parseGuide('剧情开始\nSAVE 1').graph);
    expect(merged.nodes.find((node) => node.id === target.id)?.position).toEqual({ x: 22, y: 44 });
  });
  it('rejects the removed route-convergence edge kind', () => {
    const project = createProject('无效边项目', '开始', parseGuide('开始').graph, 1);
    const [root, next] = project.guide.nodes;
    const candidate = JSON.parse(exportProjectJson(project)) as { guide: { edges: unknown[] } };
    candidate.guide.edges = [{ id: 'removed-edge-kind', source: root!.id, target: next!.id, kind: 'merge' }];
    expect(() => importProjectJson(JSON.stringify(candidate))).toThrow('项目数据校验失败');
  });
  it('does not drop old nodes referenced by progress during a reparse migration', () => {
    const first = parseGuide('旧步骤').graph;
    const old = first.nodes.find((node) => node.kind === 'step')!;
    const merged = mergeUserEdits(first, parseGuide('全新步骤').graph, [old.id]);
    expect(merged.nodes.some((node) => node.id === old.id)).toBe(true);
  });
});
