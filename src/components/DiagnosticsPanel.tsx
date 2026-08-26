import { AlertTriangle, CircleX, EyeOff, X } from 'lucide-react';
import type { ParserDiagnostic } from '../domain/model';
import { useUiStore } from '../stores/uiStore';
import { useWorkspaceStore } from '../stores/workspaceStore';

export function DiagnosticsPanel() {
  const diagnostics = useWorkspaceStore((state) => state.diagnostics);
  const ignored = useWorkspaceStore((state) => state.ignoredDiagnosticIds);
  const ignoreDiagnostic = useWorkspaceStore((state) => state.ignoreDiagnostic);
  const { diagnosticsOpen, diagnosticFilter, hideDiagnostics, showDiagnostics, selectNode, setView } = useUiStore();
  if (!diagnosticsOpen) return null;
  const ignoredSet = new Set(ignored);
  const visible = diagnostics.filter((item) => !ignoredSet.has(item.id));
  const shown = visible.filter((item) => diagnosticFilter === 'all' || item.severity === diagnosticFilter);
  const warnings = visible.filter((item) => item.severity === 'warning').length;
  const errors = visible.filter((item) => item.severity === 'error').length;
  const navigate = (item: ParserDiagnostic) => {
    const nodeId = item.relatedNodeIds?.[0];
    selectNode(nodeId, item.sourceRange?.startLine);
    if (item.sourceRange) setView('source'); else if (nodeId) setView('graph');
    hideDiagnostics();
  };
  return <div className="dialog-backdrop diagnostics-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) hideDiagnostics(); }}>
    <section className="diagnostics-panel" role="dialog" aria-modal="true" aria-labelledby="diagnostics-title">
      <header><div><h2 id="diagnostics-title">解析警告与错误</h2><p>点击项目可跳转到对应原文或节点。</p></div><button className="icon-button" aria-label="关闭诊断" onClick={hideDiagnostics}><X size={18}/></button></header>
      <nav className="diagnostic-filters" aria-label="诊断筛选">
        <button className={diagnosticFilter === 'all' ? 'active' : ''} onClick={() => showDiagnostics('all')}>全部 {visible.length}</button>
        <button className={`warning ${diagnosticFilter === 'warning' ? 'active' : ''}`} onClick={() => showDiagnostics('warning')}><AlertTriangle size={14}/>警告 {warnings}</button>
        <button className={`error ${diagnosticFilter === 'error' ? 'active' : ''}`} onClick={() => showDiagnostics('error')}><CircleX size={14}/>错误 {errors}</button>
      </nav>
      <div className="diagnostic-list">
        {shown.map((item) => <article key={item.id} className={`diagnostic-list-item ${item.severity}`}>
          <button className="diagnostic-jump" onClick={() => navigate(item)}><strong>{item.code}</strong><span>{item.message}</span>{item.sourceRange && <small>原文第 {item.sourceRange.startLine}{item.sourceRange.endLine !== item.sourceRange.startLine ? `–${item.sourceRange.endLine}` : ''} 行</small>}</button>
          {item.severity === 'warning' && <button className="ignore-warning" title="忽略到下次重新解析" onClick={() => ignoreDiagnostic(item.id)}><EyeOff size={14}/>忽略</button>}
        </article>)}
        {shown.length === 0 && <p className="empty-state">当前筛选下没有未忽略的诊断。</p>}
      </div>
      <footer><span>已忽略 {ignored.length} 条警告；重新解析后恢复。</span><button onClick={hideDiagnostics}>完成</button></footer>
    </section>
  </div>;
}
