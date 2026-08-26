import { stableId } from '../domain/model';
import type { NormalizedLine } from './types';

const fullWidth = (value: string) => value.replace(/[！-～]/g, (character) => String.fromCharCode(character.charCodeAt(0) - 0xfee0)).replace(/　/g, ' ');

export function normalizeText(rawText: string): NormalizedLine[] {
  const canonical = rawText.replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ');
  const sourceLines = canonical.split('\n');
  return sourceLines.map((original, offset) => {
    const leading = original.match(/^[\t ]*/)?.[0] ?? '';
    const indentColumns = [...leading].reduce((sum, character) => sum + (character === '\t' ? 2 : 1), 0);
    const content = fullWidth(original.slice(leading.length)).replace(/[ \t]+/g, ' ').trimEnd();
    return {
      id: stableId('line', `${offset + 1}:${original}`), original, normalized: content,
      lineNumber: offset + 1, indent: Math.floor(indentColumns / 2),
    };
  });
}
