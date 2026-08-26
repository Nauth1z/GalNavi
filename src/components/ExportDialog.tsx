import { Download, History, RotateCcw, X } from 'lucide-react';

interface ExportDialogProps {
  exporting: boolean;
  onClose: () => void;
  onExport: (includeProgress: boolean) => void;
}

export function ExportDialog({ exporting, onClose, onExport }: ExportDialogProps) {
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => {
    if (event.target === event.currentTarget && !exporting) onClose();
  }}>
    <section className="dialog export-dialog" role="dialog" aria-modal="true" aria-labelledby="export-title">
      <header><Download size={18}/><h2 id="export-title">导出项目</h2><button className="icon-button" aria-label="关闭导出选项" disabled={exporting} onClick={onClose}><X size={18}/></button></header>
      <p>选择导出的项目文件是否携带当前游玩进度。此操作不会改变当前项目。</p>
      <div className="export-options">
        <button aria-label="携带游玩进度导出" disabled={exporting} onClick={() => onExport(true)}>
          <History size={18}/><span><strong>携带游玩进度</strong><small>保留当前位置、最近路径、已访问节点和分支选择</small></span>
        </button>
        <button aria-label="不携带游玩进度导出" disabled={exporting} onClick={() => onExport(false)}>
          <RotateCcw size={18}/><span><strong>不携带游玩进度</strong><small>导入后从 root 开始，所有游玩记录归零</small></span>
        </button>
      </div>
      {exporting && <span className="export-pending" role="status">正在准备导出文件…</span>}
    </section>
  </div>;
}
