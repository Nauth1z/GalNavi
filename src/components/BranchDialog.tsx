import { GitBranch, X } from 'lucide-react';
import { useWorkspaceStore } from '../stores/workspaceStore';

export function BranchDialog() {
  const { project, pendingBranchEdgeIds, advance, dismissBranch } = useWorkspaceStore();
  if (!project || pendingBranchEdgeIds.length === 0) return null;
  const edges = pendingBranchEdgeIds.map((id) => project.guide.edges.find((edge) => edge.id === id)).filter(Boolean);
  return <div className="dialog-backdrop" role="presentation">
    <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="branch-title">
      <header><GitBranch size={18}/><h2 id="branch-title">选择下一条路线</h2><button className="icon-button" aria-label="暂不选择" onClick={dismissBranch}><X size={18}/></button></header>
      <p>这里有多个可走分支，GalNavi 不会替你自动选择。</p>
      <div className="branch-options">{edges.map((edge) => {
        const target = project.guide.nodes.find((node) => node.id === edge?.target);
        return edge && <button key={edge.id} onClick={() => void advance(edge.id)}><strong>{edge.label || target?.label || '未命名分支'}</strong><small>{target?.detail}</small></button>;
      })}</div>
    </section>
  </div>;
}
