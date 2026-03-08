import type { Company, RequirementRoomMessage } from "../company/types";
import type {
  RequirementExecutionOverview,
  RequirementMessageSnapshot,
  RequirementSessionSnapshot,
} from "./requirement-overview";
import { formatAgentLabel, formatAgentRole } from "./focus-summary";
import { isSyntheticWorkflowPromptText } from "./message-truth";
import { requestTopicMatchesText } from "../requests/topic";

type RequirementPlanStepLike = {
  id: string;
  title: string;
  assigneeAgentId: string | null;
  assigneeLabel: string;
  status: "done" | "wip" | "pending";
  statusLabel: string;
  detail: string | null;
};

type RequirementPlanLike = {
  totalCount: number;
  doneCount: number;
  currentStep: RequirementPlanStepLike | null;
  nextStep: RequirementPlanStepLike | null;
  steps: RequirementPlanStepLike[];
};

export type RequirementTeamMember = {
  agentId: string;
  label: string;
  role: string;
  stage: string;
  statusLabel: string;
  detail: string;
  updatedAt: number;
  isOwner: boolean;
  isCurrent: boolean;
  isNext: boolean;
};

export type RequirementTeamTimelineEvent = {
  id: string;
  agentId: string;
  agentLabel: string;
  role: string;
  kind: "dispatch" | "reply" | "status";
  headline: string;
  summary: string;
  detail?: string;
  timestamp: number;
  sessionKey: string;
};

export type RequirementTeamArtifact = {
  id: string;
  label: string;
  ownerAgentId: string;
  ownerLabel: string;
  exists: boolean;
  path: string;
};

export type RequirementTeamView = {
  title: string;
  topicKey: string;
  ownerAgentId: string | null;
  ownerLabel: string;
  batonLabel: string;
  nextBatonLabel: string;
  progressLabel: string;
  summary: string;
  members: RequirementTeamMember[];
  timeline: RequirementTeamTimelineEvent[];
  artifacts: RequirementTeamArtifact[];
  planSteps: RequirementPlanStepLike[];
  memberIds: string[];
};

function stripChatControlMetadata(text: string): string {
  return text
    .replace(/^Sender \(untrusted metadata\):[\s\S]*?```[\s\S]*?```\s*/i, "")
    .trim();
}

function stripTaskTrackerSection(text: string): string {
  return text.replace(/##\s*📋\s*任务追踪[\s\S]*?(?=\n\s*(?:【|##)\s*|$)/i, "").trim();
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function truncateText(text: string, maxLength: number): string {
  const compact = collapseWhitespace(text);
  if (compact.length <= maxLength) {
    return compact;
  }
  return `${compact.slice(0, maxLength - 1).trimEnd()}…`;
}

function extractBracketSection(text: string, label: string): string | null {
  const match = text.match(new RegExp(`【${label}】([\\s\\S]*?)(?=\\n\\s*【|$)`));
  const value = match?.[1]?.trim();
  return value ? value : null;
}

function summarizeRequirementMessage(text: string): { headline: string; summary: string; detail?: string } | null {
  const cleaned = stripTaskTrackerSection(stripChatControlMetadata(text));
  if (
    !cleaned ||
    cleaned === "ANNOUNCE_SKIP" ||
    cleaned === "NO_REPLY" ||
    isSyntheticWorkflowPromptText(cleaned) ||
    /Agent-to-agent announce step/i.test(cleaned)
  ) {
    return null;
  }

  const currentStatus = extractBracketSection(cleaned, "当前状态");
  const nextStep = extractBracketSection(cleaned, "下一步进展");
  if (currentStatus) {
    return {
      headline: "状态更新",
      summary: truncateText(currentStatus, 120),
      detail: nextStep ? truncateText(nextStep, 160) : undefined,
    };
  }

  const first = cleaned.match(/^1\.\s*(.+)$/m)?.[1]?.trim();
  const second = cleaned.match(/^2\.\s*(.+)$/m)?.[1]?.trim();
  const third = cleaned.match(/^3\.\s*(.+)$/m)?.[1]?.trim();
  const fourth = cleaned.match(/^4\.\s*(.+)$/m)?.[1]?.trim();

  if (first === "是" && second === "是") {
    return {
      headline: "明确回执",
      summary: "当前步骤已经确认通过，可以继续下一棒。",
      detail: third ? truncateText(third, 160) : undefined,
    };
  }

  if (first === "否" || /未成功|失败|未进入审核|阻塞|错误/i.test(cleaned)) {
    return {
      headline: "异常回执",
      summary: truncateText(third ? `当前失败：${third}` : cleaned, 120),
      detail: fourth ? truncateText(fourth, 160) : undefined,
    };
  }

  const lines = cleaned
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("```"));
  if (lines.length === 0) {
    return null;
  }

  return {
    headline: "结论发言",
    summary: truncateText(lines[0], 120),
    detail: lines[1] ? truncateText(lines[1], 160) : undefined,
  };
}

function isRelevantToRequirement(
  topicKey: string,
  startedAt: number,
  message: RequirementMessageSnapshot,
): boolean {
  if (message.timestamp > 0 && message.timestamp < startedAt - 60_000) {
    return false;
  }

  if (requestTopicMatchesText(topicKey, message.text)) {
    return true;
  }

  return message.timestamp >= startedAt;
}

function createMemberMap(
  company: Company,
  overview: RequirementExecutionOverview,
  plan: RequirementPlanLike | null,
): RequirementTeamMember[] {
  const members = new Map<string, RequirementTeamMember>();

  for (const participant of overview.participants) {
    const participantSummary = summarizeRequirementMessage(participant.detail);
    members.set(participant.agentId, {
      agentId: participant.agentId,
      label: participant.nickname,
      role: participant.role,
      stage: participant.stage,
      statusLabel: participant.statusLabel,
      detail: participantSummary?.summary ?? truncateText(participant.detail, 140),
      updatedAt: participant.updatedAt,
      isOwner: participant.agentId === overview.currentOwnerAgentId,
      isCurrent: participant.isCurrent,
      isNext: false,
    });
  }

  for (const step of plan?.steps ?? []) {
    if (!step.assigneeAgentId) {
      continue;
    }

    const existing = members.get(step.assigneeAgentId);
    const employee = company.employees.find((item) => item.agentId === step.assigneeAgentId);
    if (existing) {
      members.set(step.assigneeAgentId, {
        ...existing,
        isNext: plan?.nextStep?.assigneeAgentId === step.assigneeAgentId,
      });
      continue;
    }

    members.set(step.assigneeAgentId, {
      agentId: step.assigneeAgentId,
      label: step.assigneeLabel,
      role: employee ? formatAgentRole(company, employee.agentId) ?? employee.role : "团队成员",
      stage: step.title,
      statusLabel: step.statusLabel,
      detail: step.detail ? truncateText(step.detail, 140) : `${step.assigneeLabel} 正在处理「${step.title}」。`,
      updatedAt: Date.now(),
      isOwner: step.assigneeAgentId === overview.currentOwnerAgentId,
      isCurrent: step.assigneeAgentId === plan?.currentStep?.assigneeAgentId,
      isNext: step.assigneeAgentId === plan?.nextStep?.assigneeAgentId,
    });
  }

  return [...members.values()].sort((left, right) => {
    if (left.isCurrent !== right.isCurrent) {
      return Number(right.isCurrent) - Number(left.isCurrent);
    }
    if (left.isOwner !== right.isOwner) {
      return Number(right.isOwner) - Number(left.isOwner);
    }
    return right.updatedAt - left.updatedAt;
  });
}

function buildTimeline(
  company: Company,
  overview: RequirementExecutionOverview,
  snapshots: RequirementSessionSnapshot[],
  members: RequirementTeamMember[],
  roomTranscript?: RequirementRoomMessage[],
): RequirementTeamTimelineEvent[] {
  if (roomTranscript && roomTranscript.length > 0) {
    const roomEvents: RequirementTeamTimelineEvent[] = [];

    for (const message of roomTranscript) {
        const agentId = message.senderAgentId ?? null;
        if (!agentId) {
          if (message.role === "user") {
            roomEvents.push({
                id: message.id,
                agentId: "room-owner",
                agentLabel: "负责人",
                role: "需求团队",
                kind: "dispatch" as const,
                headline: "房间指令",
                summary: truncateText(message.text ?? "", 120),
                timestamp: message.timestamp,
                sessionKey: message.sourceSessionKey ?? overview.topicKey,
            });
          }
          continue;
        }

        const summary = summarizeRequirementMessage(message.text ?? "");
        if (!summary) {
          continue;
        }
        roomEvents.push({
          id: message.id,
          agentId,
          agentLabel: formatAgentLabel(company, agentId),
          role: formatAgentRole(company, agentId) ?? "团队成员",
          kind: message.role === "user" ? ("dispatch" as const) : ("reply" as const),
          headline: message.role === "user" ? "收到指令" : summary.headline,
          summary: summary.summary,
          detail: summary.detail,
          timestamp: message.timestamp,
          sessionKey: message.sourceSessionKey ?? `agent:${agentId}:main`,
        });
    }

    if (roomEvents.length > 0) {
      return roomEvents.slice(-12);
    }
  }

  const memberIds = new Set(members.map((member) => member.agentId));
  const events: RequirementTeamTimelineEvent[] = [];

  for (const snapshot of snapshots) {
    if (!memberIds.has(snapshot.agentId)) {
      continue;
    }

    const messages = snapshot.messages.filter(
      (message) =>
        (message.role === "user" || message.role === "assistant") &&
        isRelevantToRequirement(overview.topicKey, overview.startedAt, message),
    );
    if (messages.length === 0) {
      continue;
    }

    const latestDispatch = [...messages]
      .reverse()
      .find((message) => message.role === "user" && summarizeRequirementMessage(message.text));
    const latestReply = [...messages]
      .reverse()
      .find((message) => message.role === "assistant" && summarizeRequirementMessage(message.text));

    if (latestDispatch) {
      const summary = summarizeRequirementMessage(latestDispatch.text);
      if (summary) {
        events.push({
          id: `${snapshot.sessionKey}:dispatch:${latestDispatch.timestamp}`,
          agentId: snapshot.agentId,
          agentLabel: formatAgentLabel(company, snapshot.agentId),
          role: formatAgentRole(company, snapshot.agentId) ?? "团队成员",
          kind: "dispatch",
          headline: "收到指令",
          summary: summary.summary,
          detail: summary.detail,
          timestamp: latestDispatch.timestamp || snapshot.updatedAt,
          sessionKey: snapshot.sessionKey,
        });
      }
    }

    if (latestReply) {
      const summary = summarizeRequirementMessage(latestReply.text);
      if (summary) {
        events.push({
          id: `${snapshot.sessionKey}:reply:${latestReply.timestamp}`,
          agentId: snapshot.agentId,
          agentLabel: formatAgentLabel(company, snapshot.agentId),
          role: formatAgentRole(company, snapshot.agentId) ?? "团队成员",
          kind: "reply",
          headline: summary.headline,
          summary: summary.summary,
          detail: summary.detail,
          timestamp: latestReply.timestamp || snapshot.updatedAt,
          sessionKey: snapshot.sessionKey,
        });
      }
    }
  }

  if (events.length === 0) {
    return members.slice(0, 4).map((member) => ({
      id: `status:${member.agentId}`,
      agentId: member.agentId,
      agentLabel: member.label,
      role: member.role,
      kind: "status",
      headline: member.isCurrent ? "当前关键节点" : "团队状态",
      summary: member.detail,
      timestamp: member.updatedAt,
      sessionKey: `agent:${member.agentId}:main`,
    }));
  }

  return events
    .sort((left, right) => left.timestamp - right.timestamp)
    .slice(-8);
}

function buildArtifacts(
  company: Company,
  overview: RequirementExecutionOverview,
  snapshots: RequirementSessionSnapshot[],
  members: RequirementTeamMember[],
): RequirementTeamArtifact[] {
  const memberIds = new Set(members.map((member) => member.agentId));
  const artifacts = new Map<string, RequirementTeamArtifact>();

  for (const snapshot of snapshots) {
    if (!memberIds.has(snapshot.agentId)) {
      continue;
    }

    for (const check of snapshot.artifactChecks ?? []) {
      if (!requestTopicMatchesText(overview.topicKey, check.path)) {
        continue;
      }
      const key = `${snapshot.agentId}:${check.path}`;
      artifacts.set(key, {
        id: key,
        label: check.path.split("/").pop() ?? check.path,
        ownerAgentId: snapshot.agentId,
        ownerLabel: formatAgentLabel(company, snapshot.agentId),
        exists: check.exists,
        path: check.path,
      });
    }
  }

  return [...artifacts.values()].sort((left, right) => Number(right.exists) - Number(left.exists));
}

export function buildRequirementTeamView(params: {
  company: Company | null | undefined;
  overview: RequirementExecutionOverview | null | undefined;
  plan: RequirementPlanLike | null | undefined;
  sessionSnapshots?: RequirementSessionSnapshot[];
  roomTranscript?: RequirementRoomMessage[];
  includeTimeline?: boolean;
  includeArtifacts?: boolean;
}): RequirementTeamView | null {
  const {
    company,
    overview,
    plan,
    roomTranscript,
    sessionSnapshots = [],
    includeTimeline = true,
    includeArtifacts = true,
  } = params;
  if (!company || !overview) {
    return null;
  }

  const members = createMemberMap(company, overview, plan ?? null);
  const timeline = includeTimeline ? buildTimeline(company, overview, sessionSnapshots, members, roomTranscript) : [];
  const artifacts = includeArtifacts ? buildArtifacts(company, overview, sessionSnapshots, members) : [];
  const batonLabel = overview.currentOwnerLabel || "待确认";
  const nextBatonLabel = plan?.nextStep?.assigneeLabel ?? overview.currentOwnerLabel;
  const progressLabel = plan ? `${plan.doneCount}/${plan.totalCount}` : `${members.length} 人参与`;

  return {
    title: overview.title,
    topicKey: overview.topicKey,
    ownerAgentId: overview.currentOwnerAgentId,
    ownerLabel: overview.currentOwnerLabel,
    batonLabel,
    nextBatonLabel,
    progressLabel,
    summary: overview.summary,
    members,
    timeline,
    artifacts,
    planSteps: plan?.steps ?? [],
    memberIds: members.map((member) => member.agentId),
  };
}
