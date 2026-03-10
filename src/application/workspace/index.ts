import { useEffect, useMemo, useState } from "react";
import { useArtifactApp, useWorkspaceArtifactsQuery } from "../artifact";
import { formatKnowledgeKindLabel, resolveCompanyKnowledge } from "../artifact/shared-knowledge";
import {
  buildWorkspaceToolRequest,
  categorizeWorkspaceResource,
  getCompanyWorkspaceApps,
  summarizeConsistencyAnchors,
  type WorkspaceResourceKind,
} from "../company/workspace-apps";
import { readCompanyRuntimeSnapshot, writeCompanyRuntimeSnapshot } from "../company/runtime-snapshot";
import { gateway, type AgentListEntry, useGatewayStore } from "../gateway";
import { isStrategicRequirementTopic } from "../mission/requirement-kind";
import { selectPrimaryRequirementProjection } from "../mission/requirement-aggregate";
import { isReliableWorkItemRecord } from "../mission/work-item-signal";
import type { ArtifactRecord, SharedKnowledgeItem } from "../../domain/artifact/types";
import type { Company } from "../../domain/org/types";
import type { WorkItemRecord } from "../../domain/mission/types";

export type WorkspaceFileRow = {
  key: string;
  artifactId?: string;
  agentId: string;
  agentLabel: string;
  role: string;
  workspace: string;
  name: string;
  path: string;
  previewText?: string;
  content?: string | null;
  updatedAtMs?: number;
  size?: number;
  kind: WorkspaceResourceKind;
};

export type WorkspaceKnowledgeItemRow = SharedKnowledgeItem;

export const RESOURCE_KIND_LABEL: Record<WorkspaceResourceKind, string> = {
  chapter: "正文",
  canon: "设定",
  review: "报告",
  knowledge: "知识",
  tooling: "工具",
  other: "其他",
};

export const WORKBENCH_TOOL_CARDS = [
  {
    id: "consistency-checker" as const,
    title: "让 CTO 开发一致性工具",
    summary: "围绕设定、人物、时间线和伏笔做结构化校验，避免写到后面又靠人肉回看。",
  },
  {
    id: "novel-reader" as const,
    title: "让 CTO 开发小说阅读器",
    summary: "把章节目录、审校报告和共享设定放在同一个阅读界面里，便于创作团队直接对照。",
  },
  {
    id: "chapter-review-console" as const,
    title: "让 CTO 开发章节审阅台",
    summary: "把章节状态、审校意见、终审结论和发布前检查收进一个公司内工具页。",
  },
] as const;

export type WorkspaceWorkbenchTool = (typeof WORKBENCH_TOOL_CARDS)[number]["id"];

export { useWorkspaceFileContent } from "./file-content";

export function formatWorkspaceBytes(bytes?: number): string {
  if (bytes === undefined) {
    return "--";
  }
  if (bytes === 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB"];
  const base = 1024;
  const power = Math.min(Math.floor(Math.log(bytes) / Math.log(base)), units.length - 1);
  return `${(bytes / base ** power).toFixed(power === 0 ? 0 : 1)} ${units[power]}`;
}

function getWorkspaceFilePriority(kind: WorkspaceResourceKind): number {
  switch (kind) {
    case "chapter":
      return 0;
    case "canon":
      return 1;
    case "review":
      return 2;
    case "knowledge":
      return 3;
    case "tooling":
      return 4;
    default:
      return 5;
  }
}

function buildWorkspaceRows(input: {
  employees: Array<{ agentId: string; nickname: string; role: string }>;
  filesByAgent: Record<string, { workspace: string; files: Array<Record<string, unknown>> }>;
}): WorkspaceFileRow[] {
  const rows: WorkspaceFileRow[] = [];

  for (const employee of input.employees) {
    const snapshot = input.filesByAgent[employee.agentId];
    if (!snapshot) {
      continue;
    }

    for (const file of snapshot.files ?? []) {
      const name = typeof file.name === "string" ? file.name : "";
      const path = typeof file.path === "string" ? file.path : name;
      if (!name) {
        continue;
      }
      rows.push({
        key: `${employee.agentId}:${name}`,
        agentId: employee.agentId,
        agentLabel: employee.nickname,
        role: employee.role,
        workspace: snapshot.workspace,
        name,
        path,
        content: typeof file.content === "string" ? file.content : null,
        updatedAtMs: typeof file.updatedAtMs === "number" ? file.updatedAtMs : undefined,
        size: typeof file.size === "number" ? file.size : undefined,
        kind: categorizeWorkspaceResource(name, path),
      });
    }
  }

  return rows.sort((left, right) => {
    const byKind = getWorkspaceFilePriority(left.kind) - getWorkspaceFilePriority(right.kind);
    if (byKind !== 0) {
      return byKind;
    }
    return (right.updatedAtMs ?? 0) - (left.updatedAtMs ?? 0);
  });
}

function buildArtifactMirrorRows(input: {
  employees: Array<{ agentId: string; nickname: string; role: string }>;
  artifacts: ArtifactRecord[];
}): WorkspaceFileRow[] {
  const employeeById = new Map(input.employees.map((employee) => [employee.agentId, employee]));
  return input.artifacts
    .map((artifact) => {
      const owner = artifact.sourceActorId ? employeeById.get(artifact.sourceActorId) : undefined;
      return {
        key: artifact.id,
        artifactId: artifact.id,
        agentId: artifact.sourceActorId ?? artifact.ownerActorId ?? "",
        agentLabel: owner?.nickname ?? artifact.sourceActorId ?? "公司产物",
        role: owner?.role ?? artifact.kind,
        workspace: "产品产物库",
        name: artifact.sourceName ?? artifact.title,
        path: artifact.sourcePath ?? artifact.sourceUrl ?? artifact.title,
        previewText: artifact.summary,
        content: artifact.content ?? null,
        updatedAtMs: artifact.updatedAt,
        kind: categorizeWorkspaceResource(
          artifact.sourceName ?? artifact.title,
          artifact.sourcePath ?? artifact.sourceUrl ?? artifact.title,
        ),
      } satisfies WorkspaceFileRow;
    })
    .sort((left, right) => {
      const byKind = getWorkspaceFilePriority(left.kind) - getWorkspaceFilePriority(right.kind);
      if (byKind !== 0) {
        return byKind;
      }
      return (right.updatedAtMs ?? 0) - (left.updatedAtMs ?? 0);
    });
}

export function pickDefaultWorkspaceFile(
  files: WorkspaceFileRow[],
  preferredKinds: WorkspaceResourceKind[] = ["chapter", "canon", "review", "knowledge"],
): WorkspaceFileRow | null {
  for (const kind of preferredKinds) {
    const match = files.find((file) => file.kind === kind);
    if (match) {
      return match;
    }
  }
  return null;
}

function normalizeKnowledgeTitle(value: string): string {
  return value
    .trim()
    .replace(/^#+\s*/, "")
    .replace(/[🎉🎯📚✅]/gu, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function buildKnowledgeMatcherTokens(item: SharedKnowledgeItem): string[] {
  return [
    item.title,
    item.summary,
    item.details,
    item.sourcePath,
    item.sourceUrl,
    formatKnowledgeKindLabel(item.kind),
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => normalizeKnowledgeTitle(value))
    .filter((value) => value.length >= 4);
}

export function getKnowledgeSourceFilesForItem(
  item: SharedKnowledgeItem | null,
  files: WorkspaceFileRow[],
): WorkspaceFileRow[] {
  if (!item) {
    return [];
  }
  const titleTokens = buildKnowledgeMatcherTokens(item);
  return files
    .filter((file) => file.kind === "knowledge")
    .filter((file) => {
      if (item.sourceArtifactId && file.artifactId === item.sourceArtifactId) {
        return true;
      }
      if (item.sourcePath && file.path === item.sourcePath) {
        return true;
      }
      if (item.sourceUrl && file.path === item.sourceUrl) {
        return true;
      }
      if (item.sourceAgentId && file.agentId && item.sourceAgentId !== file.agentId) {
        return false;
      }
      const haystack = normalizeKnowledgeTitle([file.name, file.path, file.previewText].filter(Boolean).join(" "));
      return titleTokens.some((token) => haystack.includes(token));
    })
    .sort((left, right) => (right.updatedAtMs ?? 0) - (left.updatedAtMs ?? 0));
}

function buildWorkspaceMirrorArtifacts(input: {
  company: Company;
  snapshots: Record<string, { workspace: string; files: Array<Record<string, unknown>> }>;
}) {
  const nextArtifacts: ArtifactRecord[] = [];
  for (const [agentId, result] of Object.entries(input.snapshots)) {
    const employee = input.company.employees.find((item) => item.agentId === agentId) ?? null;
    for (const file of result.files ?? []) {
      if (!file?.name || typeof file.name !== "string") {
        continue;
      }
      const updatedAtMs = typeof file.updatedAtMs === "number" ? file.updatedAtMs : Date.now();
      nextArtifacts.push({
        id: `workspace:${input.company.id}:${agentId}:${typeof file.path === "string" ? file.path : file.name}`,
        workItemId: null,
        title: file.name,
        kind: categorizeWorkspaceResource(
          file.name,
          typeof file.path === "string" ? file.path : file.name,
        ),
        status: "ready",
        ownerActorId: agentId,
        providerId: gateway.providerId,
        sourceActorId: agentId,
        sourceName: file.name,
        sourcePath: typeof file.path === "string" ? file.path : file.name,
        summary: employee
          ? `${employee.nickname} · ${employee.role}`
          : typeof file.path === "string"
            ? file.path
            : file.name,
        content: typeof file.content === "string" ? file.content : null,
        createdAt: updatedAtMs,
        updatedAt: updatedAtMs,
      });
    }
  }
  return nextArtifacts;
}

export function buildWorkspaceWorkbenchRequest(
  company: Company,
  tool: WorkspaceWorkbenchTool,
) {
  return buildWorkspaceToolRequest(company, tool);
}

export function useWorkspaceViewModel(input: { isPageVisible: boolean }) {
  const {
    activeCompany,
    activeWorkItems,
    activeRequirementAggregates,
    primaryRequirementId,
    activeArtifacts,
  } =
    useWorkspaceArtifactsQuery();
  const { syncArtifactMirrorRecords } = useArtifactApp();
  const connected = useGatewayStore((state) => state.connected);
  const supportsAgentFiles = useGatewayStore((state) => state.capabilities.agentFiles);
  const providerManifest = useGatewayStore((state) => state.manifest);

  const runtimeSnapshot = readCompanyRuntimeSnapshot(activeCompany?.id);
  const [agentsCache, setAgentsCache] = useState<AgentListEntry[]>(() => runtimeSnapshot?.agents ?? []);
  const [filesByAgent, setFilesByAgent] = useState<
    Record<string, { workspace: string; files: Array<Record<string, unknown>> }>
  >(() => runtimeSnapshot?.workspaceFilesByAgent ?? {});
  const [loadingIndex, setLoadingIndex] = useState(() => !runtimeSnapshot);
  const [refreshVersion, setRefreshVersion] = useState(0);

  const workspaceApps = useMemo(() => getCompanyWorkspaceApps(activeCompany), [activeCompany]);
  const shouldSyncProviderWorkspace =
    supportsAgentFiles && providerManifest.storageStrategy === "provider-files";
  const ctoEmployee =
    activeCompany?.employees.find((employee) => employee.metaRole === "cto") ?? null;

  const primaryRequirementProjection = useMemo(
    () =>
      selectPrimaryRequirementProjection({
        company: activeCompany,
        activeRequirementAggregates,
        primaryRequirementId,
        activeWorkItems,
        activeRoomRecords: [],
      }),
    [activeCompany, activeRequirementAggregates, activeWorkItems, primaryRequirementId],
  );
  const ceoConversationWorkItem = useMemo<WorkItemRecord | null>(
    () => primaryRequirementProjection.workItem,
    [primaryRequirementProjection.workItem],
  );

  const activeWorkspaceWorkItem = useMemo<WorkItemRecord | null>(() => {
    if (ceoConversationWorkItem) {
      return ceoConversationWorkItem;
    }
    const candidates = activeWorkItems
      .filter((item) => item.status !== "archived" && isReliableWorkItemRecord(item))
      .sort((left, right) => {
        const leftStrategic = Number(isStrategicRequirementTopic(left.topicKey));
        const rightStrategic = Number(isStrategicRequirementTopic(right.topicKey));
        if (leftStrategic !== rightStrategic) {
          return rightStrategic - leftStrategic;
        }
        return right.updatedAt - left.updatedAt;
      });
    return candidates[0] ?? null;
  }, [activeWorkItems, ceoConversationWorkItem]);

  const artifactBackedWorkspaceCount = useMemo(
    () =>
      activeArtifacts.filter(
        (artifact) => Boolean(artifact.content || artifact.summary || artifact.sourcePath || artifact.sourceUrl),
      ).length,
    [activeArtifacts],
  );

  useEffect(() => {
    if (!activeCompany) {
      return;
    }
    const snapshot = readCompanyRuntimeSnapshot(activeCompany.id);
    if (!snapshot) {
      return;
    }
    setAgentsCache(snapshot.agents ?? []);
    setFilesByAgent(snapshot.workspaceFilesByAgent ?? {});
    setLoadingIndex(false);
  }, [activeCompany]);

  useEffect(() => {
    if (!activeCompany) {
      return;
    }
    writeCompanyRuntimeSnapshot(activeCompany.id, {
      agents: agentsCache,
      workspaceFilesByAgent: filesByAgent,
    });
  }, [activeCompany, agentsCache, filesByAgent]);

  useEffect(() => {
    if (!activeCompany || !connected || !input.isPageVisible || !shouldSyncProviderWorkspace) {
      return;
    }

    let cancelled = false;
    const loadWorkspaceIndex = async () => {
      setLoadingIndex(true);
      try {
        const agentsResult = await gateway.listAgents();
        if (cancelled) {
          return;
        }
        setAgentsCache(agentsResult.agents ?? []);

        const snapshots = await Promise.allSettled(
          activeCompany.employees.map(async (employee) => {
            const result = await gateway.listAgentFiles(employee.agentId);
            return [employee.agentId, result] as const;
          }),
        );
        if (cancelled) {
          return;
        }

        const nextFilesByAgent: Record<string, { workspace: string; files: Array<Record<string, unknown>> }> = {};
        for (const snapshot of snapshots) {
          if (snapshot.status !== "fulfilled") {
            continue;
          }
          const [agentId, result] = snapshot.value;
          nextFilesByAgent[agentId] = {
            workspace: result.workspace,
            files: (result.files ?? []) as Array<Record<string, unknown>>,
          };
        }
        setFilesByAgent(nextFilesByAgent);
        syncArtifactMirrorRecords(
          buildWorkspaceMirrorArtifacts({ company: activeCompany, snapshots: nextFilesByAgent }),
          "workspace:",
        );
      } finally {
        if (!cancelled) {
          setLoadingIndex(false);
        }
      }
    };

    void loadWorkspaceIndex();
    const timer = window.setInterval(() => void loadWorkspaceIndex(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [
    activeCompany,
    connected,
    input.isPageVisible,
    refreshVersion,
    shouldSyncProviderWorkspace,
    syncArtifactMirrorRecords,
  ]);

  const workspaceFiles = useMemo(() => {
    if (!activeCompany) {
      return [];
    }
    const employees = activeCompany.employees.map((employee) => ({
      agentId: employee.agentId,
      nickname: employee.nickname,
      role: employee.role,
    }));
    const productRows = buildArtifactMirrorRows({
      employees,
      artifacts: activeArtifacts,
    });
    if (!shouldSyncProviderWorkspace) {
      return productRows;
    }
    const providerRows = buildWorkspaceRows({
      employees,
      filesByAgent,
    });
    const merged = new Map<string, WorkspaceFileRow>();
    for (const row of productRows) {
      merged.set(`${row.agentId}:${row.path || row.name}`, row);
    }
    for (const row of providerRows) {
      const key = `${row.agentId}:${row.path || row.name}`;
      const existing = merged.get(key);
      merged.set(
        key,
        existing
          ? {
              ...row,
              ...existing,
              workspace: existing.workspace || row.workspace,
              path: existing.path || row.path,
              previewText: existing.previewText ?? row.previewText,
              content: existing.content ?? row.content ?? null,
              updatedAtMs: Math.max(existing.updatedAtMs ?? 0, row.updatedAtMs ?? 0) || undefined,
              size: existing.size ?? row.size,
            }
          : row,
      );
    }
    return [...merged.values()].sort((left, right) => {
      const byKind = getWorkspaceFilePriority(left.kind) - getWorkspaceFilePriority(right.kind);
      if (byKind !== 0) {
        return byKind;
      }
      return (right.updatedAtMs ?? 0) - (left.updatedAtMs ?? 0);
    });
  }, [activeArtifacts, activeCompany, filesByAgent, shouldSyncProviderWorkspace]);

  const mirroredOnlyWorkspaceCount = useMemo(
    () => workspaceFiles.filter((file) => !file.artifactId).length,
    [workspaceFiles],
  );
  const knowledgeItems = useMemo(
    () => (activeCompany ? resolveCompanyKnowledge(activeCompany) : []),
    [activeCompany],
  );
  const chapterFiles = useMemo(
    () => workspaceFiles.filter((file) => file.kind === "chapter"),
    [workspaceFiles],
  );
  const canonFiles = useMemo(
    () => workspaceFiles.filter((file) => file.kind === "canon"),
    [workspaceFiles],
  );
  const reviewFiles = useMemo(
    () => workspaceFiles.filter((file) => file.kind === "review"),
    [workspaceFiles],
  );
  const knowledgeFiles = useMemo(
    () => workspaceFiles.filter((file) => file.kind === "knowledge"),
    [workspaceFiles],
  );
  const toolingFiles = useMemo(
    () => workspaceFiles.filter((file) => file.kind === "tooling"),
    [workspaceFiles],
  );
  const supplementaryFiles = useMemo(
    () => workspaceFiles.filter((file) => file.kind === "tooling" || file.kind === "other"),
    [workspaceFiles],
  );
  const anchors = useMemo(
    () => summarizeConsistencyAnchors(canonFiles.map((file) => file.name)),
    [canonFiles],
  );
  const agentLabelById = useMemo(
    () =>
      new Map(
        agentsCache.map((agent) => [agent.id, agent.name?.trim() || agent.identity?.name?.trim() || agent.id]),
      ),
    [agentsCache],
  );

  return {
    activeCompany,
    activeWorkspaceWorkItem,
    agentLabelById,
    anchors,
    artifactBackedWorkspaceCount,
    canonFiles,
    ceoConversationWorkItem,
    chapterFiles,
    connected,
    ctoEmployee,
    loadingIndex,
    mirroredOnlyWorkspaceCount,
    providerManifest,
    knowledgeFiles,
    knowledgeItems,
    refreshIndex: () => setRefreshVersion((current) => current + 1),
    reviewFiles,
    shouldSyncProviderWorkspace,
    supplementaryFiles,
    toolingFiles,
    workspaceApps,
    workspaceFiles,
  };
}
