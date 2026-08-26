import { z } from 'zod';

export const GUIDE_NODE_KINDS = [
  'root', 'section', 'step', 'choice_group', 'choice', 'save', 'load',
  'ending', 'condition', 'note',
] as const;
export const GUIDE_EDGE_KINDS = ['progress', 'choice', 'load_reference', 'unlock'] as const;
export const ENDING_TYPES = ['good', 'bad', 'normal', 'true', 'unknown'] as const;

export type GuideNodeKind = (typeof GUIDE_NODE_KINDS)[number];
export type GuideEdgeKind = (typeof GUIDE_EDGE_KINDS)[number];
export type EndingType = (typeof ENDING_TYPES)[number];

export interface SourceRange { startLine: number; endLine: number }
export interface GuideNode {
  id: string;
  kind: GuideNodeKind;
  label: string;
  detail?: string;
  saveSlot?: string;
  endingType?: EndingType;
  source?: SourceRange;
  parseConfidence: number;
  parseWarnings: string[];
  userEdited: boolean;
  ignored?: boolean;
  position?: { x: number; y: number };
}
export interface GuideEdge {
  id: string;
  source: string;
  target: string;
  kind: GuideEdgeKind;
  label?: string;
  condition?: string;
}
export interface GuideDocument { nodes: GuideNode[]; edges: GuideEdge[] }

export type ProgressEvent =
  | { id: string; type: 'start'; nodeId: string; timestamp: number }
  | { id: string; type: 'advance'; fromNodeId: string; toNodeId: string; edgeId: string; timestamp: number }
  | { id: string; type: 'load'; fromNodeId: string; saveNodeId: string; timestamp: number }
  | { id: string; type: 'rollback'; toNodeId: string; timestamp: number };

export interface PlaySession {
  id: string;
  name: string;
  currentNodeId?: string;
  visitedNodeIds: string[];
  chosenEdgeIds: string[];
  completedEndingNodeIds: string[];
  history: ProgressEvent[];
  createdAt: number;
  updatedAt: number;
}

export interface GalNaviProject {
  schemaVersion: number;
  id: string;
  title: string;
  source: { rawText: string; format: 'plain_text' };
  guide: GuideDocument;
  sessions: PlaySession[];
  activeSessionId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ParserDiagnostic {
  id: string;
  severity: 'info' | 'warning' | 'error';
  code: string;
  message: string;
  sourceRange?: SourceRange;
  relatedNodeIds?: string[];
  suggestedFix?: string;
}

const sourceRangeSchema = z.object({ startLine: z.number().int().positive(), endLine: z.number().int().positive() })
  .refine((range) => range.endLine >= range.startLine, '结束行不能早于起始行');
export const guideNodeSchema = z.object({
  id: z.string().min(1), kind: z.enum(GUIDE_NODE_KINDS), label: z.string().min(1),
  detail: z.string().optional(), saveSlot: z.string().optional(), endingType: z.enum(ENDING_TYPES).optional(),
  source: sourceRangeSchema.optional(), parseConfidence: z.number().min(0).max(1),
  parseWarnings: z.array(z.string()), userEdited: z.boolean(),
  ignored: z.boolean().optional(),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
});
export const guideEdgeSchema = z.object({
  id: z.string().min(1), source: z.string().min(1), target: z.string().min(1),
  kind: z.enum(GUIDE_EDGE_KINDS), label: z.string().optional(), condition: z.string().optional(),
});
export const guideDocumentSchema = z.object({ nodes: z.array(guideNodeSchema), edges: z.array(guideEdgeSchema) });
const progressEventSchema = z.discriminatedUnion('type', [
  z.object({ id: z.string(), type: z.literal('start'), nodeId: z.string(), timestamp: z.number() }),
  z.object({ id: z.string(), type: z.literal('advance'), fromNodeId: z.string(), toNodeId: z.string(), edgeId: z.string(), timestamp: z.number() }),
  z.object({ id: z.string(), type: z.literal('load'), fromNodeId: z.string(), saveNodeId: z.string(), timestamp: z.number() }),
  z.object({ id: z.string(), type: z.literal('rollback'), toNodeId: z.string(), timestamp: z.number() }),
]);
export const playSessionSchema = z.object({
  id: z.string(), name: z.string().min(1), currentNodeId: z.string().optional(),
  visitedNodeIds: z.array(z.string()), chosenEdgeIds: z.array(z.string()),
  completedEndingNodeIds: z.array(z.string()), history: z.array(progressEventSchema),
  createdAt: z.number(), updatedAt: z.number(),
});
export const galNaviProjectSchema = z.object({
  schemaVersion: z.literal(1), id: z.string().min(1), title: z.string().min(1),
  source: z.object({ rawText: z.string(), format: z.literal('plain_text') }),
  guide: guideDocumentSchema, sessions: z.array(playSessionSchema), activeSessionId: z.string().optional(),
  createdAt: z.number(), updatedAt: z.number(),
});

export const CURRENT_SCHEMA_VERSION = 1;

export function stableId(prefix: string, input: string): string {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}-${(hash >>> 0).toString(36)}`;
}

export function unique<T>(items: T[]): T[] { return [...new Set(items)]; }
