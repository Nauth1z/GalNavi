import { create } from 'zustand';
import type { GalNaviProject } from '../domain/model';
import { projectRepository } from '../storage/repository';

interface ProjectListState {
  projects: GalNaviProject[];
  loading: boolean;
  refresh: () => Promise<void>;
  replaceSummary: (project: GalNaviProject) => void;
  removeSummary: (id: string) => void;
}

export const useProjectListStore = create<ProjectListState>((set) => ({
  projects: [], loading: true,
  refresh: async () => { set({ loading: true }); const projects = await projectRepository.list(); set({ projects, loading: false }); },
  replaceSummary: (project) => set((state) => ({ projects: [project, ...state.projects.filter((item) => item.id !== project.id)].sort((a, b) => b.updatedAt - a.updatedAt) })),
  removeSummary: (id) => set((state) => ({ projects: state.projects.filter((item) => item.id !== id) })),
}));
