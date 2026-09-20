import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../src/App';
import { DiagnosticsPanel } from '../src/components/DiagnosticsPanel';
import { TopBar } from '../src/components/TopBar';
import { WindowChrome } from '../src/components/WindowChrome';
import { createProject } from '../src/domain/project';
import { NewProjectPanel } from '../src/features/import/NewProjectPanel';
import { parseGuide } from '../src/parser';
import { projectRepository } from '../src/storage/repository';
import { useProjectListStore } from '../src/stores/projectListStore';
import { useUiStore } from '../src/stores/uiStore';
import { useWorkspaceStore } from '../src/stores/workspaceStore';

describe('localized project UI', () => {
  afterEach(cleanup);

  beforeEach(() => {
    localStorage.clear();
    useUiStore.setState({ view: 'graph', graphMode: 'play', selectedNodeId: undefined, focusedLine: undefined, focusNodeId: undefined, focusRequest: 0, diagnosticsOpen: false, diagnosticFilter: 'all' });
    useWorkspaceStore.setState({ project: undefined, diagnostics: [], ignoredDiagnosticIds: [] });
    useProjectListStore.setState({ projects: [], loading: false });
  });

  it('renders the first-run project creator', () => {
    render(<NewProjectPanel/>);
    expect(screen.getByRole('heading', { name: '新建攻略项目' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '创建项目' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '上传 TXT' })).toBeEnabled();
    expect(screen.getByPlaceholderText('在这里粘贴纯文本攻略…')).toBeInTheDocument();
  });

  it('loads a local TXT file into the guide source field', async () => {
    render(<NewProjectPanel/>);
    const file = new File(['第一章\n步骤甲'], '攻略.txt', { type: 'text/plain' });
    Object.defineProperty(file, 'text', { value: () => Promise.resolve('第一章\n步骤甲') });

    fireEvent.change(screen.getByLabelText('上传 TXT 文件'), { target: { files: [file] } });

    await waitFor(() => expect(screen.getByPlaceholderText('在这里粘贴纯文本攻略…')).toHaveValue('第一章\n步骤甲'));
    expect(screen.getByText('已载入：攻略.txt')).toBeInTheDocument();
  });

  it('asks whether to include play progress before exporting', () => {
    const project = createProject('导出测试', '第一章\n步骤甲', parseGuide('第一章\n步骤甲').graph, 7);
    useWorkspaceStore.getState().open(project);
    render(<TopBar/>);

    fireEvent.click(screen.getByRole('button', { name: '导出当前项目' }));

    expect(screen.getByRole('dialog', { name: '导出项目' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '携带游玩进度导出' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '不携带游玩进度导出' })).toBeEnabled();
  });

  it('keeps window controls visible while the window is not maximized', async () => {
    localStorage.setItem('galnavi.window-state', JSON.stringify({ width: 900, height: 650, maximized: false }));
    const { container } = render(<WindowChrome/>);

    await waitFor(() => expect(container.querySelector('.window-chrome-zone')).toHaveClass('windowed'));
    expect(screen.getByRole('button', { name: '关闭窗口' })).toBeEnabled();
  });

  it('uses the hover-reveal window chrome while maximized', async () => {
    localStorage.setItem('galnavi.window-state', JSON.stringify({ width: 1366, height: 768, maximized: true }));
    const { container } = render(<WindowChrome/>);

    await waitFor(() => expect(container.querySelector('.window-chrome-zone')).toHaveClass('maximized'));
  });

  it('saves and closes the active project before opening the project creator', async () => {
    const project = createProject('当前项目', '第一章\n步骤甲', parseGuide('第一章\n步骤甲').graph, 8);
    useWorkspaceStore.getState().open(project);
    useUiStore.setState({ view: 'source' });
    render(<App/>);

    fireEvent.click(screen.getByRole('button', { name: '新建项目' }));

    await waitFor(() => expect(screen.getByRole('heading', { name: '新建攻略项目' })).toBeInTheDocument());
    expect(useWorkspaceStore.getState().project).toBeUndefined();
    expect(screen.queryByText(/最近路径：/)).not.toBeInTheDocument();
    expect((await projectRepository.get(project.id))?.id).toBe(project.id);
  });

  it('shows the project sidebar in edit mode and hides it in play mode', () => {
    const project = createProject('模式测试', '第一章\n步骤甲', parseGuide('第一章\n步骤甲').graph, 9);
    useWorkspaceStore.getState().open(project);
    const { container } = render(<App/>);

    expect(useUiStore.getState().graphMode).toBe('edit');
    expect(screen.getByRole('complementary', { name: '项目栏' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '新建项目' })).toBeInTheDocument();
    expect(container.querySelector('.app-shell')).not.toHaveClass('sidebar-hidden');

    fireEvent.click(screen.getByRole('button', { name: '游玩' }));
    expect(screen.queryByRole('complementary', { name: '项目栏' })).not.toBeInTheDocument();
    expect(container.querySelector('.app-shell')).toHaveClass('sidebar-hidden');
    expect(container.querySelector('.project-sidebar')).toHaveClass('mode-hidden');
    expect(container.querySelector('.project-sidebar')).toHaveAttribute('inert');
    expect(container.querySelector('.app-body')?.children).toHaveLength(2);
    expect(container.querySelector('.app-body')?.lastElementChild).toHaveClass('workspace');

    fireEvent.click(screen.getByRole('button', { name: '编辑' }));
    expect(screen.getByRole('complementary', { name: '项目栏' })).toBeInTheDocument();
    expect(container.querySelector('.project-sidebar')).not.toHaveClass('mode-hidden');
  });

  it('focuses the current position whenever a project opens and defaults it to the start node', () => {
    const project = createProject('聚焦测试', '第一章\n步骤甲', parseGuide('第一章\n步骤甲').graph, 10);
    const root = project.guide.nodes.find((node) => node.kind === 'root');
    expect(root).toBeDefined();
    expect(project.sessions[0]?.currentNodeId).toBe(root?.id);

    useUiStore.setState({ view: 'source' });
    useWorkspaceStore.getState().open(project);
    expect(useUiStore.getState()).toMatchObject({ view: 'graph', focusNodeId: root?.id, focusRequest: 1 });

    useWorkspaceStore.getState().open(project);
    expect(useUiStore.getState()).toMatchObject({ focusNodeId: root?.id, focusRequest: 2 });
  });

  it('jumps from a warning to its source line', () => {
    useWorkspaceStore.setState({ diagnostics: [{ id: 'warning-1', severity: 'warning', code: 'W_TEST', message: '请检查这一行', sourceRange: { startLine: 7, endLine: 8 }, relatedNodeIds: ['node-1'] }] });
    useUiStore.getState().showDiagnostics('warning');
    render(<DiagnosticsPanel/>);

    fireEvent.click(screen.getByText('请检查这一行'));

    expect(useUiStore.getState()).toMatchObject({ view: 'source', selectedNodeId: 'node-1', focusedLine: 7, diagnosticsOpen: false });
  });

  it('hides an ignored warning while keeping errors visible', () => {
    useWorkspaceStore.setState({ diagnostics: [
      { id: 'warning-1', severity: 'warning', code: 'W_TEST', message: '可忽略警告' },
      { id: 'error-1', severity: 'error', code: 'E_TEST', message: '不可忽略错误' },
    ] });
    useUiStore.getState().showDiagnostics();
    render(<DiagnosticsPanel/>);

    fireEvent.click(screen.getByRole('button', { name: /忽略$/ }));

    expect(screen.queryByText('可忽略警告')).not.toBeInTheDocument();
    expect(screen.getByText('不可忽略错误')).toBeInTheDocument();
    expect(useWorkspaceStore.getState().ignoredDiagnosticIds).toEqual(['warning-1']);
  });

  it('emits a new focus request even for the same current node', () => {
    const ui = useUiStore.getState();
    ui.requestNodeFocus('node-1');
    useUiStore.getState().requestNodeFocus('node-1');

    expect(useUiStore.getState()).toMatchObject({ focusNodeId: 'node-1', focusRequest: 2 });
  });
});
