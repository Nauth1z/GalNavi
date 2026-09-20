import { BookOpen, FilePlus2, Pencil, Trash2 } from 'lucide-react';
import { projectRepository } from '../../storage/repository';
import { useProjectListStore } from '../../stores/projectListStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';

export function ProjectSidebar({ visible, onNew }: { visible: boolean; onNew: () => void }) {
  const { projects, loading, removeSummary } = useProjectListStore();
  const workspace = useWorkspaceStore();
  const remove = async (id: string, title: string) => {
    if (!confirm(`确定删除“${title}”吗？本机项目文件及备份会一并删除，此操作无法在应用内撤销。`)) return;
    await projectRepository.delete(id); removeSummary(id); if (workspace.project?.id === id) workspace.close();
  };
  return <aside className={`project-sidebar${visible ? '' : ' mode-hidden'}`} aria-label="项目栏" aria-hidden={!visible} inert={!visible}>
    <div className="sidebar-title"><span><BookOpen size={18}/>项目</span><button className="icon-button" onClick={onNew} title="新建项目" aria-label="新建项目"><FilePlus2 size={17}/></button></div>
    <div className="project-list">
      {loading && <p className="muted">正在读取本机项目…</p>}
      {!loading && projects.length === 0 && <p className="muted">尚无项目</p>}
      {projects.map((project) => <div key={project.id} className={`project-item ${workspace.project?.id === project.id ? 'active' : ''}`}>
        <button className="project-open" title={project.title} onClick={() => workspace.open(project)}><strong>{project.title}</strong><small>{project.guide.nodes.length} 个节点</small></button>
        <button className="icon-button project-action" title={`重命名 ${project.title}`} aria-label={`重命名 ${project.title}`} onClick={() => { const title = prompt('项目名称', project.title); if (title) { workspace.open(project); void workspace.rename(title); } }}><Pencil size={14}/></button>
        <button className="icon-button danger project-action" title={`删除 ${project.title}`} aria-label={`删除 ${project.title}`} onClick={() => void remove(project.id, project.title)}><Trash2 size={14}/></button>
      </div>)}
    </div>
  </aside>;
}
