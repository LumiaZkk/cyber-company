import { memo, useMemo } from "react";
import { Users } from "lucide-react";
import { appendOperatorActionAuditEvent } from "../../../application/governance/operator-action-audit";
import { buildRequirementRoomRouteFromCompanyContext } from "../../../application/delegation/room-routing";
import { inferMissionTopicKey, inferRequestTopicKey } from "../../../application/delegation/request-topic";
import { readConversationWorkspaceState } from "../../../application/mission";
import { Avatar, AvatarImage } from "../../../components/ui/avatar";
import type { EmployeeRef } from "../../../domain/org/types";
import { buildCompanyChatRoute } from "../../../lib/chat-routes";
import { resolveTaskTitle } from "../view-models/task-tracker";
import { resolveAssignmentActionEmployees } from "./chat-assignment-actions";

type ChatAssignmentActionsProps = {
  messageText: string;
  targetAgentIds: string[];
  allowMentionFallback: boolean;
  companyId: string | null;
  employees: EmployeeRef[];
  isCeoSession: boolean;
  isGroup: boolean;
  targetAgentId: string | null;
  currentConversationRequirementTopicKey: string | null;
  requirementOverviewTopicKey: string | null;
  conversationMissionRecordId: string | null;
  persistedWorkItemId: string | null;
  groupWorkItemId: string | null;
  onNavigateToRoute: (route: string) => void;
};

export const ChatAssignmentActions = memo(function ChatAssignmentActions(input: ChatAssignmentActionsProps) {
  const actionSurface = useMemo(
    () =>
      resolveAssignmentActionEmployees({
        messageText: input.messageText,
        employees: input.employees,
        targetAgentIds: input.targetAgentIds,
        allowMentionFallback: input.allowMentionFallback,
      }),
    [input.allowMentionFallback, input.employees, input.messageText, input.targetAgentIds],
  );
  if (!input.companyId || actionSurface.employees.length === 0 || !actionSurface.kind) {
    return null;
  }
  const companyId = input.companyId;
  const isDispatchSurface = actionSurface.kind === "dispatch";
  const surfaceTitle = isDispatchSurface ? "🚀 检测到任务分派" : "👥 提到的成员";
  const buttonTail = isDispatchSurface ? "→ 直达" : "→ 查看工作";

  return (
    <div className="mt-4 space-y-2 border-t border-slate-200/60 pt-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
        <span>{surfaceTitle}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {actionSurface.employees.map((member) => (
          <button
            key={member.agentId}
            onClick={() =>
              input.onNavigateToRoute(
                buildCompanyChatRoute(member.agentId, companyId),
              )
            }
            className="group/btn flex items-center gap-1.5 rounded-lg border border-indigo-100 bg-white px-2 py-1.5 shadow-sm transition-all hover:border-indigo-300 hover:bg-indigo-50"
          >
            <Avatar className="h-5 w-5 shrink-0 border border-indigo-100">
              <AvatarImage src={`https://api.dicebear.com/7.x/bottts/svg?seed=${member.agentId}`} />
            </Avatar>
            <span className="text-xs font-medium text-indigo-700">{member.nickname}</span>
            <span className="ml-1 text-[10px] text-indigo-400 group-hover/btn:text-indigo-600">
              {buttonTail}
            </span>
          </button>
        ))}
        {isDispatchSurface && actionSurface.employees.length >= 2 && !input.isGroup ? (
          <button
            type="button"
            onClick={() => {
              const topic = resolveTaskTitle(input.messageText, "任务小组");
              const groupRoute = buildRequirementRoomRouteFromCompanyContext({
                companyId,
                employees: input.employees,
                memberIds: actionSurface.employees.map((member) => member.agentId),
                topic,
                topicKey:
                  input.currentConversationRequirementTopicKey ??
                  input.requirementOverviewTopicKey ??
                  inferRequestTopicKey([input.messageText]) ??
                  inferMissionTopicKey([input.messageText]),
                workItemId:
                  input.conversationMissionRecordId ??
                  input.persistedWorkItemId ??
                  input.groupWorkItemId ??
                  null,
                preferredInitiatorAgentId: input.targetAgentId,
                existingRooms: readConversationWorkspaceState().activeRoomRecords,
              });
              if (groupRoute) {
                void appendOperatorActionAuditEvent({
                  companyId,
                  action: "group_chat_route_open",
                  surface: "chat",
                  outcome: "succeeded",
                  details: {
                    memberCount: actionSurface.employees.length,
                    topicPreview: topic.slice(0, 48),
                    route: groupRoute,
                  },
                });
                input.onNavigateToRoute(groupRoute);
                return;
              }
              void appendOperatorActionAuditEvent({
                companyId,
                action: "group_chat_route_open",
                surface: "chat",
                outcome: "failed",
                error: "没有生成有效的需求团队房间。",
                details: {
                  memberCount: actionSurface.employees.length,
                  topicPreview: topic.slice(0, 48),
                },
              });
            }}
            className="group/btn flex items-center gap-1.5 rounded-lg border border-emerald-100 bg-white px-2 py-1.5 shadow-sm transition-all hover:border-emerald-300 hover:bg-emerald-50"
          >
            <Users className="h-4 w-4 text-emerald-600" />
            <span className="text-xs font-medium text-emerald-700">打开需求团队房间</span>
          </button>
        ) : null}
      </div>
    </div>
  );
});
