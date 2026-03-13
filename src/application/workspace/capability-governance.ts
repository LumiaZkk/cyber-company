import type {
  CapabilityIssueRecord,
  CapabilityIssueStatus,
  CapabilityRequestRecord,
  CapabilityRequestStatus,
} from "../../domain/org/types";

export type CapabilityBoardLaneId = "backlog" | "building" | "verify" | "closed";

export type CapabilityBoardItem = {
  id: string;
  summary: string;
  detail?: string;
  statusLabel: string;
  nextActorLabel: string;
  nextActionLabel?: string;
  relatedLabels: string[];
  requesterOrReporterLabel?: string | null;
  updatedAt: number;
};

export type CapabilityBoardLane = {
  id: CapabilityBoardLaneId;
  label: string;
  description: string;
  count: number;
  items: CapabilityBoardItem[];
};

export type CapabilityVerificationItem = {
  id: string;
  kind: "request" | "issue";
  status: CapabilityRequestStatus | CapabilityIssueStatus;
  summary: string;
  detail?: string;
  statusLabel: string;
  nextActionLabel?: string;
  appId?: string | null;
  appLabel?: string | null;
  skillId?: string | null;
  skillLabel?: string | null;
  contextFileName?: string | null;
  contextRunId?: string | null;
  requesterOrReporterLabel?: string | null;
  updatedAt: number;
};

export const CAPABILITY_REQUEST_STATUS_LABEL: Record<CapabilityRequestStatus, string> = {
  open: "待分流",
  triaged: "已评估",
  building: "建设中",
  ready: "待验证",
  verified: "已验证",
  closed: "已关闭",
};

export const CAPABILITY_ISSUE_STATUS_LABEL: Record<CapabilityIssueStatus, string> = {
  open: "待确认",
  acknowledged: "已确认",
  fixing: "修复中",
  ready_for_verify: "待回访",
  verified: "已验证",
  closed: "已关闭",
};

export const NEXT_CAPABILITY_REQUEST_STATUS: Partial<
  Record<CapabilityRequestStatus, CapabilityRequestStatus>
> = {
  open: "triaged",
  triaged: "building",
  building: "ready",
  ready: "verified",
  verified: "closed",
};

export const NEXT_CAPABILITY_ISSUE_STATUS: Partial<
  Record<CapabilityIssueStatus, CapabilityIssueStatus>
> = {
  open: "acknowledged",
  acknowledged: "fixing",
  fixing: "ready_for_verify",
  ready_for_verify: "verified",
  verified: "closed",
};

export const CAPABILITY_REQUEST_ACTION_LABEL: Record<CapabilityRequestStatus, string> = {
  open: "转 CTO 评估",
  triaged: "标记建设中",
  building: "转待验证",
  ready: "标记已验证",
  verified: "归档关闭",
  closed: "已关闭",
};

export const CAPABILITY_ISSUE_ACTION_LABEL: Record<CapabilityIssueStatus, string> = {
  open: "先确认问题",
  acknowledged: "开始修复",
  fixing: "转待验证",
  ready_for_verify: "标记已验证",
  verified: "归档关闭",
  closed: "已关闭",
};

const REQUEST_LANE_META: Record<CapabilityBoardLaneId, { label: string; description: string }> = {
  backlog: {
    label: "待分流",
    description: "业务负责人先收口需求，再决定是否正式流向 CTO。",
  },
  building: {
    label: "建设中",
    description: "已经进入 CTO backlog，当前正在实现或补数据契约。",
  },
  verify: {
    label: "待验证",
    description: "已经交付一版结果，等待业务负责人或首批用户确认是否可用。",
  },
  closed: {
    label: "已关闭",
    description: "已经完成验证并归档，不再占用当前中台注意力。",
  },
};

const ISSUE_LANE_META: Record<CapabilityBoardLaneId, { label: string; description: string }> = {
  backlog: {
    label: "待确认",
    description: "问题已经报上来，先补事实和复现信息，再由 CTO 接手。",
  },
  building: {
    label: "修复中",
    description: "CTO 已经接手并开始修复，不需要使用方继续来回追问。",
  },
  verify: {
    label: "待回访",
    description: "修复已给出，需要使用方确认问题是否真的解决。",
  },
  closed: {
    label: "已关闭",
    description: "问题已经完成回访验证并正式归档。",
  },
};

function buildEmptyLaneMap(
  meta: Record<CapabilityBoardLaneId, { label: string; description: string }>,
): Record<CapabilityBoardLaneId, CapabilityBoardLane> {
  return {
    backlog: { id: "backlog", label: meta.backlog.label, description: meta.backlog.description, count: 0, items: [] },
    building: {
      id: "building",
      label: meta.building.label,
      description: meta.building.description,
      count: 0,
      items: [],
    },
    verify: { id: "verify", label: meta.verify.label, description: meta.verify.description, count: 0, items: [] },
    closed: { id: "closed", label: meta.closed.label, description: meta.closed.description, count: 0, items: [] },
  };
}

export function resolveCapabilityRequestLane(status: CapabilityRequestStatus): CapabilityBoardLaneId {
  switch (status) {
    case "open":
    case "triaged":
      return "backlog";
    case "building":
      return "building";
    case "ready":
    case "verified":
      return "verify";
    case "closed":
      return "closed";
  }
}

export function resolveCapabilityIssueLane(status: CapabilityIssueStatus): CapabilityBoardLaneId {
  switch (status) {
    case "open":
    case "acknowledged":
      return "backlog";
    case "fixing":
      return "building";
    case "ready_for_verify":
    case "verified":
      return "verify";
    case "closed":
      return "closed";
  }
}

function resolveCapabilityRequestNextActorLabel(status: CapabilityRequestStatus) {
  switch (status) {
    case "open":
      return "业务负责人分流";
    case "triaged":
      return "CTO 评估";
    case "building":
      return "CTO 建设";
    case "ready":
    case "verified":
      return "业务负责人验收";
    case "closed":
      return "已归档";
  }
}

function resolveCapabilityIssueNextActorLabel(status: CapabilityIssueStatus) {
  switch (status) {
    case "open":
      return "业务负责人补事实";
    case "acknowledged":
    case "fixing":
      return "CTO 修复";
    case "ready_for_verify":
    case "verified":
      return "业务负责人回访";
    case "closed":
      return "已归档";
  }
}

function sortBoardItems<T extends { updatedAt: number }>(items: T[]) {
  return [...items].sort((left, right) => right.updatedAt - left.updatedAt);
}

function buildRelatedLabels(appId?: string | null, skillId?: string | null, lookup?: {
  appLabelById?: Map<string, string>;
  skillLabelById?: Map<string, string>;
}) {
  const labels: string[] = [];
  if (appId) {
    labels.push(`App · ${lookup?.appLabelById?.get(appId) ?? appId}`);
  }
  if (skillId) {
    labels.push(`能力 · ${lookup?.skillLabelById?.get(skillId) ?? skillId}`);
  }
  return labels;
}

export function buildCapabilityRequestBoard(
  requests: CapabilityRequestRecord[],
  lookup?: {
    appLabelById?: Map<string, string>;
    skillLabelById?: Map<string, string>;
  },
) {
  const laneMap = buildEmptyLaneMap(REQUEST_LANE_META);

  for (const request of sortBoardItems(requests)) {
    const laneId = resolveCapabilityRequestLane(request.status);
    laneMap[laneId].items.push({
      id: request.id,
      summary: request.summary,
      detail: request.detail,
      statusLabel: CAPABILITY_REQUEST_STATUS_LABEL[request.status],
      nextActorLabel: resolveCapabilityRequestNextActorLabel(request.status),
      nextActionLabel: NEXT_CAPABILITY_REQUEST_STATUS[request.status]
        ? CAPABILITY_REQUEST_ACTION_LABEL[request.status]
        : undefined,
      relatedLabels: buildRelatedLabels(request.appId, request.skillId, lookup),
      requesterOrReporterLabel: request.requesterLabel ?? null,
      updatedAt: request.updatedAt,
    });
  }

  for (const lane of Object.values(laneMap)) {
    lane.count = lane.items.length;
  }

  return {
    total: requests.length,
    lanes: [laneMap.backlog, laneMap.building, laneMap.verify, laneMap.closed],
  };
}

export function buildCapabilityIssueBoard(
  issues: CapabilityIssueRecord[],
  lookup?: {
    appLabelById?: Map<string, string>;
    skillLabelById?: Map<string, string>;
  },
) {
  const laneMap = buildEmptyLaneMap(ISSUE_LANE_META);

  for (const issue of sortBoardItems(issues)) {
    const laneId = resolveCapabilityIssueLane(issue.status);
    laneMap[laneId].items.push({
      id: issue.id,
      summary: issue.summary,
      detail: issue.detail,
      statusLabel: CAPABILITY_ISSUE_STATUS_LABEL[issue.status],
      nextActorLabel: resolveCapabilityIssueNextActorLabel(issue.status),
      nextActionLabel: NEXT_CAPABILITY_ISSUE_STATUS[issue.status]
        ? CAPABILITY_ISSUE_ACTION_LABEL[issue.status]
        : undefined,
      relatedLabels: buildRelatedLabels(issue.appId, issue.skillId, lookup),
      requesterOrReporterLabel: issue.reporterLabel ?? null,
      updatedAt: issue.updatedAt,
    });
  }

  for (const lane of Object.values(laneMap)) {
    lane.count = lane.items.length;
  }

  return {
    total: issues.length,
    lanes: [laneMap.backlog, laneMap.building, laneMap.verify, laneMap.closed],
  };
}

export function buildCapabilityVerificationQueue(
  requests: CapabilityRequestRecord[],
  issues: CapabilityIssueRecord[],
  lookup?: {
    appLabelById?: Map<string, string>;
    skillLabelById?: Map<string, string>;
  },
) {
  const items: CapabilityVerificationItem[] = [];

  for (const request of requests) {
    if (resolveCapabilityRequestLane(request.status) !== "verify") {
      continue;
    }
    items.push({
      id: request.id,
      kind: "request",
      status: request.status,
      summary: request.summary,
      detail: request.detail,
      statusLabel: CAPABILITY_REQUEST_STATUS_LABEL[request.status],
      nextActionLabel: CAPABILITY_REQUEST_ACTION_LABEL[request.status],
      appId: request.appId,
      appLabel: request.appId ? lookup?.appLabelById?.get(request.appId) ?? request.appId : null,
      skillId: request.skillId,
      skillLabel: request.skillId ? lookup?.skillLabelById?.get(request.skillId) ?? request.skillId : null,
      contextFileName: request.contextFileName ?? null,
      contextRunId: request.contextRunId ?? null,
      requesterOrReporterLabel: request.requesterLabel ?? null,
      updatedAt: request.updatedAt,
    });
  }

  for (const issue of issues) {
    if (resolveCapabilityIssueLane(issue.status) !== "verify") {
      continue;
    }
    items.push({
      id: issue.id,
      kind: "issue",
      status: issue.status,
      summary: issue.summary,
      detail: issue.detail,
      statusLabel: CAPABILITY_ISSUE_STATUS_LABEL[issue.status],
      nextActionLabel: CAPABILITY_ISSUE_ACTION_LABEL[issue.status],
      appId: issue.appId,
      appLabel: issue.appId ? lookup?.appLabelById?.get(issue.appId) ?? issue.appId : null,
      skillId: issue.skillId,
      skillLabel: issue.skillId ? lookup?.skillLabelById?.get(issue.skillId) ?? issue.skillId : null,
      contextFileName: issue.contextFileName ?? null,
      contextRunId: issue.contextRunId ?? null,
      requesterOrReporterLabel: issue.reporterLabel ?? null,
      updatedAt: issue.updatedAt,
    });
  }

  return sortBoardItems(items);
}
