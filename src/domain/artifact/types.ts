export type ArtifactStatus = "draft" | "ready" | "superseded" | "archived";

export type ArtifactResourceType =
  | "document"
  | "report"
  | "dataset"
  | "media"
  | "state"
  | "tool"
  | "other";

export interface ArtifactRecord {
  id: string;
  workItemId?: string | null;
  revision?: number;
  title: string;
  kind: string;
  status: ArtifactStatus;
  ownerActorId?: string | null;
  providerId?: string | null;
  sourceActorId?: string | null;
  sourceName?: string | null;
  sourcePath?: string;
  sourceUrl?: string;
  summary?: string;
  content?: string | null;
  resourceType?: ArtifactResourceType;
  resourceTags?: string[];
  createdAt: number;
  updatedAt: number;
}

export type SharedKnowledgeKind =
  | "canon"
  | "responsibility"
  | "roadmap"
  | "workflow"
  | "foreshadow"
  | "staffing"
  | "technology"
  | "operations"
  | "summary";

export type SharedKnowledgeStatus = "active" | "watch" | "draft";

export interface SharedKnowledgeItem {
  id: string;
  kind: SharedKnowledgeKind;
  title: string;
  summary: string;
  details?: string;
  content?: string;
  ownerAgentIds?: string[];
  source?: "seeded" | "derived" | "manual" | "imported";
  sourceAgentId?: string;
  sourceRequestId?: string;
  sourceArtifactId?: string;
  sourcePath?: string;
  sourceUrl?: string;
  transport?: "company_report" | "sessions_send" | "inferred";
  acceptedAt?: number;
  acceptanceMode?: "auto";
  status: SharedKnowledgeStatus;
  updatedAt: number;
}

export interface RetrospectiveRecord {
  id: string;
  periodLabel: string;
  summary: string;
  wins: string[];
  risks: string[];
  actionItems: string[];
  generatedAt: number;
}
