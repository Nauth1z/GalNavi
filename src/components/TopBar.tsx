import { CircleCheck, Download, LoaderCircle, PanelTop, Pencil, Pin, PinOff, Play, TriangleAlert, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import logoUrl from '../assets/galnavi-logo.svg';
import { desktopPlatform } from '../platform/desktop';
import { exportProjectToFile, importProjectFromFile } from '../platform/files';
import { projectRepository } from '../storage/repository';
import { useProjectListStore } from '../stores/projectListStore';
import { useUiStore } from '../stores/uiStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { ExportDialog } from './ExportDialog';

export function TopBar() {
  const store = useWorkspaceStore(); const ui = useUiStore(); const input = useRef<HTMLInputElement>(null); const replaceSummary = useProjectListStore((state) => state.replaceSummary);
  const [exportDialogOpen, setExportDialogOpen] = useState(false); const [exporting, setExporting] = useState(false);
  const importFile = async (file?: File) => { try { const project = await importProjectFromFile(file); if (project) { await projectRepository.save(project); replaceSummary(project); store.open(project); } } catch (error) { ui.setError(error instanceof Error ? error.message : '导入失败'); } };
  useEffect(() => { void desktopPlatform.getWindowState().then((state) => ui.setAlwaysOnTop(state.alwaysOnTop ?? false)).catch(() => undefined); }, []);
  const togglePin = async () => { try {
    const state = await desktopPlatform.getWindowState(); const next = !(state.alwaysOnTop ?? ui.alwaysOnTop);
    await desktopPlatform.setAlwaysOnTop(next);
    const confirmed = await desktopPlatform.getWindowState();
    if ((confirmed.alwaysOnTop ?? next) !== next) throw new Error('窗口未确认置顶状态');
    ui.setAlwaysOnTop(next);
  } catch (error) { ui.setError(`窗口置顶失败：${error instanceof Error ? error.message : '权限未配置'}`); } };
  const enterMini = async () => { try { await desktopPlatform.enterMiniMode(); ui.setMiniMode(true); } catch (error) { ui.setError(`无法进入精简模式：${error instanceof Error ? error.message : '窗口权限不可用'}`); } };
  const exportProject = async (includeProgress: boolean) => {
    if (!store.project || exporting) return;
    setExporting(true);
    try { await exportProjectToFile(store.project, { includeProgress }); setExportDialogOpen(false); }
    catch (error) { ui.setError(error instanceof Error ? error.message : '导出失败'); }
    finally { setExporting(false); }
  };
  const SaveIcon = store.saving ? LoaderCircle : store.saveError ? TriangleAlert : CircleCheck;
  return <header className="topbar"><div className="brand"><span className="brand-mark" aria-hidden><img src={logoUrl} alt=""/></span><strong>GalNavi</strong>{store.project && <><span className="breadcrumb-separator" aria-hidden>/</span><em title={store.project.title}>{store.project.title}</em></>}</div><nav className="topbar-actions" aria-label="应用操作">
    <input ref={input} hidden type="file" accept="application/json,.json" onChange={(event) => void importFile(event.target.files?.[0])}/>
    <div className="topbar-tools">
      <button className="ghost-button" title="导入项目" aria-label="导入项目" onClick={() => window.__TAURI_INTERNALS__ ? void importFile() : input.current?.click()}><Upload size={15}/><span className="button-label">导入</span></button>
      <button className="ghost-button" title="导出当前项目" aria-label="导出当前项目" disabled={!store.project} onClick={() => setExportDialogOpen(true)}><Download size={15}/><span className="button-label">导出</span></button>
      <button className={`ghost-button ${ui.alwaysOnTop ? 'active' : ''}`} title="让 GalNavi 窗口始终显示在其他普通窗口上方" aria-label={ui.alwaysOnTop ? '取消窗口置顶' : '窗口置顶'} aria-pressed={ui.alwaysOnTop} onClick={() => void togglePin()}>{ui.alwaysOnTop ? <Pin size={15}/> : <PinOff size={15}/>}<span className="button-label">{ui.alwaysOnTop ? '已置顶' : '置顶'}</span></button>
      <button className="ghost-button" title="进入精简模式" aria-label="进入精简模式" disabled={!store.project} onClick={() => void enterMini()}><PanelTop size={15}/><span className="button-label">精简</span></button>
    </div>
    {store.project && <span className={`save-state ${store.saving ? 'saving' : store.saveError ? 'failed' : 'saved'}`} title={store.saveError ?? '项目变更会自动保存'}><SaveIcon size={13}/>{store.saving ? '保存中…' : store.saveError ? '保存失败' : '已保存'}</span>}
    {store.project && <span className="topbar-mode-switch" aria-label="路线图模式"><button className={ui.graphMode === 'play' ? 'active' : ''} aria-pressed={ui.graphMode === 'play'} title="游玩模式" onClick={() => ui.setGraphMode('play')}><Play size={14}/><span className="mode-label">游玩</span></button><button className={ui.graphMode === 'edit' ? 'active' : ''} aria-pressed={ui.graphMode === 'edit'} title="编辑模式" onClick={() => ui.setGraphMode('edit')}><Pencil size={14}/><span className="mode-label">编辑</span></button></span>}
  </nav>{exportDialogOpen && store.project && <ExportDialog exporting={exporting} onClose={() => setExportDialogOpen(false)} onExport={(includeProgress) => void exportProject(includeProgress)}/>}</header>;
}
