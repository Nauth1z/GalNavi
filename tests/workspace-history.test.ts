import { beforeEach, describe, expect, it } from 'vitest';
import { createProject } from '../src/domain/project';
import { parseGuide } from '../src/parser';
import { projectRepository } from '../src/storage/repository';
import { useUiStore } from '../src/stores/uiStore';
import { useWorkspaceStore } from '../src/stores/workspaceStore';

describe('guide edit history', () => {
  beforeEach(() => {
    localStorage.clear();
    useWorkspaceStore.setState({ project: undefined, diagnostics: [], ignoredDiagnosticIds: [], guideHistory: [], guideFuture: [], pendingBranchEdgeIds: [] });
  });

  it('undoes and redoes a node edit while keeping progress separate', async () => {
    const parsed = parseGuide('第一章\n前往车站\nGOOD END');
    const project = createProject('撤销测试', '第一章\n前往车站\nGOOD END', parsed.graph, 1);
    const node = project.guide.nodes.find((item) => item.kind === 'step');
    expect(node).toBeDefined();
    useWorkspaceStore.getState().open(project);
    await useWorkspaceStore.getState().editNode(node!.id, { label: '修改后的标题' });
    expect(useWorkspaceStore.getState().project?.guide.nodes.find((item) => item.id === node!.id)?.label).toBe('修改后的标题');
    expect(useWorkspaceStore.getState().guideHistory).toHaveLength(1);
    await useWorkspaceStore.getState().undoGuide();
    expect(useWorkspaceStore.getState().project?.guide.nodes.find((item) => item.id === node!.id)?.label).toBe(node!.label);
    await useWorkspaceStore.getState().redoGuide();
    expect(useWorkspaceStore.getState().project?.guide.nodes.find((item) => item.id === node!.id)?.label).toBe('修改后的标题');
  });

  it('records edge and position edits as independent undoable operations', async () => {
    const project = createProject('图编辑测试', '第一章\n步骤甲\n步骤乙', parseGuide('第一章\n步骤甲\n步骤乙').graph, 2);
    useWorkspaceStore.getState().open(project);
    const steps = project.guide.nodes.filter((node) => node.kind === 'step');
    await useWorkspaceStore.getState().savePosition(steps[0]!.id, { x: 320, y: 180 });
    await useWorkspaceStore.getState().addEdge(steps[0]!.id, steps[1]!.id, 'unlock');
    expect(useWorkspaceStore.getState().guideHistory).toHaveLength(2);
    await useWorkspaceStore.getState().undoGuide();
    expect(useWorkspaceStore.getState().project?.guide.edges.some((edge) => edge.kind === 'unlock' && edge.source === steps[0]!.id)).toBe(false);
    await useWorkspaceStore.getState().undoGuide();
    expect(useWorkspaceStore.getState().project?.guide.nodes.find((node) => node.id === steps[0]!.id)?.position).not.toEqual({ x: 320, y: 180 });
  });

  it('restores ignored warnings when the guide is reparsed', async () => {
    const source = '第一章\n步骤甲';
    const project = createProject('诊断测试', source, parseGuide(source).graph, 3);
    useWorkspaceStore.getState().open(project, [{ id: 'warning-1', severity: 'warning', code: 'W_TEST', message: '警告' }]);
    useWorkspaceStore.getState().ignoreDiagnostic('warning-1');
    expect(useWorkspaceStore.getState().ignoredDiagnosticIds).toEqual(['warning-1']);

    await useWorkspaceStore.getState().reparse();

    expect(useWorkspaceStore.getState().ignoredDiagnosticIds).toEqual([]);
  });

  it('keeps selection separate from current progress and persists explicit progress changes', async () => {
    const project = createProject('进度持久化测试', '第一章\n步骤甲\n步骤乙', parseGuide('第一章\n步骤甲\n步骤乙').graph, 4);
    const step = project.guide.nodes.find((node) => node.kind === 'step');
    expect(step).toBeDefined();
    useWorkspaceStore.getState().open(project);
    const originalCurrent = project.sessions[0]?.currentNodeId;

    useUiStore.getState().selectNode(step!.id, step!.source?.startLine);
    expect(useWorkspaceStore.getState().project?.sessions[0]?.currentNodeId).toBe(originalCurrent);

    await useWorkspaceStore.getState().setCurrent(step!.id);
    expect(useWorkspaceStore.getState().project?.sessions[0]?.currentNodeId).toBe(step!.id);
    expect((await projectRepository.get(project.id))?.sessions[0]?.currentNodeId).toBe(step!.id);
  });
});
