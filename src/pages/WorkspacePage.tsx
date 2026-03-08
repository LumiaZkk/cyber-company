import {
  ArrowUpRight,
  BookOpen,
  Compass,
  FileCode2,
  RefreshCcw,
  Wrench,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useNavigate } from "react-router-dom";
import remarkGfm from "remark-gfm";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { useCompanyStore } from "../features/company/store";
import type { ArtifactRecord } from "../features/company/types";
import {
  buildWorkspaceToolRequest,
  categorizeWorkspaceResource,
  getCompanyWorkspaceApps,
  summarizeConsistencyAnchors,
  type WorkspaceResourceKind,
} from "../features/company/workspace-apps";
import {
  gateway,
  type AgentListEntry,
} from "../features/backend";
import { useGatewayStore } from "../features/gateway/store";
import { toast } from "../features/ui/toast-store";
import { usePageVisibility } from "../lib/use-page-visibility";
import { cn, formatTime } from "../lib/utils";

type WorkspaceFileRow = {
  key: string;
  artifactId?: string;
  agentId: string;
  agentLabel: string;
  role: string;
  workspace: string;
  name: string;
  path: string;
  previewText?: string;
  updatedAtMs?: number;
  size?: number;
  kind: WorkspaceResourceKind;
};

const RESOURCE_KIND_LABEL: Record<WorkspaceResourceKind, string> = {
  chapter: "正文",
  canon: "设定",
  review: "报告",
  tooling: "工具",
  other: "其他",
};

const WORKBENCH_TOOL_CARDS = [
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
];

function formatBytes(bytes?: number): string {
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
    case "tooling":
      return 3;
    default:
      return 4;
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
        workspace: artifact.providerId ? `${artifact.providerId} mirror` : "product store",
        name: artifact.sourceName ?? artifact.title,
        path: artifact.sourcePath ?? artifact.sourceUrl ?? artifact.title,
        previewText: artifact.summary,
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

function pickDefaultFile(files: WorkspaceFileRow[]): WorkspaceFileRow | null {
  return (
    files.find((file) => file.kind === "chapter") ??
    files.find((file) => file.kind === "canon") ??
    files.find((file) => file.kind === "review") ??
    files[0] ??
    null
  );
}

export function WorkspacePage() {
  const navigate = useNavigate();
  const activeCompany = useCompanyStore((state) => state.activeCompany);
  const activeArtifacts = useCompanyStore((state) => state.activeArtifacts);
  const syncArtifactMirrorRecords = useCompanyStore((state) => state.syncArtifactMirrorRecords);
  const connected = useGatewayStore((state) => state.connected);
  const supportsAgentFiles = useGatewayStore((state) => state.capabilities.agentFiles);
  const providerManifest = useGatewayStore((state) => state.manifest);
  const isPageVisible = usePageVisibility();

  const [agentsCache, setAgentsCache] = useState<AgentListEntry[]>([]);
  const [filesByAgent, setFilesByAgent] = useState<
    Record<string, { workspace: string; files: Array<Record<string, unknown>> }>
  >({});
  const [loadingIndex, setLoadingIndex] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [selectedFileKey, setSelectedFileKey] = useState<string | null>(null);
  const [selectedFileContent, setSelectedFileContent] = useState<string>("");
  const [loadingFileKey, setLoadingFileKey] = useState<string | null>(null);

  const workspaceApps = useMemo(
    () => getCompanyWorkspaceApps(activeCompany),
    [activeCompany],
  );
  const shouldSyncProviderWorkspace = supportsAgentFiles && providerManifest.storageStrategy === "provider-files";
  const ctoEmployee =
    activeCompany?.employees.find((employee) => employee.metaRole === "cto") ?? null;

  useEffect(() => {
    if (!workspaceApps.length) {
      setSelectedAppId(null);
      return;
    }
    setSelectedAppId((current) =>
      current && workspaceApps.some((app) => app.id === current) ? current : workspaceApps[0].id,
    );
  }, [workspaceApps]);

  useEffect(() => {
    if (!activeCompany || !connected || !isPageVisible || !shouldSyncProviderWorkspace) {
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
        const nextArtifacts: Array<{
          id: string;
          workItemId: null;
          title: string;
          kind: string;
          status: "ready";
          ownerActorId: string;
          providerId: string;
          sourceActorId: string;
          sourceName: string;
          sourcePath: string;
          summary: string;
          createdAt: number;
          updatedAt: number;
        }> = [];
        for (const snapshot of snapshots) {
          if (snapshot.status !== "fulfilled") {
            continue;
          }
          const [agentId, result] = snapshot.value;
          nextFilesByAgent[agentId] = {
            workspace: result.workspace,
            files: (result.files ?? []) as Array<Record<string, unknown>>,
          };
          const employee = activeCompany.employees.find((item) => item.agentId === agentId) ?? null;
          for (const file of result.files ?? []) {
            if (!file?.name || typeof file.name !== "string") {
              continue;
            }
            const updatedAtMs = typeof file.updatedAtMs === "number" ? file.updatedAtMs : Date.now();
            nextArtifacts.push({
              id: `workspace:${activeCompany.id}:${agentId}:${typeof file.path === "string" ? file.path : file.name}`,
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
              createdAt: updatedAtMs,
              updatedAt: updatedAtMs,
            });
          }
        }
        setFilesByAgent(nextFilesByAgent);
        syncArtifactMirrorRecords(nextArtifacts, "workspace:");
      } catch (error) {
        console.error("Failed to load workspace index", error);
        toast.error("读取公司工作目录失败", error instanceof Error ? error.message : String(error));
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
    isPageVisible,
    refreshVersion,
    shouldSyncProviderWorkspace,
    syncArtifactMirrorRecords,
  ]);

  const workspaceFiles = useMemo(() => {
    if (!activeCompany) {
      return [];
    }
    const productRows = buildArtifactMirrorRows({
      employees: activeCompany.employees.map((employee) => ({
        agentId: employee.agentId,
        nickname: employee.nickname,
        role: employee.role,
      })),
      artifacts: activeArtifacts,
    });
    if (!shouldSyncProviderWorkspace) {
      return productRows;
    }
    const providerRows = buildWorkspaceRows({
      employees: activeCompany.employees.map((employee) => ({
        agentId: employee.agentId,
        nickname: employee.nickname,
        role: employee.role,
      })),
      filesByAgent,
    });
    const merged = new Map<string, WorkspaceFileRow>();
    for (const row of productRows) {
      merged.set(`${row.agentId}:${row.path || row.name}`, row);
    }
    for (const row of providerRows) {
      const key = `${row.agentId}:${row.path || row.name}`;
      if (!merged.has(key)) {
        merged.set(key, row);
      }
    }
    return [...merged.values()].sort((left, right) => {
      const byKind = getWorkspaceFilePriority(left.kind) - getWorkspaceFilePriority(right.kind);
      if (byKind !== 0) {
        return byKind;
      }
      return (right.updatedAtMs ?? 0) - (left.updatedAtMs ?? 0);
    });
  }, [activeArtifacts, activeCompany, filesByAgent, shouldSyncProviderWorkspace]);

  useEffect(() => {
    const selectedStillExists = selectedFileKey
      ? workspaceFiles.some((file) => file.key === selectedFileKey)
      : false;
    if (selectedStillExists) {
      return;
    }
    setSelectedFileKey(pickDefaultFile(workspaceFiles)?.key ?? null);
  }, [selectedFileKey, workspaceFiles]);

  const selectedFile =
    (selectedFileKey ? workspaceFiles.find((file) => file.key === selectedFileKey) : null) ?? null;

  useEffect(() => {
    if (!selectedFile) {
      setSelectedFileContent("");
      return;
    }

    if (
      !shouldSyncProviderWorkspace ||
      !selectedFile.agentId ||
      !selectedFile.name
    ) {
      setSelectedFileContent(selectedFile.previewText ?? "");
      return;
    }

    let cancelled = false;
    const loadSelectedFile = async () => {
      setLoadingFileKey(selectedFile.key);
      try {
        const result = await gateway.getAgentFile(selectedFile.agentId, selectedFile.name);
        if (!cancelled) {
          setSelectedFileContent(result.file?.content ?? "");
        }
      } catch (error) {
        console.error("Failed to load selected workspace file", error);
        if (!cancelled) {
          setSelectedFileContent("");
          toast.error("读取文件失败", error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (!cancelled) {
          setLoadingFileKey(null);
        }
      }
    };

    void loadSelectedFile();
    return () => {
      cancelled = true;
    };
  }, [selectedFile, shouldSyncProviderWorkspace]);

  if (!activeCompany) {
    return <div className="p-8 text-center text-muted-foreground">未选择正在运营的公司组织</div>;
  }

  if (workspaceApps.length === 0) {
    return (
      <div className="p-8">
        <Card className="mx-auto max-w-2xl">
          <CardHeader>
            <CardTitle>当前公司还没有专属工作目录</CardTitle>
            <CardDescription>
              这家公司暂时没有启用公司级 workspace 应用。后续可以按公司类型继续扩展。
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const selectedApp = workspaceApps.find((app) => app.id === selectedAppId) ?? workspaceApps[0];
  const chapterFiles = workspaceFiles.filter((file) => file.kind === "chapter");
  const canonFiles = workspaceFiles.filter((file) => file.kind === "canon");
  const reviewFiles = workspaceFiles.filter((file) => file.kind === "review");
  const toolingFiles = workspaceFiles.filter((file) => file.kind === "tooling");
  const anchors = summarizeConsistencyAnchors(canonFiles.map((file) => file.name));
  const indexedWorkspaceCount = shouldSyncProviderWorkspace
    ? Object.keys(filesByAgent).length
    : activeArtifacts.length;
  const agentLabelById = new Map(
    agentsCache.map((agent) => [agent.id, agent.name?.trim() || agent.identity?.name?.trim() || agent.id]),
  );

  const openCtoWorkbench = (
    tool: "consistency-checker" | "novel-reader" | "chapter-review-console",
  ) => {
    if (!ctoEmployee) {
      toast.error("当前公司没有 CTO 节点", "至少需要一个 CTO 节点来承接公司级工具需求。");
      return;
    }

    const request = buildWorkspaceToolRequest(activeCompany, tool);
    navigate(`/chat/${encodeURIComponent(ctoEmployee.agentId)}`, {
      state: {
        prefillText: request.prompt,
        prefillId: Date.now(),
      },
    });
  };

  const renderWorkspaceReader = () => (
    <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
      <Card className="border-slate-200/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">公司 workspace 文档</CardTitle>
          <CardDescription>正文、设定、审校报告和工具脚本都按当前公司聚合在这里。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {([
            ["chapter", chapterFiles],
            ["canon", canonFiles],
            ["review", reviewFiles],
            ["tooling", toolingFiles],
            ["other", workspaceFiles.filter((file) => file.kind === "other")],
          ] as const).map(([kind, files]) => {
            if (files.length === 0) {
              return null;
            }
            return (
              <div key={kind} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {RESOURCE_KIND_LABEL[kind]}
                  </div>
                  <Badge variant="secondary">{files.length}</Badge>
                </div>
                <div className="space-y-2">
                  {files.slice(0, 8).map((file) => (
                    <button
                      type="button"
                      key={file.key}
                      onClick={() => setSelectedFileKey(file.key)}
                      className={cn(
                        "w-full rounded-xl border px-3 py-3 text-left transition-colors",
                        selectedFileKey === file.key
                          ? "border-indigo-200 bg-indigo-50 text-indigo-950"
                          : "border-slate-200 bg-white hover:bg-slate-50",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold">{file.name}</div>
                          <div className="mt-1 text-xs leading-5 text-slate-500">
                            {file.agentLabel} · {file.role}
                          </div>
                        </div>
                        <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          {!workspaceFiles.length && (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
              当前还没从公司 workspace 里读到文件。通常是节点工作区还没落内容，或者 Gateway 尚未同步。
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200/80 shadow-sm">
        <CardHeader className="border-b border-slate-100">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">
                {selectedFile?.name ?? "选择一份公司文档"}
              </CardTitle>
              <CardDescription className="mt-1">
                {selectedFile
                  ? `${selectedFile.agentLabel} · ${selectedFile.role} · ${selectedFile.workspace}`
                  : "从左侧挑一份正文、设定或审校报告，直接在页面里阅读。"}
              </CardDescription>
            </div>
            {selectedFile && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <Badge variant="secondary">{RESOURCE_KIND_LABEL[selectedFile.kind]}</Badge>
                <span>{formatBytes(selectedFile.size)}</span>
                <span>{formatTime(selectedFile.updatedAtMs)}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => navigate(`/chat/${encodeURIComponent(selectedFile.agentId)}`)}
                >
                  打开 {selectedFile.agentLabel} 会话
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="min-h-[560px] p-0">
          {!selectedFile ? (
            <div className="flex h-full min-h-[560px] items-center justify-center px-6 text-center text-sm text-slate-500">
              这里会直接显示当前公司的正文、设定和报告内容，让创作团队不用离开产品就能对照阅读。
            </div>
          ) : loadingFileKey === selectedFile.key ? (
            <div className="flex h-full min-h-[560px] items-center justify-center text-sm text-slate-500">
              正在读取 {selectedFile.name}...
            </div>
          ) : (
            <div className="h-full overflow-auto px-6 py-6">
              <article className="prose prose-slate max-w-none prose-headings:font-semibold prose-p:text-slate-700">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {selectedFileContent || "*当前文件没有可展示的文本内容。*"}
                </ReactMarkdown>
              </article>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );

  const renderConsistencyHub = () => (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader className="pb-3">
            <CardDescription>共享真相源</CardDescription>
            <CardTitle>{anchors.filter((anchor) => anchor.found).length}/4 已落盘</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader className="pb-3">
            <CardDescription>章节正文</CardDescription>
            <CardTitle>{chapterFiles.length} 份可读正文</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader className="pb-3">
            <CardDescription>审校与终审</CardDescription>
            <CardTitle>{reviewFiles.length} 份过程报告</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader className="pb-3">
            <CardDescription>工具脚本</CardDescription>
            <CardTitle>{toolingFiles.length} 份工具文件</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_360px]">
        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">一致性锚点</CardTitle>
            <CardDescription>先明确这家公司现在有哪些唯一真相源，哪些还缺位。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {anchors.map((anchor) => (
              <div
                key={anchor.id}
                className={cn(
                  "flex items-center justify-between rounded-xl border px-4 py-3",
                  anchor.found
                    ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                    : "border-amber-200 bg-amber-50 text-amber-950",
                )}
              >
                <div>
                  <div className="text-sm font-semibold">{anchor.label}</div>
                  <div className="mt-1 text-xs text-slate-600">
                    {anchor.found ? "已经在当前公司 workspace 中找到对应文件。" : "当前还没有稳定的唯一真相源文件。"}
                  </div>
                </div>
                <Badge variant={anchor.found ? "default" : "secondary"}>
                  {anchor.found ? "已具备" : "待补齐"}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">下一步建议</CardTitle>
            <CardDescription>如果你要把这家公司做成真正可运营的创作系统，下一步优先级应该这样排。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
              先把共享设定库、时间线、伏笔追踪做成可检索的唯一真相源，再让 CTO 基于这些文件开发一致性工具。
            </div>
            <Button type="button" className="w-full" onClick={() => openCtoWorkbench("consistency-checker")}>
              让 CTO 开发一致性工具
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => setSelectedAppId("novel-reader")}
            >
              先去小说阅读器查看关键文件
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  const renderWorkbench = () => (
    <div className="grid gap-5 lg:grid-cols-3">
      {WORKBENCH_TOOL_CARDS.map((card) => (
        <Card key={card.id} className="border-slate-200/80 shadow-sm">
          <CardHeader className="space-y-3">
            <div className="flex items-center justify-between">
              <Badge variant="secondary">公司专属工具</Badge>
              <Wrench className="h-4 w-4 text-slate-400" />
            </div>
            <div>
              <CardTitle className="text-base">{card.title}</CardTitle>
              <CardDescription className="mt-2 leading-6">{card.summary}</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
              这次需求会带着当前公司的上下文和 workspace 诉求进入 CTO 会话，目标不是做通用工具，而是先服务这家公司。
            </div>
            <Button type="button" className="w-full" onClick={() => openCtoWorkbench(card.id)}>
              去 CTO 会话带上需求
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top_left,_rgba(99,102,241,0.08),_transparent_34%),radial-gradient(circle_at_top_right,_rgba(16,185,129,0.08),_transparent_28%)] p-6 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <Card className="overflow-hidden border-slate-200/80 shadow-sm">
          <CardContent className="grid gap-5 px-6 py-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">当前公司专属</Badge>
                <Badge variant="outline">只对 {activeCompany.name} 可见</Badge>
              </div>
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-slate-950">工作目录</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                  把当前公司的专属工具、workspace 文档和 CTO 工具需求收进一个页面里。对小说公司来说，这里就是阅读器、一致性中心和工具开发工坊的统一入口。
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button type="button" onClick={() => openCtoWorkbench("consistency-checker")}>
                  让 CTO 开发一致性工具
                </Button>
                <Button type="button" variant="outline" onClick={() => openCtoWorkbench("novel-reader")}>
                  让 CTO 开发小说阅读器
                </Button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">公司应用</div>
                <div className="mt-2 text-2xl font-semibold text-slate-950">{workspaceApps.length}</div>
              <div className="mt-1 text-sm text-slate-600">当前公司已经启用的专属菜单与工具入口。</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  {shouldSyncProviderWorkspace ? "已接入工作区" : "产品产物库"}
                </div>
                <div className="mt-2 text-2xl font-semibold text-slate-950">{indexedWorkspaceCount}</div>
                <div className="mt-1 text-sm text-slate-600">
                  {shouldSyncProviderWorkspace
                    ? "已经从当前公司的 workspace 里索引到的节点数。"
                    : "当前后端不提供文件区，工作目录直接读取产品侧 artifact store。"}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">当前可读业务文档</div>
                <div className="mt-2 text-2xl font-semibold text-slate-950">{chapterFiles.length + canonFiles.length}</div>
                <div className="mt-1 text-sm text-slate-600">
                  {chapterFiles.length + canonFiles.length > 0
                    ? "当前公司已经有可直接阅读的正文与设定文件。"
                    : "当前公司还没把正文/设定稳定固化进 workspace，这正是 CTO 下一步该补的能力。"}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">当前 CTO</div>
                <div className="mt-2 text-lg font-semibold text-slate-950">
                  {ctoEmployee?.nickname ?? "尚未配置"}
                </div>
                <div className="mt-1 text-sm text-slate-600">
                  {ctoEmployee
                    ? `${agentLabelById.get(ctoEmployee.agentId) ?? ctoEmployee.agentId} 负责公司专属工具方向。`
                    : "需要一个 CTO 节点来承接公司工具开发。"}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">公司应用</CardTitle>
              <CardDescription>
                只显示当前公司的专属菜单和工具，不影响其他公司。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {workspaceApps.map((app) => (
                <button
                  type="button"
                  key={app.id}
                  onClick={() => setSelectedAppId(app.id)}
                  className={cn(
                    "w-full rounded-2xl border px-4 py-4 text-left transition-colors",
                    selectedApp.id === app.id
                      ? "border-indigo-200 bg-indigo-50 text-indigo-950"
                      : "border-slate-200 bg-white hover:bg-slate-50",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 text-xl">{app.icon}</div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-semibold">{app.title}</div>
                        <Badge variant={app.status === "ready" ? "default" : "secondary"}>
                          {app.status === "ready" ? "可直接使用" : "建议继续建设"}
                        </Badge>
                      </div>
                      <div className="mt-1 text-xs leading-5 text-slate-500">{app.description}</div>
                    </div>
                  </div>
                </button>
              ))}
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-xs leading-6 text-slate-500">
                后续 CTO 为当前公司做出来的新工具，也应该继续挂在这里，而不是混进所有公司的公共菜单里。
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => navigate(`/chat/${encodeURIComponent(ctoEmployee?.agentId ?? "")}`)}
                disabled={!ctoEmployee}
              >
                直接打开 CTO 会话
              </Button>
            </CardContent>
          </Card>

          <div className="space-y-5">
            <Card className="border-slate-200/80 shadow-sm">
              <CardHeader className="pb-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      {selectedApp.kind === "novel-reader" ? <BookOpen className="h-5 w-5" /> : null}
                      {selectedApp.kind === "consistency-hub" ? <Compass className="h-5 w-5" /> : null}
                      {selectedApp.kind === "cto-workbench" ? <FileCode2 className="h-5 w-5" /> : null}
                      {selectedApp.title}
                    </CardTitle>
                    <CardDescription className="mt-2 max-w-3xl leading-6">
                      {selectedApp.description}
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">当前公司 workspace</Badge>
                    <Badge variant="secondary">{workspaceFiles.length} 份文件</Badge>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setRefreshVersion((current) => current + 1)}
                      disabled={loadingIndex}
                    >
                      <RefreshCcw className={cn("mr-2 h-4 w-4", loadingIndex && "animate-spin")} />
                      刷新索引
                    </Button>
                  </div>
                </div>
              </CardHeader>
            </Card>

            {selectedApp.kind === "novel-reader" ? renderWorkspaceReader() : null}
            {selectedApp.kind === "consistency-hub" ? renderConsistencyHub() : null}
            {selectedApp.kind === "cto-workbench" ? renderWorkbench() : null}
          </div>
        </div>
      </div>
    </div>
  );
}
