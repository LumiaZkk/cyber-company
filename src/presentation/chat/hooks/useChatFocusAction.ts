import { useCallback, type Dispatch, type SetStateAction } from "react";
import { executeChatFocusAction, type ChatFocusCommand } from "../../../application/delegation/focus-action";
import { backend, resolveCompanyActorConversation, type ProviderManifest } from "../../../application/gateway";
import { formatAgentLabel } from "../../../application/governance/focus-summary";
import { appendOperatorActionAuditEvent } from "../../../application/governance/operator-action-audit";
import type { FocusProgressEvent } from "../../../application/governance/chat-progress";
import type { DispatchRecord } from "../../../domain/delegation/types";
import type { Company } from "../../../domain/org/types";
import { toast } from "../../../components/system/toast-store";
import type { FocusActionButton, FocusActionWatch } from "../view-models/focus";

export function useChatFocusAction(input: {
  activeCompany: Company | null;
  providerManifest: ProviderManifest;
  sessionKey: string | null;
  targetAgentId: string | null;
  currentConversationWorkItemId: string | null;
  currentConversationTopicKey?: string | null;
  focusSummaryOwnerLabel: string;
  isGroup: boolean;
  routeCompanyConflictMessage: string | null;
  appendLocalProgressEvent: (event: FocusProgressEvent) => void;
  upsertDispatchRecord: (dispatch: DispatchRecord) => void;
  setActionWatches: Dispatch<SetStateAction<FocusActionWatch[]>>;
  setRunningFocusActionId: (value: string | null) => void;
  setIsSummaryOpen: (value: boolean) => void;
  handleCopyTakeoverPack: () => Promise<void>;
  handleRecoverCommunication: () => Promise<void>;
  navigateToHref: (href: string) => void;
}) {
  return useCallback(
    async (action: FocusActionButton) => {
      if (action.kind === "navigate" && action.href) {
        input.navigateToHref(action.href);
        return;
      }

      if (action.kind === "copy") {
        await input.handleCopyTakeoverPack();
        return;
      }

      if (action.kind === "recover") {
        await input.handleRecoverCommunication();
        return;
      }

      if (!action.message) {
        return;
      }
      if (action.confirmMessage && !window.confirm(action.confirmMessage)) {
        return;
      }
      if (input.routeCompanyConflictMessage) {
        toast.error("无法发送", input.routeCompanyConflictMessage);
        return;
      }

      input.setRunningFocusActionId(action.id);
      input.setIsSummaryOpen(true);
      try {
        const result = await executeChatFocusAction({
          action: action as ChatFocusCommand,
          company: input.activeCompany,
          providerManifest: input.providerManifest,
          sessionKey: input.sessionKey,
          targetAgentId: input.targetAgentId,
          currentWorkItemId: input.currentConversationWorkItemId,
          currentTopicKey: input.currentConversationTopicKey,
        });
        if (result.dispatchRecord) {
          input.upsertDispatchRecord(result.dispatchRecord);
        }

        const actionStartedAt = Date.now();
        const targetLabel =
          result.runtimeTargetAgentId && input.activeCompany
            ? formatAgentLabel(input.activeCompany, result.runtimeTargetAgentId)
            : input.focusSummaryOwnerLabel;
        const followupTargetLabel =
          action.followupTargetLabel ??
          (action.followupTargetAgentId && input.activeCompany
            ? formatAgentLabel(input.activeCompany, action.followupTargetAgentId)
            : null);
        const trackingId = result.dispatchId ?? result.actionTrackingId;
        if (input.activeCompany) {
          void appendOperatorActionAuditEvent({
            companyId: input.activeCompany.id,
            action: "focus_action_dispatch",
            surface: "chat",
            outcome: "succeeded",
            details: {
              focusActionId: action.id,
              focusActionKind: action.kind,
              label: action.label,
              targetActorId: result.runtimeTargetAgentId ?? action.targetAgentId ?? null,
              followupTargetActorId: action.followupTargetAgentId ?? null,
              dispatchId: result.dispatchId ?? null,
              trackingId,
              sessionKey: result.resolvedSessionKey,
            },
          });
        }
        input.appendLocalProgressEvent({
          id: trackingId,
          timestamp: actionStartedAt,
          actorLabel: "系统",
          actorAgentId: result.runtimeTargetAgentId ?? undefined,
          title: `已发送：${action.label}`,
          summary:
            followupTargetLabel && followupTargetLabel !== targetLabel
              ? `已向 ${targetLabel} 发出操作，系统会继续盯 ${targetLabel} 和 ${followupTargetLabel} 的回传。`
              : `已向 ${targetLabel} 发出操作，当前等待回传。`,
          detail: action.description,
          tone: "indigo",
          category: "receipt",
          source: "local",
        });

        const isSameSessionOwnerAction =
          !input.isGroup &&
          Boolean(result.runtimeTargetAgentId) &&
          result.runtimeTargetAgentId === input.targetAgentId;
        const nextWatches: FocusActionWatch[] = isSameSessionOwnerAction
          ? []
          : [
              {
                id: `${trackingId}:owner`,
                sessionKey: result.resolvedSessionKey,
                actionLabel: action.label,
                targetLabel,
                targetAgentId: result.runtimeTargetAgentId ?? undefined,
                kind: "owner",
                startedAt: actionStartedAt,
                lastSeenTimestamp: actionStartedAt,
                hasReminder: false,
              },
            ];
        if (
          action.followupTargetAgentId &&
          action.followupTargetAgentId !== action.targetAgentId &&
          input.activeCompany
        ) {
          try {
            const followupConversation = await resolveCompanyActorConversation({
              backend,
              manifest: input.providerManifest,
              company: input.activeCompany,
              actorId: action.followupTargetAgentId,
              kind: "direct",
            });
            if (followupConversation.conversationRef.conversationId) {
              nextWatches.push({
                id: `${trackingId}:handoff:${action.followupTargetAgentId}`,
                sessionKey: followupConversation.conversationRef.conversationId,
                actionLabel: action.label,
                targetLabel: followupTargetLabel ?? action.followupTargetAgentId,
                targetAgentId: action.followupTargetAgentId,
                kind: "handoff",
                startedAt: actionStartedAt,
                lastSeenTimestamp: actionStartedAt,
                hasReminder: false,
              });
            }
          } catch (error) {
            console.error("Failed to resolve follow-up watch session", error);
          }
        }
        input.setActionWatches((previous) =>
          [...nextWatches, ...previous.filter((watch) => !nextWatches.some((item) => item.id === watch.id))].slice(0, 6),
        );
        toast.success("操作已发送", action.description);
      } catch (error) {
        if (input.activeCompany) {
          void appendOperatorActionAuditEvent({
            companyId: input.activeCompany.id,
            action: "focus_action_dispatch",
            surface: "chat",
            outcome: "failed",
            error: error instanceof Error ? error.message : String(error),
            details: {
              focusActionId: action.id,
              focusActionKind: action.kind,
              label: action.label,
              targetActorId: action.targetAgentId ?? null,
              followupTargetActorId: action.followupTargetAgentId ?? null,
            },
          });
        }
        input.appendLocalProgressEvent({
          id: `focus-failed:${action.id}:${Date.now()}`,
          timestamp: Date.now(),
          actorLabel: "系统",
          actorAgentId: action.targetAgentId,
          title: `发送失败：${action.label}`,
          summary: error instanceof Error ? error.message : String(error),
          tone: "rose",
          category: "receipt",
          source: "local",
        });
        toast.error("操作失败", error instanceof Error ? error.message : String(error));
      } finally {
        input.setRunningFocusActionId(null);
      }
    },
    [input],
  );
}
