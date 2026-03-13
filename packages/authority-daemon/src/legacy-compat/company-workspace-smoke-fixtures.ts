import type { ArtifactRecord } from "../../../../src/domain/artifact/types";
import type { Company, CompanyWorkspaceApp } from "../../../../src/domain/org/types";
import type { AuthorityCompanyRuntimeSnapshot } from "../../../../src/infrastructure/authority/contract";
import {
  buildRecommendedWorkspaceApps,
  publishWorkspaceApp,
  resolveWorkspaceAppTemplate,
} from "../../../../src/application/company/workspace-apps";
import {
  buildPresetWorkspaceAppManifest,
  type WorkspaceAppManifest,
} from "../../../../src/application/workspace/app-manifest";

function buildEmptyRuntime(companyId: string, now: number): AuthorityCompanyRuntimeSnapshot {
  return {
    companyId,
    activeRoomRecords: [],
    activeMissionRecords: [],
    activeConversationStates: [],
    activeWorkItems: [],
    activeRequirementAggregates: [],
    activeRequirementEvidence: [],
    primaryRequirementId: null,
    activeRoundRecords: [],
    activeArtifacts: [],
    activeDispatches: [],
    activeRoomBindings: [],
    activeSupportRequests: [],
    activeEscalations: [],
    activeDecisionTickets: [],
    activeAgentSessions: [],
    activeAgentRuns: [],
    activeAgentRuntime: [],
    activeAgentStatuses: [],
    activeAgentStatusHealth: {
      source: "authority",
      coverage: "authority_partial",
      coveredAgentCount: 0,
      expectedAgentCount: 0,
      missingAgentIds: [],
      isComplete: false,
      generatedAt: now,
      note: "Authority runtime has not projected canonical agent statuses yet.",
    },
    updatedAt: now,
  };
}

function getDefaultWorkspaceApps(company: Company) {
  return buildRecommendedWorkspaceApps(company);
}

function findAppByTemplate(apps: CompanyWorkspaceApp[], template: CompanyWorkspaceApp["template"]) {
  return apps.find((app) => resolveWorkspaceAppTemplate(app) === template) ?? null;
}

function buildSeedArtifact(input: {
  company: Company;
  id: string;
  title: string;
  kind: string;
  summary: string;
  content: string;
  sourceName: string;
  sourcePath: string;
  ownerActorId?: string | null;
  resourceType: NonNullable<ArtifactRecord["resourceType"]>;
  resourceTags: string[];
}) {
  return {
    id: input.id,
    title: input.title,
    kind: input.kind,
    status: "ready",
    ownerActorId: input.ownerActorId ?? null,
    sourceActorId: input.ownerActorId ?? null,
    sourceName: input.sourceName,
    sourcePath: input.sourcePath,
    summary: input.summary,
    content: input.content,
    resourceType: input.resourceType,
    resourceTags: input.resourceTags,
    createdAt: input.company.createdAt,
    updatedAt: input.company.createdAt,
  } satisfies ArtifactRecord;
}

function buildDefaultManifestSummary(
  app: Pick<CompanyWorkspaceApp, "kind" | "title" | "template" | "slug">,
) {
  switch (resolveWorkspaceAppTemplate(app)) {
    case "reader":
      return `${app.title} 的系统基线 manifest，用于显式声明主体内容、参考资料和报告入口。`;
    case "consistency":
      return `${app.title} 的系统基线 manifest，用于显式声明规则参考、检查报告和校验动作。`;
    case "knowledge":
      return `${app.title} 的系统基线 manifest，用于显式声明正式来源、依据和验收信息。`;
    case "workbench":
      return `${app.title} 的系统基线 manifest，用于显式声明能力治理入口、默认动作和空状态。`;
    case "review-console":
      return `${app.title} 的系统基线 manifest，用于显式声明审阅报告、预检动作和反馈入口。`;
    case "dashboard":
      return `${app.title} 的系统基线 manifest，用于显式声明状态数据、关键指标和监控入口。`;
    case "generic-app":
      return `${app.title} 的系统基线 manifest，用于显式声明通用资源入口、默认反馈动作和运行边界。`;
  }
}

function ensureExplicitBaselineManifests(input: {
  company: Company;
  apps: CompanyWorkspaceApp[];
  artifacts: ArtifactRecord[];
  ownerActorId?: string | null;
}) {
  const nextArtifacts = [...input.artifacts];
  const nextApps = input.apps.map((app) => {
    if (app.manifestArtifactId) {
      return app;
    }
    const manifestArtifactId = `workspace-app-manifest:${input.company.id}:${app.id}`;
    const sourceName = `workspace-app-manifest.${app.slug}.json`;
    const manifest = buildPresetWorkspaceAppManifest({
      app,
      title: `${input.company.name} · ${app.title}`,
      sourceLabel: "系统基线",
    });
    nextArtifacts.push(
      buildSeedArtifact({
        company: input.company,
        id: manifestArtifactId,
        title: sourceName,
        kind: "app_manifest",
        summary: buildDefaultManifestSummary(app),
        content: JSON.stringify(manifest, null, 2),
        sourceName,
        sourcePath: `workspace-seeds/${sourceName}`,
        ownerActorId: input.ownerActorId ?? null,
        resourceType: "other",
        resourceTags: ["tech.app-manifest", `app.${app.slug}`],
      }),
    );
    return {
      ...app,
      manifestArtifactId,
    };
  });

  return {
    apps: nextApps,
    artifacts: nextArtifacts,
  };
}

function buildContentFactoryBaseline(company: Company, apps: CompanyWorkspaceApp[]) {
  const now = company.createdAt;
  const cooAgentId = company.employees.find((employee) => employee.metaRole === "coo")?.agentId ?? null;
  const ctoAgentId = company.employees.find((employee) => employee.metaRole === "cto")?.agentId ?? null;
  const businessOwnerId =
    company.employees.find((employee) => !employee.isMeta)?.agentId
    ?? cooAgentId
    ?? ctoAgentId
    ?? null;

  const contentArtifact = buildSeedArtifact({
    company,
    id: `seed:${company.id}:content-primary`,
    title: "本周主线内容计划",
    kind: "seed_document",
    summary: "用于验收内容查看器的主体内容样本，确保非小说场景也有稳定的主内容入口。",
    content: [
      "# 本周主线内容计划",
      "",
      "## 目标",
      "- 输出 1 篇深度行业分析",
      "- 输出 3 条社媒短帖",
      "- 统一语气与 CTA",
      "",
      "## 主体内容样本",
      "内容工厂本周聚焦“AI 内容工作流”的可复制流程，文章主体会围绕选题、提纲、事实校验和分发节奏展开。",
      "",
      "## 交付口径",
      "- 先出长文主稿",
      "- 再拆成社媒物料",
      "- 所有版本都要保留出处和事实校验说明",
    ].join("\n"),
    sourceName: "content-primary.md",
    sourcePath: "workspace-seeds/content-primary.md",
    ownerActorId: businessOwnerId,
    resourceType: "document",
    resourceTags: ["content.primary", "company.resource"],
  });

  const referenceArtifact = buildSeedArtifact({
    company,
    id: `seed:${company.id}:domain-reference`,
    title: "选题与风格约束",
    kind: "seed_document",
    summary: "用于验收内容查看器和规则校验入口的参考资料样本。",
    content: [
      "# 选题与风格约束",
      "",
      "## 事实要求",
      "- 不得捏造数据来源",
      "- 关键结论必须有出处",
      "",
      "## 风格要求",
      "- 结论先行",
      "- 避免空泛口号",
      "- 保持专业但不过度学术",
      "",
      "## CTA 约束",
      "- CTA 只允许 1 个主动作",
      "- 不要在同一段落混入多个转化目标",
    ].join("\n"),
    sourceName: "domain-reference.md",
    sourcePath: "workspace-seeds/domain-reference.md",
    ownerActorId: ctoAgentId ?? cooAgentId,
    resourceType: "document",
    resourceTags: ["domain.reference", "company.knowledge", "company.resource"],
  });

  const reportArtifact = buildSeedArtifact({
    company,
    id: `seed:${company.id}:ops-report`,
    title: "首轮交付复盘",
    kind: "seed_report",
    summary: "用于验收非小说场景报告回看和问题反馈链路的样本报告。",
    content: [
      "# 首轮交付复盘",
      "",
      "## 当前判断",
      "- 主体内容结构清晰",
      "- 参考资料仍需补 1 份外部来源",
      "- 社媒拆分节奏可以继续细化",
      "",
      "## 风险",
      "- 如果事实出处不足，后续预检会直接阻塞",
      "",
      "## 下一步",
      "- 补齐外部来源",
      "- 走一次预检",
      "- 再进入交付确认",
    ].join("\n"),
    sourceName: "ops-report.md",
    sourcePath: "workspace-seeds/ops-report.md",
    ownerActorId: cooAgentId,
    resourceType: "report",
    resourceTags: ["ops.report", "qa.report", "company.resource"],
  });

  const readerApp = findAppByTemplate(apps, "reader");
  if (!readerApp) {
    return {
      company: {
        ...company,
        workspaceApps: apps,
      },
      runtime: {
        ...buildEmptyRuntime(company.id, now),
        activeArtifacts: [contentArtifact, referenceArtifact, reportArtifact],
      },
    };
  }

  const manifestArtifactId = `workspace-app-manifest:${company.id}:${readerApp.id}`;
  const manifest: WorkspaceAppManifest = {
    version: 1,
    appId: readerApp.id,
    appSlug: readerApp.slug,
    title: `${company.name} · 内容查看器`,
    sourceLabel: "系统基线",
    draft: false,
    sections: [
      {
        id: "reader-content",
        label: "内容",
        slot: "content",
        order: 0,
        selectors: [{ tags: ["content.primary"] }],
        emptyState: "当前还没有主体内容。",
      },
      {
        id: "reader-reference",
        label: "参考",
        slot: "reference",
        order: 1,
        selectors: [{ tags: ["domain.reference"] }],
        emptyState: "当前还没有参考资料。",
      },
      {
        id: "reader-reports",
        label: "报告",
        slot: "reports",
        order: 2,
        selectors: [{ tags: ["ops.report", "qa.report"] }, { resourceTypes: ["report"] }],
        emptyState: "当前还没有报告。",
      },
    ],
    resources: [
      {
        id: "baseline-content",
        slot: "content",
        title: contentArtifact.title,
        artifactId: contentArtifact.id,
        resourceType: contentArtifact.resourceType,
        tags: contentArtifact.resourceTags,
      },
      {
        id: "baseline-reference",
        slot: "reference",
        title: referenceArtifact.title,
        artifactId: referenceArtifact.id,
        resourceType: referenceArtifact.resourceType,
        tags: referenceArtifact.resourceTags,
      },
      {
        id: "baseline-report",
        slot: "reports",
        title: reportArtifact.title,
        artifactId: reportArtifact.id,
        resourceType: reportArtifact.resourceType,
        tags: reportArtifact.resourceTags,
      },
    ],
    actions: [
      {
        id: "trigger-reader-index",
        label: "重建内容索引",
        actionType: "trigger_skill",
        target: "reader.build-index",
      },
      {
        id: "refresh-reader-manifest",
        label: "刷新 AppManifest",
        actionType: "refresh_manifest",
        target: "reader",
      },
      {
        id: "report-reader-issue",
        label: "反馈查看器问题",
        actionType: "report_issue",
        target: "reader.build-index",
        input: { type: "bad_result" },
      },
    ],
  };

  const manifestArtifact = buildSeedArtifact({
    company,
    id: manifestArtifactId,
    title: "workspace-app-manifest.reader.json",
    kind: "app_manifest",
    summary: "内容查看器的系统基线 manifest，用于验证非小说场景下的显式资源绑定。",
    content: JSON.stringify(manifest, null, 2),
    sourceName: "workspace-app-manifest.reader.json",
    sourcePath: "workspace-seeds/workspace-app-manifest.reader.json",
    ownerActorId: ctoAgentId,
    resourceType: "other",
    resourceTags: ["tech.app-manifest", `app.${readerApp.slug}`],
  });

  const finalized = ensureExplicitBaselineManifests({
    company,
    apps: apps.map((app) => (app.id === readerApp.id ? { ...app, manifestArtifactId } : app)),
    artifacts: [contentArtifact, referenceArtifact, reportArtifact, manifestArtifact],
    ownerActorId: ctoAgentId ?? cooAgentId ?? businessOwnerId,
  });

  return {
    company: {
      ...company,
      workspaceApps: finalized.apps,
    },
    runtime: {
      ...buildEmptyRuntime(company.id, now),
      activeArtifacts: finalized.artifacts,
    },
  };
}

function buildCustomerServiceBaseline(company: Company, apps: CompanyWorkspaceApp[]) {
  const now = company.createdAt;
  const ctoAgentId = company.employees.find((employee) => employee.metaRole === "cto")?.agentId ?? null;
  const ceoAgentId = company.employees.find((employee) => employee.metaRole === "ceo")?.agentId ?? null;
  const businessOwnerId =
    company.employees.find((employee) => !employee.isMeta)?.agentId
    ?? ceoAgentId
    ?? ctoAgentId
    ?? null;

  const baseCompany = {
    ...company,
    workspaceApps: apps,
  };
  const appsWithReader = publishWorkspaceApp(baseCompany, {
    template: "reader",
    title: "知识查看器",
    description: "集中查看客服知识依据、工单上下文和质检报告，不再在多个入口之间来回切换。",
  });
  const appsWithDashboard = publishWorkspaceApp(
    {
      ...baseCompany,
      workspaceApps: appsWithReader,
    },
    {
      template: "dashboard",
      title: "客服队列看板",
      description: "聚合当前队列状态、升级工单样本和质检结果，帮助业务负责人快速判断下一步动作。",
      surface: "embedded",
      embeddedHostKey: "dashboard",
      embeddedPermissions: {
        resources: "manifest-scoped",
        appState: "readwrite",
        companyWrites: "none",
        actions: "whitelisted",
      },
    },
  );
  const finalApps = publishWorkspaceApp(
    {
      ...baseCompany,
      workspaceApps: appsWithDashboard,
    },
    {
      template: "review-console",
      title: "质检控制台",
      description: "把异常工单、质检报告和交付前检查收在一个受控入口里。",
      surface: "embedded",
      embeddedHostKey: "review-console",
      embeddedPermissions: {
        resources: "manifest-scoped",
        appState: "readwrite",
        companyWrites: "none",
        actions: "whitelisted",
      },
    },
  );

  const dashboardApp = findAppByTemplate(finalApps, "dashboard");
  const reviewConsoleApp = findAppByTemplate(finalApps, "review-console");

  const queueStateArtifact = buildSeedArtifact({
    company,
    id: `seed:${company.id}:queue-state`,
    title: "当前队列状态快照",
    kind: "seed_state",
    summary: "用于验收客服队列看板的状态样本，验证仪表盘宿主可以直接消费显式状态资源。",
    content: [
      "# 当前队列状态快照",
      "",
      "- 待接入工单：18",
      "- 高优先工单：3",
      "- 平均首响：4 分钟",
      "- 待升级：1",
      "",
      "## 当前判断",
      "- 高优先工单集中在支付失败与物流延迟",
      "- 当前知识依据完整，但夜间队列波动较大",
    ].join("\n"),
    sourceName: "queue-state.md",
    sourcePath: "workspace-seeds/queue-state.md",
    ownerActorId: businessOwnerId,
    resourceType: "state",
    resourceTags: ["ops.state", "service.queue", "company.resource"],
  });

  const ticketDatasetArtifact = buildSeedArtifact({
    company,
    id: `seed:${company.id}:ticket-dataset`,
    title: "升级工单样本",
    kind: "seed_dataset",
    summary: "用于验收队列看板与质检控制台的工单样本。",
    content: JSON.stringify(
      {
        tickets: [
          {
            id: "ticket-1001",
            priority: "high",
            topic: "支付失败",
            owner: "小客",
            nextAction: "等待支付渠道回执",
          },
          {
            id: "ticket-1002",
            priority: "medium",
            topic: "物流延迟",
            owner: "小客",
            nextAction: "准备升级到人工物流客服",
          },
        ],
      },
      null,
      2,
    ),
    sourceName: "ticket-dataset.json",
    sourcePath: "workspace-seeds/ticket-dataset.json",
    ownerActorId: businessOwnerId,
    resourceType: "dataset",
    resourceTags: ["ops.state", "service.ticket", "company.resource"],
  });

  const knowledgeArtifact = buildSeedArtifact({
    company,
    id: `seed:${company.id}:knowledge-reference`,
    title: "客服处置规则",
    kind: "seed_document",
    summary: "用于验收客服知识查看器与规则校验入口的显式参考资料。",
    content: [
      "# 客服处置规则",
      "",
      "## 支付失败",
      "- 先核对支付渠道状态",
      "- 不得承诺未确认到账的退款时间",
      "",
      "## 物流延迟",
      "- 24 小时内必须给出一次明确回访",
      "- 超过 48 小时自动进入升级队列",
      "",
      "## 升级标准",
      "- 连续两次未解决",
      "- 涉及退款/投诉/平台处罚风险",
    ].join("\n"),
    sourceName: "service-rules.md",
    sourcePath: "workspace-seeds/service-rules.md",
    ownerActorId: ctoAgentId,
    resourceType: "document",
    resourceTags: ["domain.reference", "company.knowledge", "company.resource"],
  });

  const qaReportArtifact = buildSeedArtifact({
    company,
    id: `seed:${company.id}:qa-report`,
    title: "质检日报",
    kind: "seed_report",
    summary: "用于验收非内容型业务下的报告回看、问题反馈和审阅控制台入口。",
    content: [
      "# 质检日报",
      "",
      "## 今日判断",
      "- 话术一致性整体稳定",
      "- 退款说明有 1 次口径不一致",
      "- 升级工单记录完整",
      "",
      "## 阻塞提醒",
      "- 如未补齐退款标准解释，后续预检会标为待补齐",
    ].join("\n"),
    sourceName: "qa-daily-report.md",
    sourcePath: "workspace-seeds/qa-daily-report.md",
    ownerActorId: ceoAgentId,
    resourceType: "report",
    resourceTags: ["ops.report", "qa.report", "company.resource"],
  });

  const dashboardManifestArtifactId = dashboardApp
    ? `workspace-app-manifest:${company.id}:${dashboardApp.id}`
    : null;
  const dashboardManifestArtifact =
    dashboardApp && dashboardManifestArtifactId
      ? buildSeedArtifact({
          company,
          id: dashboardManifestArtifactId,
          title: "workspace-app-manifest.workspace-dashboard.json",
          kind: "app_manifest",
          summary: "客服队列看板的系统基线 manifest，用于验证状态/数据型场景下的显式资源绑定。",
          content: JSON.stringify(
            {
              version: 1,
              appId: dashboardApp.id,
              appSlug: dashboardApp.slug,
              title: `${company.name} · 客服队列看板`,
              sourceLabel: "系统基线",
              draft: false,
              sections: [
                {
                  id: "dashboard-state",
                  label: "状态数据",
                  slot: "state",
                  order: 0,
                  selectors: [
                    { resourceTypes: ["state", "dataset"] },
                    { tags: ["ops.state", "service.queue", "service.ticket"] },
                  ],
                  emptyState: "当前还没有状态或工单数据。",
                },
                {
                  id: "dashboard-reference",
                  label: "知识依据",
                  slot: "reference",
                  order: 1,
                  selectors: [{ tags: ["domain.reference", "company.knowledge"] }],
                  emptyState: "当前还没有知识依据。",
                },
                {
                  id: "dashboard-reports",
                  label: "质检报告",
                  slot: "reports",
                  order: 2,
                  selectors: [{ tags: ["ops.report", "qa.report"] }, { resourceTypes: ["report"] }],
                  emptyState: "当前还没有质检报告。",
                },
              ],
              resources: [
                {
                  id: "queue-state",
                  slot: "state",
                  title: queueStateArtifact.title,
                  artifactId: queueStateArtifact.id,
                  resourceType: queueStateArtifact.resourceType,
                  tags: queueStateArtifact.resourceTags,
                },
                {
                  id: "ticket-dataset",
                  slot: "state",
                  title: ticketDatasetArtifact.title,
                  artifactId: ticketDatasetArtifact.id,
                  resourceType: ticketDatasetArtifact.resourceType,
                  tags: ticketDatasetArtifact.resourceTags,
                },
                {
                  id: "service-rules",
                  slot: "reference",
                  title: knowledgeArtifact.title,
                  artifactId: knowledgeArtifact.id,
                  resourceType: knowledgeArtifact.resourceType,
                  tags: knowledgeArtifact.resourceTags,
                },
                {
                  id: "qa-report",
                  slot: "reports",
                  title: qaReportArtifact.title,
                  artifactId: qaReportArtifact.id,
                  resourceType: qaReportArtifact.resourceType,
                  tags: qaReportArtifact.resourceTags,
                },
              ],
              actions: [
                {
                  id: "request-review-console",
                  label: "让 CTO 补审阅控制台",
                  actionType: "workbench_request",
                  target: "chapter-review-console",
                },
                {
                  id: "report-dashboard-issue",
                  label: "反馈队列看板问题",
                  actionType: "report_issue",
                  target: "dashboard",
                  input: { type: "runtime_error" },
                },
              ],
            } satisfies WorkspaceAppManifest,
            null,
            2,
          ),
          sourceName: "workspace-app-manifest.workspace-dashboard.json",
          sourcePath: "workspace-seeds/workspace-app-manifest.workspace-dashboard.json",
          ownerActorId: ctoAgentId,
          resourceType: "other",
          resourceTags: ["tech.app-manifest", `app.${dashboardApp.slug}`],
        })
      : null;

  const reviewManifestArtifactId = reviewConsoleApp
    ? `workspace-app-manifest:${company.id}:${reviewConsoleApp.id}`
    : null;
  const reviewManifestArtifact =
    reviewConsoleApp && reviewManifestArtifactId
      ? buildSeedArtifact({
          company,
          id: reviewManifestArtifactId,
          title: "workspace-app-manifest.review-console.json",
          kind: "app_manifest",
          summary: "质检控制台的系统基线 manifest，用于验证非内容型业务下的审阅控制台入口。",
          content: JSON.stringify(
            {
              version: 1,
              appId: reviewConsoleApp.id,
              appSlug: reviewConsoleApp.slug,
              title: `${company.name} · 质检控制台`,
              sourceLabel: "系统基线",
              draft: false,
              sections: [
                {
                  id: "review-console-tickets",
                  label: "异常工单",
                  slot: "tickets",
                  order: 0,
                  selectors: [
                    { resourceTypes: ["state", "dataset"] },
                    { tags: ["ops.state", "service.ticket"] },
                  ],
                  emptyState: "当前还没有异常工单。",
                },
                {
                  id: "review-console-reports",
                  label: "质检报告",
                  slot: "reports",
                  order: 1,
                  selectors: [{ tags: ["ops.report", "qa.report"] }, { resourceTypes: ["report"] }],
                  emptyState: "当前还没有质检报告。",
                },
              ],
              resources: [
                {
                  id: "review-ticket-dataset",
                  slot: "tickets",
                  title: ticketDatasetArtifact.title,
                  artifactId: ticketDatasetArtifact.id,
                  resourceType: ticketDatasetArtifact.resourceType,
                  tags: ticketDatasetArtifact.resourceTags,
                },
                {
                  id: "review-qa-report",
                  slot: "reports",
                  title: qaReportArtifact.title,
                  artifactId: qaReportArtifact.id,
                  resourceType: qaReportArtifact.resourceType,
                  tags: qaReportArtifact.resourceTags,
                },
              ],
            } satisfies WorkspaceAppManifest,
            null,
            2,
          ),
          sourceName: "workspace-app-manifest.review-console.json",
          sourcePath: "workspace-seeds/workspace-app-manifest.review-console.json",
          ownerActorId: ctoAgentId,
          resourceType: "other",
          resourceTags: ["tech.app-manifest", `app.${reviewConsoleApp.slug}`],
        })
      : null;

  const finalized = ensureExplicitBaselineManifests({
    company,
    apps: finalApps.map((app) => {
      if (dashboardManifestArtifactId && app.id === dashboardApp?.id) {
        return { ...app, manifestArtifactId: dashboardManifestArtifactId };
      }
      if (reviewManifestArtifactId && app.id === reviewConsoleApp?.id) {
        return { ...app, manifestArtifactId: reviewManifestArtifactId };
      }
      return app;
    }),
    artifacts: [
      queueStateArtifact,
      ticketDatasetArtifact,
      knowledgeArtifact,
      qaReportArtifact,
      ...(dashboardManifestArtifact ? [dashboardManifestArtifact] : []),
      ...(reviewManifestArtifact ? [reviewManifestArtifact] : []),
    ],
    ownerActorId: ctoAgentId ?? ceoAgentId ?? businessOwnerId,
  });

  return {
    company: {
      ...company,
      workspaceApps: finalized.apps,
    },
    runtime: {
      ...buildEmptyRuntime(company.id, now),
      activeArtifacts: finalized.artifacts,
    },
  };
}

function buildResearchLabBaseline(company: Company, apps: CompanyWorkspaceApp[]) {
  const now = company.createdAt;
  const ctoAgentId = company.employees.find((employee) => employee.metaRole === "cto")?.agentId ?? null;
  const cooAgentId = company.employees.find((employee) => employee.metaRole === "coo")?.agentId ?? null;
  const businessOwnerId =
    company.employees.find((employee) => !employee.isMeta)?.agentId
    ?? cooAgentId
    ?? ctoAgentId
    ?? null;

  const baseCompany = {
    ...company,
    workspaceApps: apps,
  };
  const appsWithReader = publishWorkspaceApp(baseCompany, {
    template: "reader",
    title: "文献查看器",
    description: "集中查看文献综述、实验方案和评审结论，不再在资料和结果之间来回切换。",
  });
  const appsWithDashboard = publishWorkspaceApp(
    {
      ...baseCompany,
      workspaceApps: appsWithReader,
    },
    {
      template: "dashboard",
      title: "实验看板",
      description: "聚合实验进度、数据快照和关键风险，帮助研究负责人快速判断下一步动作。",
      surface: "embedded",
      embeddedHostKey: "dashboard",
      embeddedPermissions: {
        resources: "manifest-scoped",
        appState: "readwrite",
        companyWrites: "none",
        actions: "whitelisted",
      },
    },
  );
  const finalApps = publishWorkspaceApp(
    {
      ...baseCompany,
      workspaceApps: appsWithDashboard,
    },
    {
      template: "review-console",
      title: "研究审阅台",
      description: "把评审意见、风险记录和验收前检查收在一个受控入口里。",
      surface: "embedded",
      embeddedHostKey: "review-console",
      embeddedPermissions: {
        resources: "manifest-scoped",
        appState: "readwrite",
        companyWrites: "none",
        actions: "whitelisted",
      },
    },
  );

  const readerApp = findAppByTemplate(finalApps, "reader");
  const dashboardApp = findAppByTemplate(finalApps, "dashboard");
  const reviewConsoleApp = findAppByTemplate(finalApps, "review-console");

  const paperArtifact = buildSeedArtifact({
    company,
    id: `seed:${company.id}:paper-primary`,
    title: "本周前沿文献综述",
    kind: "seed_document",
    summary: "用于验收研究场景查看器的主体内容样本，验证平台可以承接文献类主内容。",
    content: [
      "# 本周前沿文献综述",
      "",
      "## 主题",
      "- 多智能体协作中的长期记忆",
      "- 数据清洗对实验稳定性的影响",
      "- 小样本反馈回路的有效性",
      "",
      "## 当前结论",
      "本周主综述聚焦“低成本实验闭环”，重点比较了记忆压缩、工具路由和反馈注入三条路径的收益与风险。",
      "",
      "## 下一步",
      "- 继续补 2 篇对照论文",
      "- 把实验假设固化成正式方案",
      "- 进入实验预检",
    ].join("\n"),
    sourceName: "paper-primary.md",
    sourcePath: "workspace-seeds/paper-primary.md",
    ownerActorId: businessOwnerId,
    resourceType: "document",
    resourceTags: ["content.primary", "research.paper", "company.resource"],
  });

  const protocolArtifact = buildSeedArtifact({
    company,
    id: `seed:${company.id}:experiment-reference`,
    title: "实验方案与变量定义",
    kind: "seed_document",
    summary: "用于验收研究场景下的显式参考资料与规则依据。",
    content: [
      "# 实验方案与变量定义",
      "",
      "## 假设",
      "- 记忆压缩后仍能维持关键任务完成率",
      "- 引入反馈回路后，二次修订命中率会上升",
      "",
      "## 关键变量",
      "- baseline completion rate",
      "- repaired completion rate",
      "- feedback latency",
      "",
      "## 约束",
      "- 每轮实验至少保留 1 组基准对照",
      "- 不允许在同一批次同时更改多项核心参数",
    ].join("\n"),
    sourceName: "experiment-reference.md",
    sourcePath: "workspace-seeds/experiment-reference.md",
    ownerActorId: ctoAgentId,
    resourceType: "document",
    resourceTags: ["domain.reference", "company.knowledge", "research.protocol", "company.resource"],
  });

  const experimentStateArtifact = buildSeedArtifact({
    company,
    id: `seed:${company.id}:experiment-state`,
    title: "实验进度快照",
    kind: "seed_state",
    summary: "用于验收实验看板的状态样本，验证仪表盘宿主可以消费研究进度与风险状态。",
    content: [
      "# 实验进度快照",
      "",
      "- 进行中实验：3",
      "- 待复核结论：1",
      "- 当前主要风险：样本量不足",
      "- 最近完成：记忆压缩 A/B 对照",
      "",
      "## 当前判断",
      "- 数据链路稳定，但高噪音样本仍需继续清洗",
      "- 本轮建议先完成复核，再进入下一批参数变更",
    ].join("\n"),
    sourceName: "experiment-state.md",
    sourcePath: "workspace-seeds/experiment-state.md",
    ownerActorId: businessOwnerId,
    resourceType: "state",
    resourceTags: ["ops.state", "research.experiment", "company.resource"],
  });

  const datasetArtifact = buildSeedArtifact({
    company,
    id: `seed:${company.id}:experiment-dataset`,
    title: "实验结果数据集",
    kind: "seed_dataset",
    summary: "用于验收实验看板与审阅台的数据集样本。",
    content: JSON.stringify(
      {
        experiments: [
          {
            id: "exp-01",
            variant: "memory-compression",
            baselineCompletionRate: 0.61,
            repairedCompletionRate: 0.74,
            feedbackLatencyMs: 1420,
          },
          {
            id: "exp-02",
            variant: "feedback-loop",
            baselineCompletionRate: 0.58,
            repairedCompletionRate: 0.71,
            feedbackLatencyMs: 1860,
          },
        ],
      },
      null,
      2,
    ),
    sourceName: "experiment-dataset.json",
    sourcePath: "workspace-seeds/experiment-dataset.json",
    ownerActorId: businessOwnerId,
    resourceType: "dataset",
    resourceTags: ["ops.state", "research.dataset", "company.resource"],
  });

  const reviewReportArtifact = buildSeedArtifact({
    company,
    id: `seed:${company.id}:research-review-report`,
    title: "同行评审与风险记录",
    kind: "seed_report",
    summary: "用于验收研究场景下的审阅、验收与风险回看入口。",
    content: [
      "# 同行评审与风险记录",
      "",
      "## 当前判断",
      "- 主要结论方向成立",
      "- 但样本量仍不足以支撑外推",
      "- 需补一轮对照实验再进入结项",
      "",
      "## 风险",
      "- 变量干扰尚未完全排除",
      "- 当前复核意见仍有 1 项待关闭",
    ].join("\n"),
    sourceName: "research-review-report.md",
    sourcePath: "workspace-seeds/research-review-report.md",
    ownerActorId: cooAgentId ?? businessOwnerId,
    resourceType: "report",
    resourceTags: ["ops.report", "qa.report", "company.resource"],
  });

  const readerManifestArtifactId = readerApp ? `workspace-app-manifest:${company.id}:${readerApp.id}` : null;
  const readerManifestArtifact =
    readerApp && readerManifestArtifactId
      ? buildSeedArtifact({
          company,
          id: readerManifestArtifactId,
          title: "workspace-app-manifest.reader.json",
          kind: "app_manifest",
          summary: "文献查看器的系统基线 manifest，用于验证研究场景下的显式资源绑定。",
          content: JSON.stringify(
            {
              version: 1,
              appId: readerApp.id,
              appSlug: readerApp.slug,
              title: `${company.name} · 文献查看器`,
              sourceLabel: "系统基线",
              draft: false,
              sections: [
                {
                  id: "reader-content",
                  label: "内容",
                  slot: "content",
                  order: 0,
                  selectors: [{ tags: ["content.primary", "research.paper"] }],
                  emptyState: "当前还没有可阅读的研究主体内容。",
                },
                {
                  id: "reader-reference",
                  label: "参考",
                  slot: "reference",
                  order: 1,
                  selectors: [{ tags: ["domain.reference", "research.protocol"] }],
                  emptyState: "当前还没有实验方案或参考资料。",
                },
                {
                  id: "reader-reports",
                  label: "报告",
                  slot: "reports",
                  order: 2,
                  selectors: [{ tags: ["ops.report", "qa.report"] }, { resourceTypes: ["report"] }],
                  emptyState: "当前还没有审阅或风险报告。",
                },
              ],
              resources: [
                {
                  id: "paper-primary",
                  slot: "content",
                  title: paperArtifact.title,
                  artifactId: paperArtifact.id,
                  resourceType: paperArtifact.resourceType,
                  tags: paperArtifact.resourceTags,
                },
                {
                  id: "experiment-reference",
                  slot: "reference",
                  title: protocolArtifact.title,
                  artifactId: protocolArtifact.id,
                  resourceType: protocolArtifact.resourceType,
                  tags: protocolArtifact.resourceTags,
                },
                {
                  id: "research-review-report",
                  slot: "reports",
                  title: reviewReportArtifact.title,
                  artifactId: reviewReportArtifact.id,
                  resourceType: reviewReportArtifact.resourceType,
                  tags: reviewReportArtifact.resourceTags,
                },
              ],
              actions: [
                {
                  id: "trigger-reader-index",
                  label: "重建内容索引",
                  actionType: "trigger_skill",
                  target: "reader.build-index",
                },
                {
                  id: "report-reader-issue",
                  label: "反馈查看器问题",
                  actionType: "report_issue",
                  target: "reader.build-index",
                  input: { type: "bad_result" },
                },
              ],
            } satisfies WorkspaceAppManifest,
            null,
            2,
          ),
          sourceName: "workspace-app-manifest.reader.json",
          sourcePath: "workspace-seeds/workspace-app-manifest.reader.json",
          ownerActorId: ctoAgentId,
          resourceType: "other",
          resourceTags: ["tech.app-manifest", `app.${readerApp.slug}`],
        })
      : null;

  const dashboardManifestArtifactId = dashboardApp
    ? `workspace-app-manifest:${company.id}:${dashboardApp.id}`
    : null;
  const dashboardManifestArtifact =
    dashboardApp && dashboardManifestArtifactId
      ? buildSeedArtifact({
          company,
          id: dashboardManifestArtifactId,
          title: "workspace-app-manifest.workspace-dashboard.json",
          kind: "app_manifest",
          summary: "实验看板的系统基线 manifest，用于验证研究场景下的状态/数据绑定。",
          content: JSON.stringify(
            {
              version: 1,
              appId: dashboardApp.id,
              appSlug: dashboardApp.slug,
              title: `${company.name} · 实验看板`,
              sourceLabel: "系统基线",
              draft: false,
              sections: [
                {
                  id: "dashboard-state",
                  label: "实验状态",
                  slot: "state",
                  order: 0,
                  selectors: [
                    { resourceTypes: ["state", "dataset"] },
                    { tags: ["ops.state", "research.experiment", "research.dataset"] },
                  ],
                  emptyState: "当前还没有实验状态或数据集。",
                },
                {
                  id: "dashboard-reference",
                  label: "方法依据",
                  slot: "reference",
                  order: 1,
                  selectors: [{ tags: ["domain.reference", "research.protocol"] }],
                  emptyState: "当前还没有可对照的方法依据。",
                },
                {
                  id: "dashboard-reports",
                  label: "评审报告",
                  slot: "reports",
                  order: 2,
                  selectors: [{ tags: ["ops.report", "qa.report"] }, { resourceTypes: ["report"] }],
                  emptyState: "当前还没有评审报告。",
                },
              ],
              resources: [
                {
                  id: "experiment-state",
                  slot: "state",
                  title: experimentStateArtifact.title,
                  artifactId: experimentStateArtifact.id,
                  resourceType: experimentStateArtifact.resourceType,
                  tags: experimentStateArtifact.resourceTags,
                },
                {
                  id: "experiment-dataset",
                  slot: "state",
                  title: datasetArtifact.title,
                  artifactId: datasetArtifact.id,
                  resourceType: datasetArtifact.resourceType,
                  tags: datasetArtifact.resourceTags,
                },
                {
                  id: "experiment-reference",
                  slot: "reference",
                  title: protocolArtifact.title,
                  artifactId: protocolArtifact.id,
                  resourceType: protocolArtifact.resourceType,
                  tags: protocolArtifact.resourceTags,
                },
                {
                  id: "research-review-report",
                  slot: "reports",
                  title: reviewReportArtifact.title,
                  artifactId: reviewReportArtifact.id,
                  resourceType: reviewReportArtifact.resourceType,
                  tags: reviewReportArtifact.resourceTags,
                },
              ],
              actions: [
                {
                  id: "request-review-console",
                  label: "让 CTO 补研究审阅台",
                  actionType: "workbench_request",
                  target: "chapter-review-console",
                },
                {
                  id: "report-dashboard-issue",
                  label: "反馈实验看板问题",
                  actionType: "report_issue",
                  target: "dashboard",
                  input: { type: "runtime_error" },
                },
              ],
            } satisfies WorkspaceAppManifest,
            null,
            2,
          ),
          sourceName: "workspace-app-manifest.workspace-dashboard.json",
          sourcePath: "workspace-seeds/workspace-app-manifest.workspace-dashboard.json",
          ownerActorId: ctoAgentId,
          resourceType: "other",
          resourceTags: ["tech.app-manifest", `app.${dashboardApp.slug}`],
        })
      : null;

  const reviewManifestArtifactId = reviewConsoleApp
    ? `workspace-app-manifest:${company.id}:${reviewConsoleApp.id}`
    : null;
  const reviewManifestArtifact =
    reviewConsoleApp && reviewManifestArtifactId
      ? buildSeedArtifact({
          company,
          id: reviewManifestArtifactId,
          title: "workspace-app-manifest.review-console.json",
          kind: "app_manifest",
          summary: "研究审阅台的系统基线 manifest，用于验证研究场景下的审阅入口。",
          content: JSON.stringify(
            {
              version: 1,
              appId: reviewConsoleApp.id,
              appSlug: reviewConsoleApp.slug,
              title: `${company.name} · 研究审阅台`,
              sourceLabel: "系统基线",
              draft: false,
              sections: [
                {
                  id: "review-console-state",
                  label: "实验状态",
                  slot: "state",
                  order: 0,
                  selectors: [
                    { resourceTypes: ["state", "dataset"] },
                    { tags: ["ops.state", "research.experiment", "research.dataset"] },
                  ],
                  emptyState: "当前还没有实验状态。",
                },
                {
                  id: "review-console-reports",
                  label: "评审报告",
                  slot: "reports",
                  order: 1,
                  selectors: [{ tags: ["ops.report", "qa.report"] }, { resourceTypes: ["report"] }],
                  emptyState: "当前还没有评审报告。",
                },
              ],
              resources: [
                {
                  id: "review-experiment-state",
                  slot: "state",
                  title: experimentStateArtifact.title,
                  artifactId: experimentStateArtifact.id,
                  resourceType: experimentStateArtifact.resourceType,
                  tags: experimentStateArtifact.resourceTags,
                },
                {
                  id: "review-experiment-dataset",
                  slot: "state",
                  title: datasetArtifact.title,
                  artifactId: datasetArtifact.id,
                  resourceType: datasetArtifact.resourceType,
                  tags: datasetArtifact.resourceTags,
                },
                {
                  id: "review-report",
                  slot: "reports",
                  title: reviewReportArtifact.title,
                  artifactId: reviewReportArtifact.id,
                  resourceType: reviewReportArtifact.resourceType,
                  tags: reviewReportArtifact.resourceTags,
                },
              ],
            } satisfies WorkspaceAppManifest,
            null,
            2,
          ),
          sourceName: "workspace-app-manifest.review-console.json",
          sourcePath: "workspace-seeds/workspace-app-manifest.review-console.json",
          ownerActorId: ctoAgentId,
          resourceType: "other",
          resourceTags: ["tech.app-manifest", `app.${reviewConsoleApp.slug}`],
        })
      : null;

  const finalized = ensureExplicitBaselineManifests({
    company,
    apps: finalApps.map((app) => {
      if (readerManifestArtifactId && app.id === readerApp?.id) {
        return { ...app, manifestArtifactId: readerManifestArtifactId };
      }
      if (dashboardManifestArtifactId && app.id === dashboardApp?.id) {
        return { ...app, manifestArtifactId: dashboardManifestArtifactId };
      }
      if (reviewManifestArtifactId && app.id === reviewConsoleApp?.id) {
        return { ...app, manifestArtifactId: reviewManifestArtifactId };
      }
      return app;
    }),
    artifacts: [
      paperArtifact,
      protocolArtifact,
      experimentStateArtifact,
      datasetArtifact,
      reviewReportArtifact,
      ...(readerManifestArtifact ? [readerManifestArtifact] : []),
      ...(dashboardManifestArtifact ? [dashboardManifestArtifact] : []),
      ...(reviewManifestArtifact ? [reviewManifestArtifact] : []),
    ],
    ownerActorId: ctoAgentId ?? cooAgentId ?? businessOwnerId,
  });

  return {
    company: {
      ...company,
      workspaceApps: finalized.apps,
    },
    runtime: {
      ...buildEmptyRuntime(company.id, now),
      activeArtifacts: finalized.artifacts,
    },
  };
}

export function buildLegacyCompanyWorkspaceBootstrapFixture(
  company: Company,
): {
  company: Company;
  runtime: AuthorityCompanyRuntimeSnapshot;
} | null {
  const apps = getDefaultWorkspaceApps(company);
  const nextCompany = {
    ...company,
    workspaceApps: apps,
  };
  if (company.template === "content-factory") {
    return buildContentFactoryBaseline(nextCompany, apps);
  }
  if (company.template === "customer-service") {
    return buildCustomerServiceBaseline(nextCompany, apps);
  }
  if (company.template === "research-lab") {
    return buildResearchLabBaseline(nextCompany, apps);
  }
  return null;
}
