import type { EndingType, GuideDocument, ParserDiagnostic, SourceRange } from '../domain/model';

export type TokenKind = 'blank' | 'heading' | 'save' | 'load' | 'choice' | 'ending' | 'condition' | 'instruction' | 'note' | 'unknown';
export interface NormalizedLine {
  id: string; original: string; normalized: string; lineNumber: number; indent: number;
}
export interface GuideToken {
  id: string; kind: TokenKind; raw: string; text: string; source: SourceRange; indent: number;
  confidence: number; metadata?: { slot?: string; endingType?: EndingType; marker?: string };
}
export interface TokenBlock { id: string; kind: 'single' | 'choice_group'; tokens: GuideToken[] }
export interface InferredBlock extends TokenBlock { parentIndent: number; warnings: string[] }
export interface ParseStats {
  nodes: number; steps: number; choiceGroups: number; saves: number; loads: number; endings: number; warnings: number; errors: number;
}
export interface ParseResult {
  graph: GuideDocument; diagnostics: ParserDiagnostic[]; tokens: GuideToken[]; stats: ParseStats;
}
