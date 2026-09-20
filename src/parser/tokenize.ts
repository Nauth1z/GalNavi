import type { EndingType } from '../domain/model';
import { stableId } from '../domain/model';
import type { GuideToken, NormalizedLine, TokenKind } from './types';

const savePattern = /^\s*(?:[◆◇■□▶▷►★☆●・-]\s*)?(?:[【[]\s*)?(?:SAVE|セーブ|存档点?|QS)(?:\s*(?:NO\.?|编号|[:：#-])?\s*([0-9]+))?\s*(?:[】\]])?\s*(?:$|[:：]|[（(])/i;
const loadPattern = /^\s*(?:[◆◇■□▶▷►★☆●・-]\s*)?(?:[【[]\s*)?(?:LOAD|ロード|读档|读取存档|QL)(?:\s*(?:NO\.?|编号|[:：#-])?\s*([0-9]+))?\s*(?:[】\]])?\s*(?:$|[:：]|[（(])/i;
const inlineSavePattern = /[【[]\s*(?:SAVE|セーブ|存档点?|QS)\s*([0-9]+)\s*[】\]]/i;
const inlineLoadPattern = /[【[]\s*(?:LOAD|ロード|读档|读取存档|QL)\s*([0-9]+)\s*[】\]]/i;
const calendarHeadingPattern = /^\s*(?:(?:[0-9]{1,2}|[〇零一二三四五六七八九十]{1,3})\s*月\s*(?:[0-9]{1,2}|[〇零一二三四五六七八九十]{1,3})\s*日|[0-9]{1,2}\s*[/.\-]\s*[0-9]{1,2}|[0-9]{1,2}\s*日目)(?:\s*(?:[（(][^）)]*[）)]|[:：—-]?\s*[^\d].*)?)?\s*$/u;
const chapterHeadingPattern = /^\s*(?:(?:第?[一二三四五六七八九十百0-9]+|序|终|終|最终|最終)[章节幕冠话話篇部日]|(?:CHAPTER|CHAP\.?|DAY|ROUTE)\s*[0-9IVX一二三四五六七八九十]+)(?:\s*[:：—-]?\s*.*)?$/iu;
const headingPattern = /^\s*(?:#{1,6}\s+|【[^】]+】\s*$|\[[^\]]+\]\s*$|.+(?:路线|ルート|Route)\s*$)/i;
const conditionPattern = /^\s*(?:条件|前提|要求|解锁|IF|WHEN|※.*(?:后|时|完成))\s*[:：]?/i;
const explicitChoicePattern = /^\s*(?:(\d+)\s*[.、．)]|[（(](\d+)[）)]|选择\s*[:：]|选项\s*(\d+)?\s*[:：])\s*(.+)$/i;
const bulletChoicePattern = /^\s*([・●◆◇■□▶▷►★☆])\s*(.+)$/;
const markdownBulletPattern = /^\s*[-*+]\s+(.+)$/;
const numberedEndingPattern = /\bEND(?:ING)?(?:\s*(?:(?:NO\.?|[#:_-])\s*)?\d+)?\b/i;

export function tokenizeLines(lines: NormalizedLine[]): GuideToken[] {
  return lines.map((line) => tokenizeLine(line));
}

function tokenizeLine(line: NormalizedLine): GuideToken {
  const source = { startLine: line.lineNumber, endLine: line.lineNumber };
  const base = { id: stableId('token', `${line.lineNumber}:${line.normalized}`), raw: line.original, text: line.normalized.trim(), source, indent: line.indent };
  if (!line.normalized.trim()) return { ...base, kind: 'blank', confidence: 1 };
  const referenceText = maskParenthesizedText(line.normalized);
  const save = referenceText.match(savePattern);
  if (save) return { ...base, kind: 'save', confidence: 0.98, metadata: { slot: normalizeSlot(save[1]) } };
  const load = referenceText.match(loadPattern);
  if (load) return { ...base, kind: 'load', confidence: 0.98, metadata: { slot: normalizeSlot(load[1]) } };
  const inlineSave = referenceText.match(inlineSavePattern);
  if (inlineSave) return { ...base, kind: 'save', confidence: 0.76, metadata: { slot: normalizeSlot(inlineSave[1]) } };
  const inlineLoad = referenceText.match(inlineLoadPattern);
  if (inlineLoad) return { ...base, kind: 'load', confidence: 0.76, metadata: { slot: normalizeSlot(inlineLoad[1]) } };
  if (conditionPattern.test(line.normalized)) return { ...base, kind: 'condition', confidence: 0.82 };
  const ending = inferEnding(line.normalized);
  if (ending) return { ...base, kind: 'ending', confidence: ending.confidence, metadata: { endingType: ending.type } };
  if (calendarHeadingPattern.test(line.normalized)) return { ...base, kind: 'heading', confidence: 0.94 };
  if (chapterHeadingPattern.test(line.normalized)) return { ...base, kind: 'heading', confidence: 0.93 };
  if (headingPattern.test(line.normalized)) return { ...base, kind: 'heading', confidence: 0.86 };
  const choice = line.normalized.match(explicitChoicePattern);
  if (choice) return { ...base, kind: 'choice', text: choice[4]?.trim() || line.normalized.trim(), confidence: 0.93, metadata: { marker: choice[1] ?? choice[2] ?? choice[3] } };
  const bullet = line.normalized.match(bulletChoicePattern);
  if (bullet) return { ...base, kind: 'choice', text: bullet[2]?.trim() ?? line.normalized.trim(), confidence: 0.64, metadata: { marker: bullet[1] } };
  const markdown = line.normalized.match(markdownBulletPattern);
  if (markdown) return { ...base, kind: 'note', text: markdown[1]?.trim() ?? line.normalized.trim(), confidence: 0.55, metadata: { marker: 'markdown-list' } };
  if (/^(?:注|备注|NOTE|※)/i.test(line.normalized)) return { ...base, kind: 'note', confidence: 0.82 };
  if (/^[\p{L}\p{N}“”‘’「」『』【】《》〈〉…,.，。!?！？:：;；()（）\[\]\s\-—+]+$/u.test(line.normalized)) return { ...base, kind: 'instruction', confidence: 0.72 };
  if (/[\p{L}\p{N}]/u.test(line.normalized)) return { ...base, kind: 'instruction', confidence: 0.58 };
  return { ...base, kind: 'unknown', confidence: 0.3 };
}

export function isDisplayOnlyHeading(text: string): boolean {
  const normalized = text.trim();
  return calendarHeadingPattern.test(normalized)
    || /^\s*(?:第?[一二三四五六七八九十百0-9]+|序|终|終|最终|最終)[幕冠](?:\s*[:：—-]?\s*.*)?$/u.test(normalized);
}

export function isPlaythroughRestart(text: string): boolean {
  return getPlaythroughLabel(text) !== undefined;
}

export function getPlaythroughLabel(text: string): string | undefined {
  const explicit = text.match(/(?:第)?([一二三四五六七八九十百0-9]+)\s*周目/iu);
  if (explicit?.[1]) return `${explicit[1]}周目`;
  if (/(?:从头开始|從頭開始|从最初开始|從最初開始|(?:回到|返回|进入|進入|从|從)(?:标题|標題)(?:画面|畫面)?|(?:标题|標題)(?:画面|畫面)?(?:开始|開始|继续|繼續))/iu.test(text)
    || /^\s*(?:标题|標題)(?:画面|畫面)?\s*$/iu.test(text)) return '下一周目';
  return undefined;
}

function maskParenthesizedText(text: string): string {
  let depth = 0;
  let masked = '';
  for (const character of text) {
    if (character === '(') { depth += 1; masked += ' '; continue; }
    if (character === ')' && depth > 0) { depth -= 1; masked += ' '; continue; }
    masked += depth > 0 ? ' ' : character;
  }
  return masked;
}

function normalizeSlot(slot?: string): string | undefined {
  if (!slot) return undefined;
  const numeric = Number.parseInt(slot, 10);
  return Number.isNaN(numeric) ? slot.toUpperCase() : String(numeric);
}

function inferEnding(text: string): { type: EndingType; confidence: number } | undefined {
  if (/(?:TRUE\s*END|真结局|真エンド|トゥルーエンド)/i.test(text)) return { type: 'true', confidence: 0.97 };
  if (/(?:GOOD\s*END|好结局|グッドエンド)/i.test(text)) return { type: 'good', confidence: 0.97 };
  if (/(?:BAD\s*END|坏结局|バッドエンド)/i.test(text)) return { type: 'bad', confidence: 0.97 };
  if (/(?:NORMAL\s*END|普通结局|ノーマルエンド)/i.test(text)) return { type: 'normal', confidence: 0.97 };
  if (/(?:【[^】]*结局】|结局|エンド)/i.test(text) || numberedEndingPattern.test(text)) return { type: 'unknown', confidence: 0.82 };
  return undefined;
}

export const tokenKindToNodeKind: Record<Exclude<TokenKind, 'blank'>, 'section' | 'step' | 'choice' | 'save' | 'load' | 'ending' | 'condition' | 'note'> = {
  heading: 'section', save: 'save', load: 'load', choice: 'choice', ending: 'ending',
  condition: 'condition', instruction: 'step', note: 'note', unknown: 'note',
};
