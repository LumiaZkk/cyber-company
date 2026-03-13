import { useCallback, useState } from "react";
import { buildCompanyBlueprint } from "../company/blueprint";
import { appendOperatorActionAuditEvent } from "../governance/operator-action-audit";
import { useLobbyCommunicationSyncState } from "./communication-sync";
import { buildRequirementRoomRoute } from "../delegation/room-routing";
import { requestTopicMatchesText } from "../delegation/request-topic";
import type { CronJob } from "../gateway";
import {
  assignEmployeeTask,
  fireCompanyEmployee,
  hireCompanyEmployee,
  type HireEmployeeConfig,
  updateEmployeeRolePrompt,
} from "../org/directory-commands";
import type { ArtifactRecord } from "../../domain/artifact/types";
import type { RequirementRoomRecord } from "../../domain/delegation/types";
import type { DispatchRecord } from "../../domain/delegation/types";
import type { RequirementSessionSnapshot } from "../../domain/mission/requirement-snapshot";
import type { Company } from "../../domain/org/types";

export function buildLobbyBlueprintText(input: {
  company: Company;
  knowledgeItems: Company["knowledgeItems"];
  jobs: CronJob[];
}) {
  const knowledgeItems = input.knowledgeItems ?? [];
  return JSON.stringify(
    buildCompanyBlueprint({
      company: {
        ...input.company,
        knowledgeItems,
      },
      jobs: input.jobs,
    }),
    null,
    2,
  );
}

export async function syncLobbyKnowledge(input: {
  knowledgeItems: Company["knowledgeItems"];
  updateCompany: (patch: Partial<Company>) => Promise<void> | void;
}) {
  const knowledgeItems = input.knowledgeItems ?? [];
  await input.updateCompany({ knowledgeItems });
  return knowledgeItems.length;
}

export async function hireLobbyEmployee(company: Company, config: HireEmployeeConfig) {
  const result = await hireCompanyEmployee(company, config);
  return result.agentId;
}

export async function updateLobbyEmployeeRole(agentId: string, role: string, description: string) {
  await updateEmployeeRolePrompt(agentId, role, description);
}

export async function fireLobbyEmployee(agentId: string) {
  await fireCompanyEmployee(agentId);
}

export async function assignLobbyQuickTask(agentId: string, text: string) {
  await assignEmployeeTask(agentId, text);
}

function buildLobbyActionTextPreview(text: string, limit = 48) {
  const trimmed = text.trim();
  if (trimmed.length <= limit) {
    return trimmed;
  }
  return `${trimmed.slice(0, limit)}...`;
}

export function buildLobbyGroupChatRoute(input: {
  activeRoomRecords: RequirementRoomRecord[];
  company: Company;
  currentRequirementTopicKey?: string | null;
  currentRequirementWorkItemId?: string | null;
  memberIds: string[];
  topic: string;
}) {
  const requirementTopicKey =
    input.currentRequirementTopicKey &&
    requestTopicMatchesText(input.currentRequirementTopicKey, input.topic)
      ? input.currentRequirementTopicKey
      : null;

  return buildRequirementRoomRoute({
    company: input.company,
    memberIds: input.memberIds,
    topic: input.topic,
    topicKey: requirementTopicKey,
    workItemId: input.currentRequirementWorkItemId,
    existingRooms: input.activeRoomRecords,
  });
}

export function useLobbyPageCommands(input: {
  activeCompany: Company;
  activeArtifacts: ArtifactRecord[];
  activeDispatches: DispatchRecord[];
  activeRoomRecords: RequirementRoomRecord[];
  companySessionSnapshots: RequirementSessionSnapshot[];
  cronCache: CronJob[];
  connected: boolean;
  isPageVisible: boolean;
  knowledgeItems: Company["knowledgeItems"];
  currentRequirementTopicKey?: string | null;
  currentRequirementWorkItemId?: string | null;
  replaceDispatchRecords: (dispatches: DispatchRecord[]) => void;
  setCompanySessionSnapshots: (snapshots: RequirementSessionSnapshot[]) => void;
  updateCompany: (patch: Partial<Company>) => Promise<void> | void;
}) {
  const [hireSubmitting, setHireSubmitting] = useState(false);
  const [updateRoleSubmitting, setUpdateRoleSubmitting] = useState(false);
  const [quickTaskSubmitting, setQuickTaskSubmitting] = useState(false);
  const [groupChatSubmitting, setGroupChatSubmitting] = useState(false);
  const { recoveringCommunication, recoverCommunication } = useLobbyCommunicationSyncState({
    activeCompany: input.activeCompany,
    surface: "lobby",
    companySessionSnapshots: input.companySessionSnapshots,
    setCompanySessionSnapshots: input.setCompanySessionSnapshots,
    activeArtifacts: input.activeArtifacts,
    activeDispatches: input.activeDispatches,
    replaceDispatchRecords: input.replaceDispatchRecords,
    updateCompany: input.updateCompany,
    connected: input.connected,
    isPageVisible: input.isPageVisible,
  });

  const buildBlueprintText = useCallback(
    () =>
      buildLobbyBlueprintText({
        company: input.activeCompany,
        knowledgeItems: input.knowledgeItems,
        jobs: input.cronCache,
      }),
    [input.activeCompany, input.cronCache, input.knowledgeItems],
  );

  const syncKnowledge = useCallback(
    () =>
      syncLobbyKnowledge({
        knowledgeItems: input.knowledgeItems,
        updateCompany: input.updateCompany,
      }),
    [input.knowledgeItems, input.updateCompany],
  );

  const hireEmployee = useCallback(
    async (config: HireEmployeeConfig) => {
      const role = (config.role ?? "").trim();
      const description = (config.description ?? "").trim();
      if (!role || !description) {
        return null;
      }

      setHireSubmitting(true);
      try {
        const agentId = await hireLobbyEmployee(input.activeCompany, config);
        await appendOperatorActionAuditEvent({
          companyId: input.activeCompany.id,
          action: "employee_hire",
          surface: "lobby",
          outcome: "succeeded",
          details: {
            targetActorId: agentId,
            role,
            descriptionPreview: buildLobbyActionTextPreview(description),
            modelTier: config.modelTier,
            budget: config.budget,
          },
        });
        return agentId;
      } catch (error) {
        await appendOperatorActionAuditEvent({
          companyId: input.activeCompany.id,
          action: "employee_hire",
          surface: "lobby",
          outcome: "failed",
          error: error instanceof Error ? error.message : String(error),
          details: {
            role,
            descriptionPreview: buildLobbyActionTextPreview(description),
            modelTier: config.modelTier,
            budget: config.budget,
          },
        });
        throw error;
      } finally {
        setHireSubmitting(false);
      }
    },
    [input.activeCompany],
  );

  const updateRole = useCallback(async (agentId: string | null, role: string, description: string) => {
    const nextRole = role.trim();
    const nextDescription = description.trim();
    if (!agentId || !nextRole || !nextDescription) {
      return false;
    }

    setUpdateRoleSubmitting(true);
    try {
      await updateLobbyEmployeeRole(agentId, nextRole, nextDescription);
      await appendOperatorActionAuditEvent({
        companyId: input.activeCompany.id,
        action: "employee_role_update",
        surface: "lobby",
        outcome: "succeeded",
        details: {
          targetActorId: agentId,
          role: nextRole,
          descriptionPreview: buildLobbyActionTextPreview(nextDescription),
          descriptionLength: nextDescription.length,
        },
      });
      return true;
    } catch (error) {
      await appendOperatorActionAuditEvent({
        companyId: input.activeCompany.id,
        action: "employee_role_update",
        surface: "lobby",
        outcome: "failed",
        error: error instanceof Error ? error.message : String(error),
        details: {
          targetActorId: agentId,
          role: nextRole,
          descriptionPreview: buildLobbyActionTextPreview(nextDescription),
          descriptionLength: nextDescription.length,
        },
      });
      throw error;
    } finally {
      setUpdateRoleSubmitting(false);
    }
  }, [input.activeCompany.id]);

  const fireEmployee = useCallback(
    async (agentId: string) => {
      try {
        await fireLobbyEmployee(agentId);
        await appendOperatorActionAuditEvent({
          companyId: input.activeCompany.id,
          action: "employee_fire",
          surface: "lobby",
          outcome: "succeeded",
          details: {
            targetActorId: agentId,
          },
        });
      } catch (error) {
        await appendOperatorActionAuditEvent({
          companyId: input.activeCompany.id,
          action: "employee_fire",
          surface: "lobby",
          outcome: "failed",
          error: error instanceof Error ? error.message : String(error),
          details: {
            targetActorId: agentId,
          },
        });
        throw error;
      }
    },
    [input.activeCompany.id],
  );

  const assignQuickTask = useCallback(async (agentId: string, text: string) => {
    const nextText = text.trim();
    if (!agentId || !nextText) {
      return false;
    }

    const details = {
      targetActorId: agentId,
      taskPreview: buildLobbyActionTextPreview(nextText),
      taskLength: nextText.length,
    };

    setQuickTaskSubmitting(true);
    try {
      await assignLobbyQuickTask(agentId, nextText);
      await appendOperatorActionAuditEvent({
        companyId: input.activeCompany.id,
        action: "quick_task_assign",
        surface: "lobby",
        outcome: "succeeded",
        details,
      });
      return true;
    } catch (error) {
      await appendOperatorActionAuditEvent({
        companyId: input.activeCompany.id,
        action: "quick_task_assign",
        surface: "lobby",
        outcome: "failed",
        error: error instanceof Error ? error.message : String(error),
        details,
      });
      throw error;
    } finally {
      setQuickTaskSubmitting(false);
    }
  }, [input.activeCompany.id]);

  const buildGroupChatRoute = useCallback(
    async (inputValues: { memberIds: string[]; topic: string }) => {
      const topic = inputValues.topic.trim();
      if (!topic || inputValues.memberIds.length < 2) {
        return null;
      }

      setGroupChatSubmitting(true);
      try {
        return buildLobbyGroupChatRoute({
          activeRoomRecords: input.activeRoomRecords,
          company: input.activeCompany,
          currentRequirementTopicKey: input.currentRequirementTopicKey,
          currentRequirementWorkItemId: input.currentRequirementWorkItemId,
          memberIds: inputValues.memberIds,
          topic,
        });
      } finally {
        setGroupChatSubmitting(false);
      }
    },
    [
      input.activeCompany,
      input.activeRoomRecords,
      input.currentRequirementTopicKey,
      input.currentRequirementWorkItemId,
    ],
  );

  return {
    buildBlueprintText,
    syncKnowledge,
    hireEmployee,
    updateRole,
    fireEmployee,
    assignQuickTask,
    buildGroupChatRoute,
    hireSubmitting,
    updateRoleSubmitting,
    quickTaskSubmitting,
    groupChatSubmitting,
    recoveringCommunication,
    recoverCommunication,
  };
}
