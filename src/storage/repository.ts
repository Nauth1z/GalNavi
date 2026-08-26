import { invoke } from '@tauri-apps/api/core';
import type { GalNaviProject } from '../domain/model';
import { exportProjectJson, importProjectJson } from './serialization';

export interface ProjectRepository {
  list(): Promise<GalNaviProject[]>;
  get(id: string): Promise<GalNaviProject | undefined>;
  save(project: GalNaviProject): Promise<void>;
  delete(id: string): Promise<void>;
}

const key = (id: string) => `galnavi.project.${id}`;
export class BrowserProjectRepository implements ProjectRepository {
  async list(): Promise<GalNaviProject[]> {
    const projects: GalNaviProject[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const itemKey = localStorage.key(index);
      if (!itemKey?.startsWith('galnavi.project.')) continue;
      try { const value = localStorage.getItem(itemKey); if (value) projects.push(importProjectJson(value)); } catch { /* isolate damaged projects */ }
    }
    return projects.sort((a, b) => b.updatedAt - a.updatedAt);
  }
  async get(id: string) { const value = localStorage.getItem(key(id)); return value ? importProjectJson(value) : undefined; }
  async save(project: GalNaviProject) { localStorage.setItem(key(project.id), exportProjectJson(project)); }
  async delete(id: string) { localStorage.removeItem(key(id)); }
}

export class TauriProjectRepository implements ProjectRepository {
  async list(): Promise<GalNaviProject[]> {
    const values = await invoke<string[]>('list_projects');
    return values.flatMap((value) => { try { return [importProjectJson(value)]; } catch { return []; } }).sort((a, b) => b.updatedAt - a.updatedAt);
  }
  async get(id: string) { const value = await invoke<string | null>('read_project', { projectId: id }); return value ? importProjectJson(value) : undefined; }
  async save(project: GalNaviProject) { await invoke('save_project', { projectId: project.id, contents: exportProjectJson(project) }); }
  async delete(id: string) { await invoke('delete_project', { projectId: id }); }
}

export const projectRepository: ProjectRepository = window.__TAURI_INTERNALS__ ? new TauriProjectRepository() : new BrowserProjectRepository();
