import { FileJson, FileUp } from 'lucide-react';
import { useRef, useState } from 'react';
import { createProject, namespacedNodeId } from '../../domain/project';
import { applyPositions, layoutGuide } from '../../layout/elkLayout';
import { parseGuide } from '../../parser';
import { projectRepository } from '../../storage/repository';
import { useProjectListStore } from '../../stores/projectListStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';

const demo = `# 星灯町体验路线
序章：抵达星灯町
阅读开场剧情
SAVE 1
1. 前往旧书店
与少女交换线索
TRUE END
LOAD 1
2. 去河边散步
确认最后的约定
GOOD END`;

export function NewProjectPanel({ onCreated }: { onCreated?: () => void }) {
  const openProject = useWorkspaceStore((state) => state.open);
  const replaceSummary = useProjectListStore((state) => state.replaceSummary);
  const sourceInput = useRef<HTMLTextAreaElement>(null); const fileInput = useRef<HTMLInputElement>(null); const [sourceFileName, setSourceFileName] = useState<string>();
  const loadTextFile = async (file?: File) => {
    if (!file) return;
    const text = await file.text(); if (sourceInput.current) sourceInput.current.value = text; setSourceFileName(file.name);
  };
  const create = async (form: HTMLFormElement, useDemo = false) => {
    const data = new FormData(form); const title = String(data.get('title') || '未命名攻略').trim(); const rawText = useDemo ? demo : String(data.get('source') || '');
    const parsed = parseGuide(rawText); if (!rawText.trim()) throw new Error('请先粘贴攻略文本');
    let guide = parsed.graph;
    try { guide = applyPositions(guide, await layoutGuide(guide)); } catch { /* Keep a usable graph when layout fails. */ }
    const project = createProject(title || '未命名攻略', rawText, guide);
    const idMap = new Map(parsed.graph.nodes.map((node) => [node.id, namespacedNodeId(project.id, node)]));
    const diagnostics = parsed.diagnostics.map((item) => ({ ...item, relatedNodeIds: item.relatedNodeIds?.map((id) => idMap.get(id) ?? id) }));
    await projectRepository.save(project); replaceSummary(project); openProject(project, diagnostics); onCreated?.();
  };
  return <section className="welcome-panel">
    <header className="welcome-copy"><h1>新建攻略项目</h1><p>输入项目名称并粘贴纯文本攻略。数据只保存在本机。</p></header>
    <form onSubmit={(event) => { event.preventDefault(); void create(event.currentTarget).catch((error: unknown) => alert(error instanceof Error ? error.message : '创建失败')); }}>
      <label>项目名称<input name="title" placeholder="例如：星灯町全路线" autoFocus/></label>
      <div className="source-field"><div className="source-field-header"><label htmlFor="guide-source">攻略原文</label><button type="button" className="text-upload" onClick={() => fileInput.current?.click()}><FileUp size={15}/>上传 TXT</button></div><input ref={fileInput} hidden type="file" accept="text/plain,.txt" aria-label="上传 TXT 文件" onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; void loadTextFile(file).catch((error: unknown) => alert(error instanceof Error ? error.message : 'TXT 文件读取失败')); }}/><textarea ref={sourceInput} id="guide-source" name="source" rows={13} placeholder="在这里粘贴纯文本攻略…"/>{sourceFileName && <small className="source-file-name" title={sourceFileName}>已载入：{sourceFileName}</small>}</div>
      <div className="welcome-actions"><button type="submit" className="primary">创建项目</button><button type="button" onClick={(event) => void create(event.currentTarget.form as HTMLFormElement, true)}><FileJson size={16}/>载入示例</button></div>
    </form>
  </section>;
}
