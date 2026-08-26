import { stableId } from '../domain/model';
import type { GuideToken, InferredBlock, TokenBlock } from './types';

export function groupBlocks(tokens: GuideToken[]): TokenBlock[] {
  const meaningful = tokens.filter((token) => token.kind !== 'blank');
  const blocks: TokenBlock[] = [];
  for (let index = 0; index < meaningful.length;) {
    const token = meaningful[index];
    if (token?.kind === 'choice') {
      const choices: GuideToken[] = [token];
      let cursor = index + 1;
      while (meaningful[cursor]?.kind === 'choice' && meaningful[cursor]?.indent === token.indent) {
        choices.push(meaningful[cursor] as GuideToken); cursor += 1;
      }
      if (choices.length >= 2) {
        blocks.push({ id: stableId('block', choices.map((item) => item.id).join(':')), kind: 'choice_group', tokens: choices });
        index = cursor; continue;
      }
    }
    if (token) blocks.push({ id: stableId('block', token.id), kind: 'single', tokens: [token] });
    index += 1;
  }
  return blocks;
}

export function inferStructure(blocks: TokenBlock[]): InferredBlock[] {
  return deferPrefixedEndings(blocks).map((block) => ({
    ...block,
    parentIndent: Math.max(0, Math.min(...block.tokens.map((token) => token.indent)) - 1),
    warnings: block.kind === 'choice_group' && block.tokens.some((token) => token.confidence < 0.7)
      ? ['项目符号可能是普通列表，请确认是否为游戏选项'] : [],
  }));
}

/**
 * Some guides put `▼ Ending name` before the choices that lead to that ending.
 * Treat the marker as a route goal: keep its source metadata, but build it after
 * every block in that route (bounded by the next prefixed ending or EOF).
 */
export function deferPrefixedEndings(blocks: TokenBlock[]): TokenBlock[] {
  const ordered: TokenBlock[] = [];
  let deferredEnding: TokenBlock | undefined;
  for (const block of blocks) {
    if (isPrefixedEnding(block)) {
      if (deferredEnding) ordered.push(deferredEnding);
      deferredEnding = block;
      continue;
    }
    ordered.push(block);
  }
  if (deferredEnding) ordered.push(deferredEnding);
  return ordered;
}

function isPrefixedEnding(block: TokenBlock): boolean {
  const token = block.kind === 'single' ? block.tokens[0] : undefined;
  return token?.kind === 'ending' && token.raw.trimStart().startsWith('▼');
}
