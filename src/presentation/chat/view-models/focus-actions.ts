import { formatAgentLabel, type ExecutionFocusSummary } from "../../../application/governance/focus-summary";
import { type FocusProgressEvent } from "../../../application/governance/chat-progress";
import { DISPATCH_BUSINESS_ACK_REMINDER_MS } from "../../../application/delegation/dispatch-policy";
import { buildCompanyChatRoute } from "../../../lib/chat-routes";
import type { Company } from "../../../domain/org/types";
import type { RequestRecord } from "../../../domain/delegation/types";
import type { FocusActionButton } from "./focus";
import { dedupeFocusActions } from "./focus";

type BuildChatFocusActionsInput = {
  activeCompany: Company | null;
  latestBlockingProgressEvent: FocusProgressEvent | null;
  hasTakeoverPack: boolean;
  nextOpenTaskStepLabel: string | null;
  nextOpenTaskStepAgentId: string | null;
  targetAgentId: string | null;
  focusSummary: ExecutionFocusSummary;
  requestPreview: RequestRecord[];
  handoffCount: number;
  sessionKey: string | null;
  structuredTaskOwnerAgentId?: string | null;
  summaryAlertCount: number;
};

export function buildChatFocusActions({
  activeCompany,
  latestBlockingProgressEvent,
  hasTakeoverPack,
  nextOpenTaskStepLabel,
  nextOpenTaskStepAgentId,
  targetAgentId,
  focusSummary,
  requestPreview,
  handoffCount,
  sessionKey,
  structuredTaskOwnerAgentId,
  summaryAlertCount,
}: BuildChatFocusActionsInput): FocusActionButton[] {
  const actions: FocusActionButton[] = [];
  const now = Date.now();
  const primaryRequest = requestPreview
    .slice()
    .sort((left, right) => {
      const priority = {
        blocked: 0,
        pending: 1,
        acknowledged: 2,
        answered: 3,
        superseded: 4,
      } as const;
      const byPriority = priority[left.status] - priority[right.status];
      if (byPriority !== 0) {
        return byPriority;
      }
      return right.updatedAt - left.updatedAt;
    })[0];

  if (activeCompany && latestBlockingProgressEvent?.actorAgentId) {
    const blockerLabel = formatAgentLabel(activeCompany, latestBlockingProgressEvent.actorAgentId);
    actions.push({
      id: `unstick:${latestBlockingProgressEvent.actorAgentId}:${latestBlockingProgressEvent.timestamp}`,
      label: `追 ${blockerLabel} 继续排查`,
      description: `${blockerLabel} 刚回传了失败/阻塞结果，直接让他继续排查并给出下一步。`,
      kind: "message",
      tone: "primary",
      targetAgentId: latestBlockingProgressEvent.actorAgentId,
      message: `你刚才回传的执行结果仍未完成。请不要只汇报状态，直接继续排查并只回复：1. 当前阻塞点 2. 你准备怎么处理 3. 如果需要我介入，请明确指出我要做什么。最近回传：${latestBlockingProgressEvent.summary}${latestBlockingProgressEvent.detail ? `；补充：${latestBlockingProgressEvent.detail}` : ""}`,
    });
    actions.push({
      id: `open-blocker:${latestBlockingProgressEvent.actorAgentId}`,
      label: `打开 ${blockerLabel} 会话`,
      description: `直接进入 ${blockerLabel} 会话，查看失败细节并继续处理。`,
      kind: "navigate",
      tone: "secondary",
      href: buildCompanyChatRoute(latestBlockingProgressEvent.actorAgentId, activeCompany.id),
    });
  }

  if (hasTakeoverPack) {
    actions.push({
      id: "copy-takeover-pack",
      label: "复制接管包",
      description: "这条链路已经无法自动闭环，先把完整接管信息复制出来继续处理。",
      kind: "copy",
      tone: "primary",
    });
  }

  if (activeCompany && nextOpenTaskStepLabel && nextOpenTaskStepAgentId) {
    const assigneeLabel = formatAgentLabel(activeCompany, nextOpenTaskStepAgentId);
    const sameAsCurrentSession = nextOpenTaskStepAgentId === targetAgentId;
    const actionContext = [
      `当前步骤：${nextOpenTaskStepLabel}`,
      focusSummary.currentWork,
      focusSummary.blockReason ? `当前卡点：${focusSummary.blockReason}` : null,
      `下一步：${focusSummary.nextStep}`,
    ]
      .filter((value): value is string => Boolean(value))
      .join("；");
    actions.push({
      id: `nudge-step:${nextOpenTaskStepAgentId}:${nextOpenTaskStepLabel}`,
      label: sameAsCurrentSession
        ? `让 ${assigneeLabel} 继续 ${nextOpenTaskStepLabel}`
        : `催 ${assigneeLabel} 处理${nextOpenTaskStepLabel}`,
      description: sameAsCurrentSession
        ? `会直接让 ${assigneeLabel} 根据当前状态继续执行，而不是停在汇报。`
        : `会直接向 ${assigneeLabel} 发送当前步骤的催办指令。`,
      kind: "message",
      tone: "primary",
      targetAgentId: nextOpenTaskStepAgentId,
      message: `请立即处理「${nextOpenTaskStepLabel}」。${actionContext}。收到后请先立即明确回复“已收到并开始处理”；如果已经完成，直接给出结果摘要；如果仍阻塞，请直接说明原因。`,
    });
    if (!sameAsCurrentSession) {
      actions.push({
        id: `open-step:${nextOpenTaskStepAgentId}`,
        label: `打开 ${assigneeLabel} 会话`,
        description: `直接进入 ${assigneeLabel} 的会话，查看细节或手动补充指令。`,
        kind: "navigate",
        tone: "secondary",
        href: buildCompanyChatRoute(nextOpenTaskStepAgentId, activeCompany.id),
      });
    }
  } else if (activeCompany && primaryRequest) {
    const requestResponderId =
      primaryRequest.status === "answered"
        ? primaryRequest.fromAgentId ?? structuredTaskOwnerAgentId ?? null
        : primaryRequest.toAgentIds[0] ?? null;

    if (requestResponderId) {
      const targetLabel = formatAgentLabel(activeCompany, requestResponderId);
      const pendingRequestNeedsReminder =
        primaryRequest.status === "pending" &&
        now - primaryRequest.updatedAt >= DISPATCH_BUSINESS_ACK_REMINDER_MS;
      const requestTitle =
        /^(紧急|当前任务|任务|问题|同步|继续)$/u.test(primaryRequest.title.trim())
          ? primaryRequest.responseSummary || primaryRequest.summary || primaryRequest.title
          : primaryRequest.title;
      const requestContext = [
        `当前请求：${requestTitle}`,
        focusSummary.currentWork,
        primaryRequest.responseSummary ? `最近结果：${primaryRequest.responseSummary}` : null,
        focusSummary.blockReason ? `当前卡点：${focusSummary.blockReason}` : null,
      ]
        .filter((value): value is string => Boolean(value))
        .join("；");
      actions.push({
        id: `nudge-request:${requestResponderId}:${primaryRequest.id}`,
        label:
          primaryRequest.status === "answered"
            ? `催 ${targetLabel} 接住结果`
            : `催 ${targetLabel} 回复`,
        description:
          primaryRequest.status === "answered"
            ? `对方已经给出结果，现在要提醒 ${targetLabel} 接住结果并继续推进。`
            : pendingRequestNeedsReminder
              ? `${targetLabel} 超过 5 分钟没有业务回执，需要先明确接单或直接回结果。`
              : `当前链路在等 ${targetLabel} 的明确回复。`,
        kind: "message",
        tone: "primary",
        targetAgentId: requestResponderId,
        message:
          primaryRequest.status === "answered"
            ? `最新结果已经回传，请你现在直接继续推进。${requestContext}。请不要只汇报状态，直接说明你现在要做什么并继续执行。`
            : `请优先回复「${requestTitle}」。${requestContext}。收到后请先立即明确回复“已收到并开始处理”；如果已经完成，直接给出结果摘要；如果仍阻塞，请明确说明原因。`,
      });
      if (pendingRequestNeedsReminder) {
        actions.push({
          id: `retry-request:${requestResponderId}:${primaryRequest.id}`,
          label: `重新派单给 ${targetLabel}`,
          description: `当前超过 5 分钟没有回执，会重新生成一条派单。这可能造成重复执行。`,
          kind: "message",
          tone: "secondary",
          targetAgentId: requestResponderId,
          confirmMessage: `这会重新派单给 ${targetLabel}。如果对方其实已经在执行，可能造成重复执行。确定继续吗？`,
          message: `这是对「${requestTitle}」的重新派发。${requestContext}。如果你已经在处理，请先立即明确回复“已收到并继续处理”，再补充当前进度；如果已经完成，直接给结果；如果阻塞，请说明原因。`,
        });
      }
      actions.push({
        id: `open-request:${requestResponderId}`,
        label: `打开 ${targetLabel} 会话`,
        description: `直接进入 ${targetLabel} 的会话，人工确认这条链路到底卡在哪。`,
        kind: "navigate",
        tone: "secondary",
        href: buildCompanyChatRoute(requestResponderId, activeCompany.id),
      });
    }
  }

  if (!hasTakeoverPack && sessionKey) {
    actions.push({
      id: `continue-current:${targetAgentId ?? sessionKey}`,
      label: `让 ${focusSummary.ownerLabel} 继续推进`,
      description: "如果你不想切会话，可以直接让当前负责人根据现状继续执行，而不是继续汇报。",
      kind: "message",
      tone: "ghost",
      targetAgentId: targetAgentId ?? undefined,
      message: `请不要停留在状态汇报，直接继续推进当前链路。当前情况：${focusSummary.currentWork}。当前卡点：${focusSummary.blockReason ?? "暂无明确阻塞"}。下一步：${focusSummary.nextStep}。请执行后给出结果。`,
    });
  }

  if (activeCompany && (summaryAlertCount > 0 || handoffCount > 0 || requestPreview.length > 0)) {
    actions.push({
      id: "recover-communication",
      label: "同步当前阻塞",
      description: "重新扫描公司会话，把已经回复但还没回写到主链的结果同步回来。",
      kind: "recover",
      tone: "secondary",
    });
  }

  return dedupeFocusActions(actions).slice(0, 4);
}
