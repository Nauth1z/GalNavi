import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import type { GalNaviProject } from '../domain/model';
import { exportProjectJson, importProjectJson, type ProjectExportOptions } from '../storage/serialization';

export async function importProjectFromFile(browserFile?: File): Promise<GalNaviProject | undefined> {
  if (!window.__TAURI_INTERNALS__) {
    if (!browserFile) return undefined;
    return importProjectJson(await browserFile.text());
  }
  const path = await open({ multiple: false, directory: false, filters: [{ name: 'GalNavi JSON', extensions: ['json'] }] });
  if (!path) return undefined;
  const contents = await invoke<string>('read_external_json', { path });
  return importProjectJson(contents);
}

export async function exportProjectToFile(project: GalNaviProject, options?: ProjectExportOptions): Promise<void> {
  const contents = exportProjectJson(project, options);
  if (!window.__TAURI_INTERNALS__) {
    const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${safeName(project.title)}.galnavi.json`; anchor.click(); URL.revokeObjectURL(url); return;
  }
  const path = await save({ defaultPath: `${safeName(project.title)}.galnavi.json`, filters: [{ name: 'GalNavi JSON', extensions: ['json'] }] });
  if (path) await invoke('write_external_json', { path, contents });
}
const safeName = (name: string) => name.replace(/[<>:"/\\|?*]/g, '_').slice(0, 80) || 'GalNavi项目';
