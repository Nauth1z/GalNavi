import { AlertTriangle, EyeOff } from 'lucide-react';
import { useUiStore } from '../../stores/uiStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';

export function SourceView() {
  const { project, diagnostics, editNode } = useWorkspaceStore(); const { focusedLine, selectNode } = useUiStore();
  if (!project) return null;
  const lines = project.source.rawText.replace(/\r\n?/g, '\n').split('\n');
  const lineMap = new Map<number, typeof project.guide.nodes>();
  for (const node of project.guide.nodes) if (node.source) for (let line = node.source.startLine; line <= node.source.endLine; line += 1) lineMap.set(line, [...(lineMap.get(line) ?? []), node]);
  const severityByLine = new Map<number, 'warning' | 'error'>();
  for (const item of diagnostics) if (item.sourceRange && (item.severity === 'warning' || item.severity === 'error')) {
    for (let line = item.sourceRange.startLine; line <= item.sourceRange.endLine; line += 1) {
      if (item.severity === 'error' || !severityByLine.has(line)) severityByLine.set(line, item.severity);
    }
  }
  return <section className="source-view" aria-label="攻略原文">
    {lines.map((text, index) => { const line = index + 1; const nodes = lineMap.get(line) ?? []; const selected = line === focusedLine;
      const severity = severityByLine.get(line);
      return <div key={line} id={`source-line-${line}`} className={`source-line ${selected ? 'selected' : ''} ${severity ?? ''}`} onClick={() => selectNode(nodes[0]?.id, line)}>
        <span className="line-number">{line}</span><span className="line-text">{text || ' '}</span>
        {severity && <AlertTriangle size={14} aria-label={severity === 'error' ? '此行有错误' : '此行有警告'}/>} 
        {nodes[0] && !nodes[0].ignored && <button className="line-action" title="将这段原文标记为忽略" aria-label={`忽略原文第 ${line} 行对应节点`} onClick={(event) => { event.stopPropagation(); void editNode(nodes[0]!.id, { ignored: true }); }}><EyeOff size={14}/></button>}
      </div>;
    })}
  </section>;
}
