import { buildRequirementTeamAdjustmentAction } from "../assignment/team-adjustment";
import {
  buildRequirementRoomHrefFromRecord,
} from "../delegation/room-routing";
import { formatAgentRole } from "../governance/focus-summary";
import type { FocusProgressTone } from "../governance/chat-progress";
import type { RequirementParticipantProgress } from "../mission/requirement-overview";
import { cn } from "../../lib/utils";
import type { RequirementRoomRecord } from "../../domain/delegation/types";
import type { ConversationMissionRecord, WorkItemRecord } from "../../domain/mission/types";
import type { Company } from "../../domain/org/types";
import type {
  RequirementLifecycleSection,
  RequirementProgressGroups,
} from "./action-surface-types";
import type { FocusActionButton } from "./focus-actions";

type BuildRequirementLifecycleSectionsInput = {
  activeCompany: Company | null;
  currentTime: number;
  effectiveOwnerAgentId: string | null;
  effectiveOwnerLabel: string;
  effectiveStage: string;
  effectiveStatusLabel: string;
  effectiveSummary: string;
  focusSummaryOwnerRole: string | null;
  isSummaryOpen: boolean;
  requirementOverview: {
    participants: RequirementParticipantProgress[];
  } | null;
  requirementProgressGroups: RequirementProgressGroups | null;
  requirementTechParticipant: RequirementParticipantProgress | null;
  shouldDispatchPublish: boolean;
  summaryPanelView: "owner" | "team" | "debug";
  targetAgentId: string | null;
};

type BuildDisplayRequirementProgressGroupsInput = {
  isSummaryOpen: boolean;
  requirementOverview: {
    participants: RequirementParticipantProgress[];
  } | null;
  requirementProgressGroups: RequirementProgressGroups | null;
  requirementTechParticipant: RequirementParticipantProgress | null;
  shouldDispatchPublish: boolean;
  summaryPanelView: "owner" | "team" | "debug";
};

type BuildTeamGroupRouteInput = {
  activeCompany: Company | null;
  activeRoomRecords: RequirementRoomRecord[];
  conversationMissionRecord: ConversationMissionRecord | null;
  groupWorkItemId: string | null;
  linkedRequirementRoom: RequirementRoomRecord | null;
  persistedWorkItem: WorkItemRecord | null;
  requirementTeam: {
    memberIds: string[];
    title: string;
    topicKey: string;
  } | null;
  targetAgentId: string | null;
};

type BuildTeamAdjustmentActionFactoryInput = {
  effectiveHeadline: string;
  effectiveOwnerAgentId: string | null;
  effectiveOwnerLabel: string;
  effectiveSummary: string;
  requirementTeam: {
    title: string;
    topicKey: string;
  } | null;
};

export function buildHeaderStatusBadgeClass(tone: FocusProgressTone): string {
  return cn(
    "rounded-full border px-2 py-0.5 text-[11px] font-medium",
    tone === "rose"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : tone === "emerald"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : tone === "indigo"
            ? "border-indigo-200 bg-indigo-50 text-indigo-700"
            : "border-slate-200 bg-slate-50 text-slate-600",
  );
}

export function buildRequirementLifecycleSections(
  input: BuildRequirementLifecycleSectionsInput,
): RequirementLifecycleSection[] | null {
  const {
    activeCompany,
    currentTime,
    effectiveOwnerAgentId,
    effectiveOwnerLabel,
    effectiveStage,
    effectiveStatusLabel,
    effectiveSummary,
    focusSummaryOwnerRole,
    isSummaryOpen,
    requirementOverview,
    requirementProgressGroups,
    requirementTechParticipant,
    shouldDispatchPublish,
    summaryPanelView,
    targetAgentId,
  } = input;

  if (!(isSummaryOpen && summaryPanelView === "owner")) {
    return null;
  }
  if (!requirementOverview || !requirementProgressGroups) {
    return null;
  }
  if (!shouldDispatchPublish) {
    const current =
      requirementOverview.participants.find((participant) => participant.isCurrent) ?? null;
    const workingOthers = requirementProgressGroups.working.filter(
      (participant) => !participant.isCurrent,
    );
    const waiting = requirementProgressGroups.waiting.filter(
      (participant) => !participant.isCurrent,
    );
    const completed = requirementProgressGroups.completed.filter(
      (participant) => !participant.isCurrent,
    );
    return [
      current
        ? {
            id: "current",
            title: "当前处理",
            summary: "现在就盯这一步，它决定任务有没有继续往下走。",
            items: [current],
          }
        : null,
      workingOthers.length > 0
        ? {
            id: "working",
            title: "正在推进",
            summary: "这些节点已经在做事，但还没形成下一跳结果。",
            items: workingOthers,
          }
        : null,
      waiting.length > 0
        ? {
            id: "waiting",
            title: "等待接棒",
            summary: "这些节点还在等上一棒、等确认，或者还没真正接住任务。",
            items: waiting,
          }
        : null,
      completed.length > 0
        ? {
            id: "completed",
            title: "已完成本轮",
            summary: "这些节点本轮已经完成确认、交付或冻结，不用继续盯。",
            items: completed,
          }
        : null,
    ].filter((section): section is RequirementLifecycleSection => Boolean(section));
  }

  return [
    {
      id: "current",
      title: "当前处理",
      summary: "下游结果已经齐了，现在不是继续盯旧步骤，而是 CEO 要把最新结果正式派到下一棒。",
      items: [
        {
          agentId: targetAgentId ?? "co-ceo",
          nickname: effectiveOwnerLabel,
          role:
            (effectiveOwnerAgentId && activeCompany
              ? formatAgentRole(activeCompany, effectiveOwnerAgentId)
              : null) ?? focusSummaryOwnerRole,
          stage: effectiveStage,
          statusLabel: effectiveStatusLabel,
          detail: effectiveSummary,
          updatedAt: currentTime,
          tone: "amber",
          isBlocking: true,
          isCurrent: true,
        },
      ],
    },
    requirementTechParticipant
      ? {
          id: "waiting",
          title: "等待接棒",
          summary: "这一步已经准备好，只差收到新版发布指令就能继续。",
          items: [
            {
              ...requirementTechParticipant,
              detail: "CTO 已冻结待命。只要收到 CEO 的新版发布指令，就应立即执行发布并回传结果。",
              isCurrent: false,
            },
          ],
        }
      : null,
    (requirementOverview.participants.filter(
      (participant) => participant.agentId !== requirementTechParticipant?.agentId,
    ) ?? []).length > 0
      ? {
          id: "completed",
          title: "已完成本轮",
          summary: "这些节点本轮已经完成，不用再继续追。",
          items:
            requirementOverview.participants
              .filter((participant) => participant.agentId !== requirementTechParticipant?.agentId)
              .map((participant) => ({
                ...participant,
                isCurrent: false,
              })) ?? [],
        }
      : null,
  ].filter((section): section is RequirementLifecycleSection => Boolean(section));
}

export function buildDisplayRequirementProgressGroups(
  input: BuildDisplayRequirementProgressGroupsInput,
): RequirementProgressGroups | null {
  const {
    isSummaryOpen,
    requirementOverview,
    requirementProgressGroups,
    requirementTechParticipant,
    shouldDispatchPublish,
    summaryPanelView,
  } = input;

  if (!(isSummaryOpen && summaryPanelView === "owner")) {
    return null;
  }
  if (!requirementProgressGroups) {
    return null;
  }
  if (!shouldDispatchPublish) {
    return requirementProgressGroups;
  }
  return {
    working: [],
    waiting: requirementTechParticipant
      ? [
          {
            ...requirementTechParticipant,
            detail: "CTO 已冻结待命，只差收到 CEO 的新版发布指令。",
          },
        ]
      : [],
    completed:
      requirementOverview?.participants.filter(
        (participant) => participant.agentId !== requirementTechParticipant?.agentId,
      ) ?? [],
  };
}

export function buildTeamGroupRoute(input: BuildTeamGroupRouteInput): string | null {
  const {
    linkedRequirementRoom,
  } = input;

  if (linkedRequirementRoom) {
    return buildRequirementRoomHrefFromRecord(linkedRequirementRoom);
  }
  return null;
}

export function buildTeamAdjustmentActionFactory(
  input: BuildTeamAdjustmentActionFactoryInput,
): (member: {
  agentId: string;
  detail: string;
  label: string;
  stage: string;
}) => FocusActionButton {
  const {
    effectiveHeadline,
    effectiveOwnerAgentId,
    effectiveOwnerLabel,
    effectiveSummary,
    requirementTeam,
  } = input;

  return (member) =>
    buildRequirementTeamAdjustmentAction({
      member,
      topicKey: requirementTeam?.topicKey,
      requirementTitle: requirementTeam?.title ?? effectiveHeadline,
      ownerAgentId: effectiveOwnerAgentId,
      ownerLabel: effectiveOwnerLabel,
      effectiveHeadline,
      effectiveSummary,
    });
}
