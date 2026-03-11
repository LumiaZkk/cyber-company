import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  gateway,
  resolveCompanyActorConversation,
  sendTurnToCompanyActor,
  type AgentControlSnapshot,
  type GatewayModelChoice,
  type GatewaySessionRow,
  type ProviderManifest,
} from "../gateway";
import { useGatewayStore } from "../gateway";
import { waitForGatewayChatRunTerminal } from "../gateway/chat-run";
import { useOrgApp, useOrgQuery } from "./index";
import type { Department } from "../../domain/org/types";
import { applyDepartmentLeadConstraints } from "../../domain/org/policies";
import {
  isSessionActive,
  resolveSessionActorId,
  resolveSessionUpdatedAt,
} from "../../lib/sessions";

type CronJob = {
  id?: string;
  name?: string;
  enabled?: boolean;
  agentId?: string;
  state?: {
    nextRunAtMs?: number;
    lastRunAtMs?: number;
    lastStatus?: string;
  };
};

type CronListResult = {
  jobs?: CronJob[];
};

export type SkillMode = "inherit" | "none" | "custom";

function normalizeCustomSkills(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[\n,]/)
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    ),
  );
}

function dedupeModelChoices(models: GatewayModelChoice[]): GatewayModelChoice[] {
  const seen = new Set<string>();
  const deduped: GatewayModelChoice[] = [];
  for (const model of models) {
    const key = `${model.provider}/${model.id}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(model);
  }
  return deduped;
}

export function toModelRef(model: GatewayModelChoice): string {
  return `${model.provider}/${model.id}`;
}

function resolveModelDraftFromSnapshot(
  snapshot: AgentControlSnapshot,
  models: GatewayModelChoice[],
): string {
  const raw = snapshot.modelOverride ?? snapshot.defaultModel ?? "";
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.includes("/")) {
    return trimmed;
  }
  const matches = models.filter((model) => model.id === trimmed);
  if (matches.length === 1) {
    return toModelRef(matches[0]);
  }
  return trimmed;
}

export function useEmployeeProfileQuery(id: string | undefined) {
  const { connected, modelsVersion, manifest } = useGatewayStore();
  const { activeCompany } = useOrgQuery();
  const previousModelsVersionRef = useRef(modelsVersion);
  const [sessions, setSessions] = useState<GatewaySessionRow[]>([]);
  const [cronJobs, setCronJobs] = useState<CronJob[]>([]);
  const [modelChoices, setModelChoices] = useState<GatewayModelChoice[]>([]);
  const [controlSnapshot, setControlSnapshot] = useState<AgentControlSnapshot | null>(null);
  const [modelDraft, setModelDraft] = useState("");
  const [skillMode, setSkillMode] = useState<SkillMode>("inherit");
  const [customSkillsDraft, setCustomSkillsDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  const employee = useMemo(() => {
    if (!activeCompany || !id) {
      return null;
    }
    return activeCompany.employees.find((item) => item.agentId === id) ?? null;
  }, [activeCompany, id]);

  const departments: Department[] = useMemo(() => {
    const list = activeCompany?.departments;
    return Array.isArray(list) ? list : [];
  }, [activeCompany?.departments]);

  const applyControlSnapshot = useCallback(
    (snapshot: AgentControlSnapshot, models: GatewayModelChoice[]) => {
      setControlSnapshot(snapshot);
      setModelDraft(resolveModelDraftFromSnapshot(snapshot, models));

      if (snapshot.skillsOverride === null) {
        setSkillMode("inherit");
        setCustomSkillsDraft("");
        return;
      }

      if (snapshot.skillsOverride.length === 0) {
        setSkillMode("none");
        setCustomSkillsDraft("");
        return;
      }

      setSkillMode("custom");
      setCustomSkillsDraft(snapshot.skillsOverride.join("\n"));
    },
    [],
  );

  const reloadDetails = useCallback(
    async (agentId: string, options?: { silent?: boolean }) => {
      if (!gateway.isConnected) {
        return;
      }

      if (!options?.silent) {
        setLoading(true);
      }

      try {
        setLoadError(null);
        const [sessionResult, cronResult, modelsResult, controlsResult] = await Promise.all([
          gateway.listSessions({
            limit: 200,
            includeDerivedTitles: true,
            includeLastMessage: true,
          }),
          gateway.listCron(),
          gateway.listModels(),
          gateway.getAgentControlSnapshot(agentId),
        ]);

        const sessionRows = (sessionResult.sessions ?? [])
          .map((session) => ({ ...session, agentId: resolveSessionActorId(session) }))
          .filter((session): session is GatewaySessionRow & { agentId: string } => {
            return session.agentId === agentId;
          })
          .sort((left, right) => resolveSessionUpdatedAt(right) - resolveSessionUpdatedAt(left));

        const cronRows = (cronResult as CronListResult).jobs ?? [];
        const employeeJobs = cronRows.filter((job) => {
          return typeof job.agentId === "string" && job.agentId === agentId;
        });

        const nextModelChoices = dedupeModelChoices(
          Array.isArray(modelsResult.models) ? modelsResult.models : [],
        );

        setSessions(sessionRows);
        setCronJobs(employeeJobs);
        setModelChoices(nextModelChoices);
        applyControlSnapshot(controlsResult, nextModelChoices);
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : String(error));
      } finally {
        if (!options?.silent) {
          setLoading(false);
        }
      }
    },
    [applyControlSnapshot],
  );

  useEffect(() => {
    if (!id) {
      return;
    }
    void reloadDetails(id);
  }, [id, reloadDetails]);

  useEffect(() => {
    if (!connected || !id) {
      return;
    }
    void reloadDetails(id, { silent: true });
  }, [connected, id, reloadDetails]);

  useEffect(() => {
    if (!id || modelsVersion <= 0) {
      previousModelsVersionRef.current = modelsVersion;
      return;
    }
    if (previousModelsVersionRef.current === modelsVersion) {
      return;
    }
    previousModelsVersionRef.current = modelsVersion;
    void reloadDetails(id, { silent: true });
  }, [id, modelsVersion, reloadDetails]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  const lastActive = sessions.reduce((latest, session) => {
    return Math.max(latest, resolveSessionUpdatedAt(session));
  }, 0);
  const activeSessionCount = sessions.filter((session) => isSessionActive(session, currentTime)).length;
  const effectiveModel = controlSnapshot?.modelOverride ?? controlSnapshot?.defaultModel ?? null;
  const modelDraftIsUnknown = useMemo(() => {
    const draft = modelDraft.trim();
    if (!draft) {
      return false;
    }
    const known = new Set(modelChoices.map((model) => toModelRef(model)));
    return !known.has(draft);
  }, [modelChoices, modelDraft]);
  const defaultSkillsLabel = (() => {
    const defaults = controlSnapshot?.defaultSkills;
    if (defaults === null) {
      return "未设置默认技能（等价于不限制）";
    }
    if (defaults === undefined) {
      return "加载中...";
    }
    if (defaults.length === 0) {
      return "默认技能为空（不加载技能）";
    }
    return defaults.join(", ");
  })();

  return {
    activeCompany,
    activeSessionCount,
    connected,
    controlSnapshot,
    cronJobs,
    customSkillsDraft,
    defaultSkillsLabel,
    departments,
    effectiveModel,
    employee,
    lastActive,
    loadError,
    loading,
    manifest,
    modelChoices,
    modelDraft,
    modelDraftIsUnknown,
    reloadDetails,
    sessions,
    setCustomSkillsDraft,
    setModelDraft,
    setSkillMode,
    skillMode,
  };
}

export function useEmployeeProfileCommands(input: {
  activeCompany: ReturnType<typeof useOrgQuery>["activeCompany"];
  controlSnapshot: AgentControlSnapshot | null;
  customSkillsDraft: string;
  departments: Department[];
  employee: ReturnType<typeof useEmployeeProfileQuery>["employee"];
  id: string | undefined;
  loadDetails: (agentId: string, options?: { silent?: boolean }) => Promise<void>;
  managerDraft: string;
  manifest: ProviderManifest;
  modelDraft: string;
  savingOrgInput: {
    departmentDraft: string;
    syncManagerToDeptLead: boolean;
  };
  skillMode: SkillMode;
}) {
  const { updateCompany } = useOrgApp();
  const [notice, setNotice] = useState<string | null>(null);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [savingModel, setSavingModel] = useState(false);
  const [savingSkills, setSavingSkills] = useState(false);
  const [resettingSession, setResettingSession] = useState(false);
  const [savingOrg, setSavingOrg] = useState(false);

  const handleSaveModel = async () => {
    if (!input.id || savingModel) {
      return;
    }

    setSavingModel(true);
    setNotice(null);
    setCommandError(null);
    try {
      const result = await gateway.setAgentModelOverride(input.id, input.modelDraft);
      let sessionSyncNotice: string | null = null;
      const modelToApply =
        input.modelDraft.trim() || input.controlSnapshot?.defaultModel?.trim() || "";
      if (modelToApply) {
        try {
          const ack = await sendTurnToCompanyActor({
            backend: gateway,
            manifest: input.manifest,
            company: input.activeCompany,
            actorId: input.id,
            message: `/model ${modelToApply}`,
            targetActorIds: [input.id],
          });
          await waitForGatewayChatRunTerminal({
            providerSessionKey: ack.providerConversationRef.conversationId,
            runId: ack.runId,
          });
        } catch (error) {
          console.warn("Failed to apply session model", error);
          sessionSyncNotice =
            error instanceof Error
              ? `配置已保存，但主会话未确认完成模型切换：${error.message}`
              : "配置已保存，但主会话未确认完成模型切换。";
        }
      }
      await input.loadDetails(input.id, { silent: true });
      setNotice(
        sessionSyncNotice
          ?? (result.updated ? "模型设置已更新，并已同步到主会话。" : "模型设置未发生变化，已重新同步主会话。"),
      );
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingModel(false);
    }
  };

  const handleSaveSkills = async () => {
    if (!input.id || savingSkills) {
      return;
    }

    let nextSkills: string[] | null = null;
    if (input.skillMode === "none") {
      nextSkills = [];
    } else if (input.skillMode === "custom") {
      nextSkills = normalizeCustomSkills(input.customSkillsDraft);
      if (nextSkills.length === 0) {
        setCommandError("自定义技能模式下，至少填写一个技能名。\n可用换行或逗号分隔。\n");
        return;
      }
    }

    setSavingSkills(true);
    setNotice(null);
    setCommandError(null);
    try {
      const result = await gateway.setAgentSkillsOverride(input.id, nextSkills);
      await input.loadDetails(input.id, { silent: true });
      setNotice(result.updated ? "技能策略已更新。" : "技能策略未发生变化。");
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingSkills(false);
    }
  };

  const handleResetMainSession = async () => {
    if (!input.id || resettingSession || !input.activeCompany) {
      return;
    }

    setResettingSession(true);
    setNotice(null);
    setCommandError(null);
    try {
      const resolved = await resolveCompanyActorConversation({
        backend: gateway,
        manifest: input.manifest,
        company: input.activeCompany,
        actorId: input.id,
        kind: "direct",
      });
      const sessionKey = resolved.conversationRef.conversationId;
      await gateway.resetSession(sessionKey);
      await input.loadDetails(input.id, { silent: true });
      setNotice(`已重置主会话上下文：${sessionKey}`);
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : String(error));
    } finally {
      setResettingSession(false);
    }
  };

  const handleSaveOrg = async () => {
    if (!input.activeCompany || !input.employee || !input.id || savingOrg) {
      return { warnings: [] as string[] };
    }

    setSavingOrg(true);
    setNotice(null);
    setCommandError(null);

    try {
      const deptId = input.savingOrgInput.departmentDraft.trim() || undefined;
      const managerId = input.managerDraft.trim() || undefined;

      const dept = deptId ? input.departments.find((item) => item.id === deptId) ?? null : null;
      const shouldSyncManager = input.savingOrgInput.syncManagerToDeptLead && dept && dept.leadAgentId;
      const effectiveManager = shouldSyncManager ? dept!.leadAgentId : managerId;

      const nextEmployees = input.activeCompany.employees.map((employee) => {
        if (employee.agentId !== input.employee?.agentId) {
          return employee;
        }
        return {
          ...employee,
          departmentId: deptId,
          reportsTo: effectiveManager,
        };
      });

      const normalized = applyDepartmentLeadConstraints({
        company: input.activeCompany,
        nextDepartments: input.departments,
        nextEmployees,
      });

      await updateCompany({ employees: normalized.employees, departments: normalized.departments });
      setNotice("组织归属已更新并落盘。");
      return { warnings: normalized.warnings };
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : String(error));
      return { warnings: [] as string[] };
    } finally {
      setSavingOrg(false);
    }
  };

  return {
    commandError,
    handleResetMainSession,
    handleSaveModel,
    handleSaveOrg,
    handleSaveSkills,
    notice,
    resettingSession,
    savingModel,
    savingOrg,
    savingSkills,
  };
}
