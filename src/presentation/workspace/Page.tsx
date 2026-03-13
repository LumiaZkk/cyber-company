import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useArtifactApp } from "../../application/artifact";
import {
  buildWorkspaceAppManifestDraft,
  buildWorkspaceReaderIndex,
  buildWorkspaceWorkbenchRequest,
  getKnowledgeSourceFilesForItem,
  loadWorkspaceReaderSnapshot,
  pickDefaultWorkspaceFile,
  recordWorkspaceFileVisit,
  saveWorkspaceReaderSnapshot,
  useWorkspaceFileContent,
  useWorkspaceViewModel,
  withWorkspaceSelection,
  WORKBENCH_TOOL_CARDS,
  type WorkspaceAppManifestAction,
  type WorkspaceReaderPageSnapshot,
  type WorkspaceWorkbenchTool,
} from "../../application/workspace";
import {
  buildRecommendedWorkspaceApps,
  publishWorkspaceApp,
  resolveWorkspaceAppTemplate,
} from "../../application/company/workspace-apps";
import { useOrgApp } from "../../application/org";
import { toast } from "../../components/system/toast-store";
import { usePageVisibility } from "../../lib/use-page-visibility";
import { Card, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import type { ArtifactResourceType } from "../../domain/artifact/types";
import type {
  CapabilityIssueRecord,
  CapabilityIssueStatus,
  CapabilityRequestRecord,
  CapabilityRequestStatus,
  Company,
  CompanyWorkspaceApp,
  CompanyWorkspaceAppTemplate,
  EmployeeRef,
  SkillDefinitionStatus,
  SkillRunRecord,
} from "../../domain/org/types";
import { useCompanyRuntimeCommands } from "../../infrastructure/company/runtime/commands";
import { WorkspacePageContent } from "./components/WorkspacePageContent";

type SkillSeed = {
  id: string;
  tool: WorkspaceWorkbenchTool;
  appTemplate: CompanyWorkspaceAppTemplate;
  title: string;
  summary: string;
  entryPath: string;
  writesResourceTypes: ArtifactResourceType[];
  manifestActionIds: string[];
  requestType: CapabilityRequestRecord["type"];
  smokeTest: string;
};

const WORKBENCH_TOOL_SET = new Set<WorkspaceWorkbenchTool>(
  WORKBENCH_TOOL_CARDS.map((card) => card.id),
);

const WORKBENCH_SKILL_SEEDS: Record<WorkspaceWorkbenchTool, SkillSeed> = {
  "novel-reader": {
    id: "reader.build-index",
    tool: "novel-reader",
    appTemplate: "reader",
    title: "重建阅读索引",
    summary: "把当前公司的正文、设定和报告重新整理成阅读器可直接消费的资源清单。",
    entryPath: "scripts/build-reader-index.ts",
    writesResourceTypes: ["document", "report"],
    manifestActionIds: ["trigger-reader-index"],
    requestType: "app",
    smokeTest: "验证当前公司至少能产出一份正文/设定/报告索引。",
  },
  "consistency-checker": {
    id: "consistency.check",
    tool: "consistency-checker",
    appTemplate: "consistency",
    title: "执行一致性检查",
    summary: "围绕共享设定、人物、时间线和伏笔做结构化校验，并输出一致性报告。",
    entryPath: "scripts/run-consistency-check.ts",
    writesResourceTypes: ["report"],
    manifestActionIds: ["trigger-consistency-check"],
    requestType: "check",
    smokeTest: "使用一份章节和一份设定文件跑通一次检查并输出报告。",
  },
  "chapter-review-console": {
    id: "review.precheck",
    tool: "chapter-review-console",
    appTemplate: "review-console",
    title: "执行发布前检查",
    summary: "在章节终审或发布前生成检查结果，帮助业务负责人快速判断是否可推进。",
    entryPath: "scripts/run-review-precheck.ts",
    writesResourceTypes: ["report"],
    manifestActionIds: ["trigger-review-precheck"],
    requestType: "app",
    smokeTest: "对当前公司至少生成一份可读预检报告。",
  },
};

function getAppManifestFileName(app: Pick<CompanyWorkspaceApp, "slug">) {
  return `workspace-app-manifest.${app.slug}.json`;
}

function getAppManifestArtifactId(companyId: string, appId: string) {
  return `workspace-app-manifest:${companyId}:${appId}`;
}

function isWorkbenchTool(value: string): value is WorkspaceWorkbenchTool {
  return WORKBENCH_TOOL_SET.has(value as WorkspaceWorkbenchTool);
}

function findBusinessLead(company: Company, workItemOwnerActorId?: string | null): EmployeeRef | null {
  if (workItemOwnerActorId) {
    const owner = company.employees.find((employee) => employee.agentId === workItemOwnerActorId) ?? null;
    if (owner && owner.metaRole !== "cto") {
      return owner;
    }
  }
  return (
    company.employees.find((employee) => employee.metaRole === "coo") ??
    company.employees.find((employee) => employee.metaRole === "ceo") ??
    company.employees.find((employee) => !employee.isMeta) ??
    company.employees[0] ??
    null
  );
}

export function WorkspacePresentationPage() {
  const navigate = useNavigate();
  const isPageVisible = usePageVisibility();
  const prefillSequenceRef = useRef(0);
  const { updateCompany } = useOrgApp();
  const { upsertArtifactRecord } = useArtifactApp();
  const {
    upsertCapabilityIssue,
    upsertCapabilityRequest,
    upsertSkillDefinition,
    upsertSkillRun,
  } = useCompanyRuntimeCommands();
  const {
    activeCompany,
    activeWorkspaceWorkItem,
    agentLabelById,
    anchors,
    artifactBackedWorkspaceCount,
    canonFiles,
    chapterFiles,
    ctoEmployee,
    knowledgeFiles,
    knowledgeItems,
    loadingIndex,
    mirroredOnlyWorkspaceCount,
    readerManifest,
    refreshIndex,
    reviewFiles,
    shouldSyncProviderWorkspace,
    supplementaryFiles,
    toolingFiles,
    workspaceAppManifestsById,
    workspaceApps,
    workspaceAppsAreExplicit,
    workspaceFiles,
  } = useWorkspaceViewModel({ isPageVisible });
  const activeCompanyId = activeCompany?.id ?? null;
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [selectedKnowledgeId, setSelectedKnowledgeId] = useState<string | null>(null);
  const [selectedFileKey, setSelectedFileKey] = useState<string | null>(null);
  const [readerSnapshot, setReaderSnapshot] = useState<WorkspaceReaderPageSnapshot>(() =>
    loadWorkspaceReaderSnapshot(null),
  );

  useEffect(() => {
    if (!activeCompanyId) {
      return;
    }
    const snapshot = loadWorkspaceReaderSnapshot(activeCompanyId);
    setReaderSnapshot(snapshot);
    setSelectedAppId(snapshot.lastSelectedAppId);
    setSelectedKnowledgeId(snapshot.lastSelectedKnowledgeId);
    setSelectedFileKey(snapshot.lastSelectedFileKey);
  }, [activeCompanyId]);

  const selectedApp =
    (selectedAppId ? workspaceApps.find((app) => app.id === selectedAppId) : null) ?? workspaceApps[0];
  const selectedAppTemplate = selectedApp ? resolveWorkspaceAppTemplate(selectedApp) : null;
  const selectedAppManifest = selectedApp ? workspaceAppManifestsById[selectedApp.id] ?? null : null;
  const publishedAppTemplates = workspaceAppsAreExplicit
    ? workspaceApps.map((app) => resolveWorkspaceAppTemplate(app))
    : [];
  const selectedKnowledgeItem =
    (selectedKnowledgeId ? knowledgeItems.find((item) => item.id === selectedKnowledgeId) : null) ??
    knowledgeItems[0] ??
    null;
  const selectedKnowledgeSourceFiles = getKnowledgeSourceFilesForItem(
    selectedKnowledgeItem,
    knowledgeFiles,
  );
  const selectedFile =
    (selectedFileKey ? workspaceFiles.find((file) => file.key === selectedFileKey) : null) ??
    pickDefaultWorkspaceFile(
      selectedAppTemplate === "knowledge" ? selectedKnowledgeSourceFiles : workspaceFiles,
      selectedAppTemplate === "knowledge"
        ? ["knowledge", "chapter", "canon", "review"]
        : ["chapter", "canon", "review", "knowledge"],
    );
  const { loadingFileKey, selectedFileContent } = useWorkspaceFileContent({
    activeCompanyId,
    activeWorkspaceWorkItemId: activeWorkspaceWorkItem?.id ?? null,
    selectedFile,
    shouldSyncProviderWorkspace,
  });
  const readerIndex = useMemo(
    () =>
      buildWorkspaceReaderIndex({
        files: [...chapterFiles, ...canonFiles, ...reviewFiles],
        snapshot: readerSnapshot,
      }),
    [canonFiles, chapterFiles, readerSnapshot, reviewFiles],
  );
  const skillDefinitions = activeCompany?.skillDefinitions ?? [];
  const skillRuns = activeCompany?.skillRuns ?? [];
  const capabilityRequests = activeCompany?.capabilityRequests ?? [];
  const capabilityIssues = activeCompany?.capabilityIssues ?? [];
  const businessLead = activeCompany
    ? findBusinessLead(activeCompany, activeWorkspaceWorkItem?.ownerActorId ?? null)
    : null;

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

  const openCtoWorkbench = (tool: WorkspaceWorkbenchTool) => {
    if (!ctoEmployee) {
      toast.error("当前公司没有 CTO 节点", "至少需要一个 CTO 节点来承接公司级工具需求。");
      return;
    }

    const request = buildWorkspaceWorkbenchRequest(activeCompany, tool);
    prefillSequenceRef.current += 1;
    navigate(`/chat/${encodeURIComponent(ctoEmployee.agentId)}`, {
      state: {
        prefillText: request.prompt,
        prefillId: `${tool}:${prefillSequenceRef.current}`,
      },
    });
  };

  const writeWorkspaceApps = async (nextApps: CompanyWorkspaceApp[]) => {
    await updateCompany({ workspaceApps: nextApps });
  };

  const publishRecommendedApps = async () => {
    const recommendedApps = buildRecommendedWorkspaceApps(activeCompany);
    if (recommendedApps.length === 0) {
      toast.error("当前公司没有可固化的推荐应用", "先让 CTO 或业务团队明确这家公司真正需要哪些入口。");
      return;
    }

    await writeWorkspaceApps(recommendedApps);
    toast.success("已固化公司应用", "当前公司的工作目录入口已经从系统补位变成显式挂载。");
  };

  const publishTemplateApp = async (
    template: "reader" | "consistency" | "review-console",
  ) => {
    const nextApps = publishWorkspaceApp(activeCompany, {
      template,
      title: template === "reader" ? "NovelCraft 阅读器" : undefined,
      description:
        template === "reader"
          ? "围绕当前公司的章节、设定、审校结果和版本切换提供统一阅读入口。"
          : template === "review-console"
            ? "把章节状态、终审结论和发布前检查结果收进同一个控制台。"
            : undefined,
      ownerAgentId: ctoEmployee?.agentId,
    });
    const nextApp = nextApps.find((app) => resolveWorkspaceAppTemplate(app) === template) ?? null;
    await writeWorkspaceApps(nextApps);
    if (nextApp) {
      setSelectedAppId(nextApp.id);
    }
    toast.success(
      template === "reader"
        ? "已发布阅读器入口"
        : template === "consistency"
          ? "已发布一致性中心"
          : "已发布审阅控制台",
      "当前模板 App 已经正式挂到这家公司里，后续可以继续沿着这个入口迭代。",
    );
  };

  const generateAppManifestDraft = async (targetApp: CompanyWorkspaceApp = selectedApp) => {
    const draft = buildWorkspaceAppManifestDraft({
      app: targetApp,
      files: workspaceFiles,
      title: `${activeCompany.name} · ${targetApp.title} AppManifest 草案`,
      sourceLabel: "系统草案",
    });

    if (!draft) {
      toast.error(
        "当前还无法生成 AppManifest 草案",
        "工作目录里还没有足够明确的资源候选文件，先让团队把可读产物或报告固化下来。",
      );
      return;
    }

    const now = Date.now();
    const manifestArtifactId = getAppManifestArtifactId(activeCompany.id, targetApp.id);
    const fileName = getAppManifestFileName(targetApp);
    upsertArtifactRecord({
      id: manifestArtifactId,
      workItemId: activeWorkspaceWorkItem?.id ?? null,
      title: fileName,
      kind: "app_manifest",
      status: "draft",
      ownerActorId: ctoEmployee?.agentId ?? null,
      sourceActorId: ctoEmployee?.agentId ?? null,
      sourceName: fileName,
      sourcePath: fileName,
      summary: `系统根据当前工作目录自动生成的 ${targetApp.title} AppManifest 草案，待 CTO 校准资源分区和动作。`,
      content: JSON.stringify(draft, null, 2),
      resourceType: "other",
      resourceTags: ["tech.app-manifest", `app.${targetApp.slug}`],
      createdAt: now,
      updatedAt: now,
    });

    const nextApps = workspaceApps.map((app) =>
      app.id === targetApp.id ? { ...app, manifestArtifactId } : app,
    );
    await writeWorkspaceApps(nextApps);
    toast.success(
      "已生成 AppManifest 草案",
      `${targetApp.title} 已经接入一份显式 manifest，后续 CTO 可以继续校准资源分区和动作。`,
    );
  };

  const upsertSkillDraft = async (tool: WorkspaceWorkbenchTool) => {
    if (!ctoEmployee) {
      toast.error("当前公司没有 CTO 节点", "至少需要一个 CTO 节点来承接 Skill 草稿。");
      return;
    }
    const seed = WORKBENCH_SKILL_SEEDS[tool];
    const existing = skillDefinitions.find((skill) => skill.id === seed.id) ?? null;
    const app = workspaceApps.find((candidate) => resolveWorkspaceAppTemplate(candidate) === seed.appTemplate) ?? null;
    const now = Date.now();
    await upsertSkillDefinition({
      id: seed.id,
      title: seed.title,
      summary: seed.summary,
      ownerAgentId: ctoEmployee.agentId,
      status: existing?.status ?? "draft",
      entryPath: seed.entryPath,
      inputSchema: { companyId: activeCompany.id, appId: app?.id ?? null },
      outputSchema: { writesResourceTypes: seed.writesResourceTypes },
      writesResourceTypes: seed.writesResourceTypes,
      allowedTriggers: ["app_action"],
      smokeTest: seed.smokeTest,
      manifestActionIds: seed.manifestActionIds,
      appIds: app ? [app.id] : undefined,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
    toast.success("已登记 Skill 草稿", `${seed.title} 已进入 CTO 技术中台 backlog。`);
  };

  const createCapabilityRequestDraft = async (tool: WorkspaceWorkbenchTool) => {
    const seed = WORKBENCH_SKILL_SEEDS[tool];
    const now = Date.now();
    await upsertCapabilityRequest({
      id: `capability-request:${activeCompany.id}:${seed.id}:${now}`,
      type: seed.requestType,
      summary: `${activeCompany.name} 需要 ${seed.title}`,
      detail: `${activeCompany.name} 当前希望补齐 ${seed.title}，优先服务 ${selectedApp?.title ?? "工作目录"} 的实际使用场景。`,
      requesterActorId: businessLead?.agentId ?? activeWorkspaceWorkItem?.ownerActorId ?? null,
      requesterLabel:
        businessLead?.nickname ??
        activeWorkspaceWorkItem?.displayOwnerLabel ??
        activeWorkspaceWorkItem?.ownerLabel ??
        null,
      requesterDepartmentId: businessLead?.departmentId ?? activeWorkspaceWorkItem?.owningDepartmentId ?? null,
      ownerActorId: ctoEmployee?.agentId ?? null,
      appId:
        workspaceApps.find((app) => resolveWorkspaceAppTemplate(app) === seed.appTemplate)?.id ?? selectedApp?.id ?? null,
      skillId: seed.id,
      status: "open",
      createdAt: now,
      updatedAt: now,
    });
    toast.success("已登记能力需求", "这条需求已经进入 CTO 技术中台 backlog。");
  };

  const createCapabilityIssueDraft = async (input?: {
    type?: CapabilityIssueRecord["type"];
    summary?: string;
    detail?: string;
    appId?: string | null;
    skillId?: string | null;
  }) => {
    const now = Date.now();
    await upsertCapabilityIssue({
      id: `capability-issue:${activeCompany.id}:${input?.skillId ?? input?.appId ?? "workspace"}:${now}`,
      type: input?.type ?? "unavailable",
      summary:
        input?.summary ??
        `${selectedApp?.title ?? "当前公司应用"} 出现问题，需要 CTO 跟进`,
      detail:
        input?.detail ??
        `问题从 ${selectedApp?.title ?? "工作目录"} 反馈，建议 CTO 先复现并给出回访验证结论。`,
      reporterActorId: businessLead?.agentId ?? activeWorkspaceWorkItem?.ownerActorId ?? null,
      reporterLabel:
        businessLead?.nickname ??
        activeWorkspaceWorkItem?.displayOwnerLabel ??
        activeWorkspaceWorkItem?.ownerLabel ??
        null,
      reporterDepartmentId: businessLead?.departmentId ?? activeWorkspaceWorkItem?.owningDepartmentId ?? null,
      ownerActorId: ctoEmployee?.agentId ?? null,
      appId: input?.appId ?? selectedApp?.id ?? null,
      skillId: input?.skillId ?? null,
      status: "open",
      createdAt: now,
      updatedAt: now,
    });
    toast.success("已登记能力问题", "问题已经交给 CTO 技术中台继续跟进。");
  };

  const updateSkillStatus = async (skillId: string, status: SkillDefinitionStatus) => {
    const skill = skillDefinitions.find((item) => item.id === skillId) ?? null;
    if (!skill) {
      return;
    }
    await upsertSkillDefinition({
      ...skill,
      status,
      updatedAt: Date.now(),
    });
  };

  const updateCapabilityRequestStatus = async (requestId: string, status: CapabilityRequestStatus) => {
    const request = capabilityRequests.find((item) => item.id === requestId) ?? null;
    if (!request) {
      return;
    }
    await upsertCapabilityRequest({
      ...request,
      status,
      updatedAt: Date.now(),
    });
  };

  const updateCapabilityIssueStatus = async (issueId: string, status: CapabilityIssueStatus) => {
    const issue = capabilityIssues.find((item) => item.id === issueId) ?? null;
    if (!issue) {
      return;
    }
    await upsertCapabilityIssue({
      ...issue,
      status,
      updatedAt: Date.now(),
    });
  };

  const triggerSkillFromManifest = async (skillId: string, appId?: string | null) => {
    const triggerApp = (appId ? workspaceApps.find((item) => item.id === appId) : null) ?? selectedApp ?? null;
    const now = Date.now();
    const requestedByActorId = businessLead?.agentId ?? activeWorkspaceWorkItem?.ownerActorId ?? null;
    const requestedByLabel =
      businessLead?.nickname ??
      activeWorkspaceWorkItem?.displayOwnerLabel ??
      activeWorkspaceWorkItem?.ownerLabel ??
      null;
    const skill = skillDefinitions.find((item) => item.id === skillId) ?? null;
    if (!skill || skill.status !== "ready") {
      const failedRun: SkillRunRecord = {
        id: `skill-run:${activeCompany.id}:${skillId}:${now}`,
        skillId,
        appId: appId ?? triggerApp?.id ?? null,
        triggerType: "app_action",
        triggerActionId: skillId,
        triggerLabel: triggerApp?.title ?? "工作目录",
        requestedByActorId,
        requestedByLabel,
        status: "failed",
        inputSummary: `${activeCompany.name} 从 ${triggerApp?.title ?? "工作目录"} 触发 ${skillId}`,
        errorMessage: skill
          ? `${skill.title} 当前状态为 ${skill.status}，尚未进入 ready。`
          : `当前 AppManifest 声明了 ${skillId}，但公司里还没有对应 SkillDefinition。`,
        startedAt: now,
        completedAt: now,
        updatedAt: now,
      };
      await upsertSkillRun(failedRun);
      await createCapabilityIssueDraft({
        type: "unavailable",
        appId: appId ?? triggerApp?.id ?? null,
        skillId,
        summary: skill
          ? `${skill.title} 当前状态为 ${skill.status}`
          : `缺少可触发的 Skill：${skillId}`,
        detail: skill
          ? `${skill.title} 还没有进入 ready 状态，当前先登记为能力问题，等待 CTO 跟进。`
          : `当前 AppManifest 声明了 ${skillId}，但公司里还没有对应 SkillDefinition。`,
      });
      toast.error("Skill 还不能运行", "问题已经自动登记到 CTO 技术中台。");
      return;
    }

    const receiptArtifactId = `skill-receipt:${activeCompany.id}:${skill.id}:${now}`;
    upsertArtifactRecord({
      id: receiptArtifactId,
      workItemId: activeWorkspaceWorkItem?.id ?? null,
      title: `${skill.title} 执行回执`,
      kind: "skill_receipt",
      status: "ready",
      ownerActorId: skill.ownerAgentId,
      sourceActorId: skill.ownerAgentId,
      sourceName: `${skill.id}.receipt.md`,
      sourcePath: `skill-runs/${skill.id}/${now}.md`,
      summary: `${skill.title} 已从 ${triggerApp?.title ?? "工作目录"} 触发，当前版本先把执行回执写回资源层。`,
      content: [
        `# ${skill.title} 执行回执`,
        "",
        `- 公司：${activeCompany.name}`,
        `- 触发入口：${triggerApp?.title ?? "工作目录"}`,
        `- Skill：${skill.id}`,
        `- 状态：已记录回执，等待更完整执行引擎接入`,
        `- 负责人：${ctoEmployee?.nickname ?? ctoEmployee?.agentId ?? "CTO"}`,
      ].join("\n"),
      resourceType: "state",
      resourceTags: ["tech.skill-run", `skill.${skill.id}`, ...(appId ? [`app.${appId}`] : [])],
      createdAt: now,
      updatedAt: now,
    });
    await upsertSkillRun({
      id: `skill-run:${activeCompany.id}:${skill.id}:${now}`,
      skillId: skill.id,
      appId: appId ?? triggerApp?.id ?? null,
      triggerType: "app_action",
      triggerActionId: skillId,
      triggerLabel: triggerApp?.title ?? "工作目录",
      requestedByActorId,
      requestedByLabel,
      status: "succeeded",
      inputSummary: `${activeCompany.name} 从 ${triggerApp?.title ?? "工作目录"} 触发 ${skill.title}`,
      outputArtifactIds: [receiptArtifactId],
      outputResourceTypes: skill.writesResourceTypes,
      startedAt: now,
      completedAt: now,
      updatedAt: now,
    });
    toast.success("已写回 Skill 执行回执", "当前版本先把触发回执写回工作目录，后续再接入真正执行引擎。");
  };

  const runAppManifestAction = async (action: WorkspaceAppManifestAction) => {
    if (!selectedApp) {
      return;
    }
    switch (action.actionType) {
      case "refresh_manifest":
        await generateAppManifestDraft(selectedApp);
        return;
      case "open_chat":
        if (action.target === "cto" && ctoEmployee) {
          navigate(`/chat/${encodeURIComponent(ctoEmployee.agentId)}`);
        }
        return;
      case "workbench_request":
        if (isWorkbenchTool(action.target)) {
          await createCapabilityRequestDraft(action.target);
        }
        return;
      case "trigger_skill":
        await triggerSkillFromManifest(action.target, selectedApp.id);
        return;
    }
  };

  useEffect(() => {
    if (!activeCompanyId || !selectedApp) {
      return;
    }
    setReaderSnapshot((current) => {
      const next = withWorkspaceSelection(current, {
        selectedAppId: selectedApp.id,
        selectedKnowledgeId,
      });
      saveWorkspaceReaderSnapshot(activeCompanyId, next);
      return next;
    });
  }, [activeCompanyId, selectedApp, selectedKnowledgeId]);

  useEffect(() => {
    if (!activeCompanyId || !selectedFile?.key) {
      return;
    }
    setReaderSnapshot((current) => {
      const next = recordWorkspaceFileVisit(current, selectedFile.key);
      saveWorkspaceReaderSnapshot(activeCompanyId, next);
      return next;
    });
  }, [activeCompanyId, selectedFile?.key]);

  return (
    <WorkspacePageContent
      activeCompanyName={activeCompany.name}
      workspaceApps={workspaceApps}
      workspaceAppsAreExplicit={workspaceAppsAreExplicit}
      selectedApp={selectedApp}
      selectedAppManifest={selectedAppManifest}
      selectedFile={selectedFile}
      selectedFileKey={selectedFileKey}
      selectedFileContent={selectedFileContent}
      loadingFileKey={loadingFileKey}
      activeWorkspaceWorkItem={
        activeWorkspaceWorkItem
          ? {
              id: activeWorkspaceWorkItem.id,
              title: activeWorkspaceWorkItem.title,
              displayOwnerLabel: activeWorkspaceWorkItem.displayOwnerLabel,
              ownerLabel: activeWorkspaceWorkItem.ownerLabel,
              displayStage: activeWorkspaceWorkItem.displayStage,
              stageLabel: activeWorkspaceWorkItem.stageLabel,
              displayNextAction: activeWorkspaceWorkItem.displayNextAction,
              nextAction: activeWorkspaceWorkItem.nextAction,
            }
          : null
      }
      artifactBackedWorkspaceCount={artifactBackedWorkspaceCount}
      mirroredOnlyWorkspaceCount={mirroredOnlyWorkspaceCount}
      shouldSyncProviderWorkspace={shouldSyncProviderWorkspace}
      chapterFiles={chapterFiles}
      canonFiles={canonFiles}
      reviewFiles={reviewFiles}
      readerIndex={readerIndex}
      readerManifest={readerManifest}
      knowledgeFiles={knowledgeFiles}
      knowledgeItems={knowledgeItems}
      selectedKnowledgeItem={selectedKnowledgeItem}
      selectedKnowledgeSourceFiles={selectedKnowledgeSourceFiles}
      toolingFiles={toolingFiles}
      supplementaryFiles={supplementaryFiles}
      workspaceFiles={workspaceFiles}
      anchors={anchors}
      skillDefinitions={skillDefinitions}
      skillRuns={skillRuns}
      capabilityRequests={capabilityRequests}
      capabilityIssues={capabilityIssues}
      ctoLabel={ctoEmployee ? agentLabelById.get(ctoEmployee.agentId) ?? ctoEmployee.agentId : null}
      businessLeadLabel={businessLead?.nickname ?? activeWorkspaceWorkItem?.displayOwnerLabel ?? null}
      publishedAppTemplates={publishedAppTemplates}
      loadingIndex={loadingIndex}
      onRefreshIndex={refreshIndex}
      onRunAppManifestAction={runAppManifestAction}
      onSelectApp={(nextAppId) => {
        setSelectedAppId(nextAppId);
        setSelectedFileKey(null);
      }}
      onSelectFile={setSelectedFileKey}
      onSelectKnowledge={(knowledgeId) => {
        setSelectedKnowledgeId(knowledgeId);
        setSelectedFileKey(null);
      }}
      onOpenCtoWorkbench={openCtoWorkbench}
      onPublishTemplateApp={publishTemplateApp}
      onGenerateAppManifestDraft={generateAppManifestDraft}
      onCreateSkillDraft={upsertSkillDraft}
      onCreateCapabilityRequest={createCapabilityRequestDraft}
      onCreateCapabilityIssue={createCapabilityIssueDraft}
      onUpdateSkillStatus={updateSkillStatus}
      onUpdateCapabilityRequestStatus={updateCapabilityRequestStatus}
      onUpdateCapabilityIssueStatus={updateCapabilityIssueStatus}
      onPublishRecommendedApps={workspaceAppsAreExplicit ? undefined : publishRecommendedApps}
      onOpenRequirementCenter={
        activeWorkspaceWorkItem
          ? () => navigate("/requirement")
          : undefined
      }
      onOpenFileChat={(nextAgentId) => navigate(`/chat/${encodeURIComponent(nextAgentId)}`)}
      onOpenCtoChat={() => {
        if (ctoEmployee) {
          navigate(`/chat/${encodeURIComponent(ctoEmployee.agentId)}`);
        }
      }}
    />
  );
}
