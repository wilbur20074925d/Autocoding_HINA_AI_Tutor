export interface KnowledgeMapNode {
  id: string;
  label: string;
  category: 'concept' | 'process' | 'evidence' | 'question' | 'task' | 'theory' | 'definition' | 'other';
  importance: number;
  description?: string;
  sources?: string[];
  tags?: string[];
}

export interface KnowledgeMapEdge {
  id: string;
  source: string;
  target: string;
  relation: 'supports' | 'contradicts' | 'requires' | 'causes' | 'part_of' | 'leads_to' | 'example_of' | 'related_to' | 'other';
  confidence: number;
  explanation?: string;
}

export interface KnowledgeMapInsights {
  summary: string;
  keyThemes: string[];
  blindSpots: string[];
  recommendedQuestions: string[];
  suggestedNextSteps: string[];
}

export interface KnowledgeMapSnapshot {
  noteId: string;
  noteTitle: string;
  noteVersion: number;
  generatedAt: string;
  nodes: KnowledgeMapNode[];
  edges: KnowledgeMapEdge[];
  insights: KnowledgeMapInsights;
  keywords: string[];
  metadata?: Record<string, unknown>;
}

