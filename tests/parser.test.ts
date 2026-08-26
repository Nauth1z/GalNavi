import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeText, parseGuide, tokenizeLines } from '../src/parser';

describe('parser pipeline', () => {
  it('keeps the complete README guide example compatible with every text element', () => {
    const readme = readFileSync(resolve(import.meta.dirname, '../README.md'), 'utf8');
    const sample = readme.match(/### 完整标准文字攻略示例[\s\S]*?```text\r?\n([\s\S]*?)\r?\n```/)?.[1];
    expect(sample).toBeDefined();

    const result = parseGuide(sample!);
    const kinds = new Set(result.graph.nodes.map((node) => node.kind));
    const endingTypes = new Set(result.graph.nodes.filter((node) => node.kind === 'ending').map((node) => node.endingType));

    expect(kinds).toEqual(new Set(['root', 'section', 'step', 'choice_group', 'choice', 'save', 'load', 'condition', 'note', 'ending']));
    expect(endingTypes).toEqual(new Set(['good', 'bad', 'normal', 'true', 'unknown']));
    expect(result.stats.saves).toBe(3);
    expect(result.stats.loads).toBe(2);
    expect(result.graph.edges.filter((edge) => edge.kind === 'load_reference')).toHaveLength(2);
    expect(result.stats.warnings).toBe(0);
    expect(result.stats.errors).toBe(0);

    const secondPlaythrough = result.graph.nodes.filter((node) => node.label === '二周目');
    const chapter = result.graph.nodes.find((node) => node.label === '第一章 再会');
    const note = result.graph.nodes.find((node) => node.label.startsWith('NOTE') && node.label.includes('二周目'));
    const condition = result.graph.nodes.find((node) => node.label.startsWith('前提') && node.label.includes('已经完成'));
    const save = result.graph.nodes.find((node) => node.saveSlot === '2' && node.kind === 'save');
    expect(secondPlaythrough).toHaveLength(1);
    expect(note?.kind).toBe('note');
    expect(condition?.kind).toBe('condition');
    expect(result.graph.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: secondPlaythrough[0]?.id, target: chapter?.id, kind: 'progress' }),
      expect.objectContaining({ source: chapter?.id, target: note?.id, kind: 'progress' }),
      expect.objectContaining({ source: note?.id, target: condition?.id, kind: 'progress' }),
      expect.objectContaining({ source: condition?.id, target: save?.id, kind: 'progress' }),
    ]));
  });

  it('keeps explicit conditions as conditions even when they mention an ending', () => {
    const [token] = tokenizeLines(normalizeText('条件：完成 GOOD END 后解锁'));
    expect(token?.kind).toBe('condition');
    expect(parseGuide('条件：完成 GOOD END 后解锁').graph.nodes.find((node) => node.source?.startLine === 1)?.kind).toBe('condition');
  });

  it.each([
    ['standard SAVE/LOAD', 'SAVE 01\n继续剧情\nLOAD 01', 1, 1],
    ['Chinese SAVE/LOAD', '存档 01\n继续剧情\n读取存档1', 1, 1],
    ['Japanese SAVE/LOAD', 'セーブ 01\n進む\nロード 01', 1, 1],
    ['quick SAVE/LOAD', 'QS 01\n继续\nQL 01', 1, 1],
  ])('%s', (_name, text, saves, loads) => {
    const result = parseGuide(text);
    expect(result.stats.saves).toBe(saves);
    expect(result.stats.loads).toBe(loads);
    expect(result.graph.edges.filter((edge) => edge.kind === 'load_reference')).toHaveLength(1);
  });

  it('keeps every choice continuation as an independent node', () => {
    const result = parseGuide('序章\n1. 左边\n2、右边\n共同剧情\nTRUE END');
    const group = result.graph.nodes.find((node) => node.kind === 'choice_group');
    expect(group).toBeDefined();
    expect(result.graph.edges.filter((edge) => edge.source === group?.id && edge.kind === 'choice')).toHaveLength(2);
    const continuations = result.graph.nodes.filter((node) => node.label === '共同剧情');
    expect(continuations).toHaveLength(2);
    expect(new Set(continuations.map((node) => node.id)).size).toBe(2);
    expect(result.stats.endings).toBe(2);
  });

  it('handles indentation, mixed full-width punctuation and CRLF', () => {
    const lines = normalizeText('第一章\r\n\t（１）向左\r\n\t（２）向右');
    expect(lines[1]?.indent).toBe(1);
    const tokens = tokenizeLines(lines);
    expect(tokens.filter((token) => token.kind === 'choice')).toHaveLength(2);
  });

  it('reports duplicate saves and ambiguous load without guessing', () => {
    const result = parseGuide('SAVE 1\n剧情甲\nSAVE 01\n剧情乙\nLOAD 1');
    expect(result.diagnostics.some((item) => item.code === 'DUPLICATE_SAVE_SLOT')).toBe(true);
    expect(result.diagnostics.some((item) => item.code === 'AMBIGUOUS_LOAD')).toBe(true);
    expect(result.graph.edges.some((edge) => edge.kind === 'load_reference')).toBe(false);
  });

  it('reports unmatched load', () => {
    expect(parseGuide('LOAD 99').diagnostics.some((item) => item.code === 'UNMATCHED_LOAD')).toBe(true);
  });

  it('recognizes bracket-wrapped save/load markers with trailing notes', () => {
    const result = parseGuide('【存档 1】\n剧情\n【LOAD 1】（从这里继续）');
    expect(result.stats.saves).toBe(1); expect(result.stats.loads).toBe(1);
    expect(result.graph.edges.filter((edge) => edge.kind === 'load_reference')).toHaveLength(1);
  });

  it('recognizes an inline bracketed load as a lower-confidence reference', () => {
    const result = parseGuide('【SAVE 8】\n回收后从【LOAD 8】继续');
    expect(result.stats.loads).toBe(1);
    expect(result.graph.nodes.find((node) => node.kind === 'load')?.parseConfidence).toBeLessThan(0.8);
  });

  it('does not treat markdown list as certain choices', () => {
    const result = parseGuide('# 说明\n- 准备耳机\n- 调低音量');
    expect(result.stats.choiceGroups).toBe(0);
    expect(result.graph.nodes.filter((node) => node.kind === 'note')).toHaveLength(2);
  });

  it('recognizes several endings', () => {
    const result = parseGuide('路线甲\nGOOD END\n路线乙\nBAD END\n路线丙\n【角色结局】');
    expect(result.stats.endings).toBe(3);
  });

  it('reports empty and unusual text', () => {
    expect(parseGuide('   ').diagnostics[0]?.code).toBe('EMPTY_GUIDE');
    expect(parseGuide('🧩🧩🧩').diagnostics.some((item) => item.code === 'UNKNOWN_TEXT')).toBe(true);
  });

  it('parses an unindented natural-language route', () => {
    const result = parseGuide('序章开始\n前往图书馆\n和她交谈\nNORMAL END');
    expect(result.stats.steps).toBeGreaterThanOrEqual(2);
  });

  it.each(['第一章', '第2章 相遇', '序章', 'Chapter 3'])('treats %s as a section instead of a choice', (heading) => {
    const result = parseGuide(`${heading}\n1. 去车站\n2. 留在家里`);
    const section = result.graph.nodes.find((node) => node.source?.startLine === 1);
    expect(section?.kind).toBe('section');
    expect(result.stats.choiceGroups).toBe(1);
    expect(result.graph.edges.some((edge) => edge.source === section?.id && result.graph.nodes.find((node) => node.id === edge.target)?.kind === 'choice_group')).toBe(true);
  });

  it.each(['1月1日', '01月02日（周二）', '二月十五日', '十二月二十九日（周五）', '1/3', '第五冠', '第6冠 后日谈', '终冠', '第七幕', '第8幕 尾声', '终幕'])('moves display-only heading %s into the next step detail', (heading) => {
    const result = parseGuide(`${heading}\n继续剧情`);
    expect(result.graph.nodes.some((node) => node.source?.startLine === 1)).toBe(false);
    const step = result.graph.nodes.find((node) => node.source?.startLine === 2);
    expect(step?.kind).toBe('step');
    expect(step?.detail).toBe(heading);
  });

  it('treats Chinese-numeral and Arabic-numeral dates equivalently', () => {
    const arabic = parseGuide('2月15日\n继续剧情');
    const chinese = parseGuide('二月十五日\n继续剧情');
    const arabicStep = arabic.graph.nodes.find((node) => node.kind === 'step');
    const chineseStep = chinese.graph.nodes.find((node) => node.kind === 'step');
    expect(chineseStep?.kind).toBe(arabicStep?.kind);
    expect(chineseStep?.source).toEqual(arabicStep?.source);
    expect(chinese.graph.nodes.filter((node) => node.kind !== 'root')).toHaveLength(arabic.graph.nodes.filter((node) => node.kind !== 'root').length);
    expect(chineseStep?.detail).toBe('二月十五日');
  });

  it('combines consecutive display-only headings on the next section or step', () => {
    const result = parseGuide('第一幕\n1月1日\n第一章');
    expect(result.graph.nodes.filter((node) => node.kind !== 'root')).toHaveLength(1);
    expect(result.graph.nodes.find((node) => node.kind === 'section')?.detail).toBe('第一幕\n1月1日');
  });

  it.each([
    ['二周目', '二周目'], ['第二周目开始', '二周目'], ['三周目', '三周目'], ['第4周目开始', '4周目'],
    ['从头开始', '下一周目'], ['从最初开始', '下一周目'], ['返回标题画面后重新开始', '下一周目'], ['标题', '下一周目'],
  ])('starts %s as an independent playthrough root branch', (marker, expectedLabel) => {
    const result = parseGuide(`第一章\n执行步骤甲\nGOOD END\n${marker}\n第二幕\n执行步骤乙`);
    const root = result.graph.nodes.find((node) => node.kind === 'root')!;
    const second = result.graph.nodes.find((node) => node.source?.startLine === 4);
    const following = result.graph.nodes.find((node) => node.label === '执行步骤乙');
    expect(second?.kind).toBe('section');
    expect(second?.label).toBe(expectedLabel);
    expect(result.graph.edges).toContainEqual(expect.objectContaining({ source: root.id, target: second?.id, kind: 'unlock' }));
    expect(result.graph.edges).toContainEqual(expect.objectContaining({ source: second?.id, target: following?.id, kind: 'progress' }));
    expect(following?.detail).toBe('第二幕');
  });

  it('collapses at most five consecutive next-playthrough prompts into one root branch', () => {
    const result = parseGuide('第一章\nGOOD END\n从头开始\n从最初开始\n标题\n返回标题画面\n二周目\n三周目\n继续剧情');
    const playthroughs = result.graph.nodes.filter((node) => node.source && node.source.startLine >= 3 && node.kind === 'section');
    expect(playthroughs).toHaveLength(2);
    expect(playthroughs[0]?.label).toBe('下一周目');
    expect(playthroughs[0]?.source).toEqual({ startLine: 3, endLine: 7 });
    expect(playthroughs[0]?.detail?.split('\n')).toHaveLength(5);
    expect(playthroughs[1]?.label).toBe('三周目');
  });

  it('does not recognize SAVE or LOAD inside parentheses', () => {
    const result = parseGuide('(SAVE 1)\n执行（从【LOAD 1】继续）\nSAVE 2（普通备注）');
    expect(result.graph.nodes.find((node) => node.source?.startLine === 1)?.kind).toBe('step');
    expect(result.graph.nodes.find((node) => node.source?.startLine === 2)?.kind).toBe('step');
    expect(result.graph.nodes.find((node) => node.source?.startLine === 3)?.kind).toBe('save');
    expect(result.stats.saves).toBe(1);
    expect(result.stats.loads).toBe(0);
  });

  it('moves a ▼ prefixed ending behind every choice in its route block', () => {
    const result = parseGuide('▼ 角色 A GOOD END\n1月1日\n1. 去车站\n2. 留在家里\n▼ 角色 B BAD END\n第一章\n1. 接受\n2. 拒绝');
    const endings = result.graph.nodes.filter((node) => node.kind === 'ending');
    const groups = result.graph.nodes.filter((node) => node.kind === 'choice_group');
    expect(endings).toHaveLength(4); expect(groups).toHaveLength(2);
    expect(result.graph.nodes.indexOf(endings[0]!)).toBeGreaterThan(result.graph.nodes.indexOf(groups[0]!));
    expect(result.graph.nodes.indexOf(endings[0]!)).toBeLessThan(result.graph.nodes.indexOf(groups[1]!));
    expect(result.graph.nodes.indexOf(endings[2]!)).toBeGreaterThan(result.graph.nodes.indexOf(groups[1]!));
    const firstChoices = result.graph.edges.filter((edge) => edge.source === groups[0]!.id && edge.kind === 'choice').map((edge) => edge.target);
    expect(firstChoices.every((choiceId) => result.graph.edges.some((edge) => edge.source === choiceId && result.graph.nodes.find((node) => node.id === edge.target)?.kind === 'ending'))).toBe(true);
  });

  it('treats LOAD as a reference and starts a new independent branch at SAVE', () => {
    const result = parseGuide('SAVE 01\n选项 1：A\nA END\nLOAD 01\n选项 2：B\nB END');
    const save = result.graph.nodes.find((node) => node.kind === 'save');
    const load = result.graph.nodes.find((node) => node.kind === 'load');
    const optionA = result.graph.nodes.find((node) => node.label === 'A');
    const optionB = result.graph.nodes.find((node) => node.label === 'B');
    expect(save && load && optionA && optionB).toBeTruthy();
    expect(result.graph.edges).toContainEqual(expect.objectContaining({ source: load!.id, target: save!.id, kind: 'load_reference' }));
    expect(result.graph.edges).toContainEqual(expect.objectContaining({ source: save!.id, target: optionA!.id, kind: 'progress' }));
    expect(result.graph.edges).toContainEqual(expect.objectContaining({ source: save!.id, target: optionB!.id, kind: 'progress' }));
    expect(result.graph.edges.some((edge) => edge.target === load!.id && edge.kind !== 'load_reference')).toBe(false);
  });

  it('keeps repeated route text as independent source-scoped nodes', () => {
    const result = parseGuide('A 路线\n去图书馆\n与她交谈\nA END\nB 路线\n去图书馆\n与她交谈\nB END');
    for (const label of ['去图书馆', '与她交谈']) {
      const matches = result.graph.nodes.filter((node) => node.label === label);
      expect(matches).toHaveLength(2);
      expect(matches[0]!.id).not.toBe(matches[1]!.id);
      expect(matches[0]!.source).not.toEqual(matches[1]!.source);
    }
  });

  it('keeps an ordinary trailing ending in its original position', () => {
    const result = parseGuide('GOOD END\n1. 接受邀请\n2. 拒绝邀请');
    const ending = result.graph.nodes.find((node) => node.kind === 'ending');
    const group = result.graph.nodes.find((node) => node.kind === 'choice_group');
    expect(result.graph.nodes.indexOf(ending!)).toBeLessThan(result.graph.nodes.indexOf(group!));
  });
});
