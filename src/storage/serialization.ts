import type { GalNaviProject } from '../domain/model';
import { CURRENT_SCHEMA_VERSION, galNaviProjectSchema } from '../domain/model';
import { createSession, startProgress } from '../domain/progress';

export interface ProjectExportOptions {
  includeProgress?: boolean;
}

export function exportProjectJson(project: GalNaviProject, options: ProjectExportOptions = {}): string {
  const exportProject = options.includeProgress === false ? resetProgressForExport(project) : project;
  return JSON.stringify(galNaviProjectSchema.parse(exportProject), null, 2);
}

function resetProgressForExport(project: GalNaviProject): GalNaviProject {
  const root = project.guide.nodes.find((node) => node.kind === 'root') ?? project.guide.nodes[0];
  const session = createSession('第一周目', project.updatedAt);
  const started = root ? startProgress(session, root.id, project.guide, project.updatedAt) : session;
  return { ...project, sessions: [started], activeSessionId: started.id };
}

export function importProjectJson(contents: string): GalNaviProject {
  let candidate: unknown;
  try { candidate = JSON.parse(contents); } catch { throw new Error('项目 JSON 已损坏，无法读取'); }
  if (!candidate || typeof candidate !== 'object') throw new Error('项目文件不是有效对象');
  const version = Reflect.get(candidate, 'schemaVersion');
  if (version !== CURRENT_SCHEMA_VERSION) throw new Error(`不支持的项目版本：${String(version)}`);
  const parsed = galNaviProjectSchema.safeParse(candidate);
  if (!parsed.success) throw new Error(`项目数据校验失败：${parsed.error.issues[0]?.message ?? '未知格式错误'}`);
  return parsed.data;
}
