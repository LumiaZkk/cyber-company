import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ActionFormDialog } from "../components/ui/action-form-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "../components/ui/avatar";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { useCompanyStore } from "../features/company/store";
import { useGatewayStore } from "../features/gateway/store";
import type { Department } from "../features/company/types";
import {
  gateway,
  type AgentControlSnapshot,
  type GatewayModelChoice,
  type GatewaySessionRow,
} from "../features/backend";
import {
  isSessionActive,
  parseAgentIdFromSessionKey,
  resolveSessionTitle,
  resolveSessionUpdatedAt,
} from "../lib/sessions";

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

type SkillMode = "inherit" | "none" | "custom";

import { formatTime, getAvatarUrl } from "../lib/utils";
import { applyDepartmentLeadConstraints, resolveDepartmentLabel } from "../lib/org-departments";
import { toast } from "../features/ui/toast-store";

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

function toModelRef(model: GatewayModelChoice): string {
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

export function EmployeeProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { connected, modelsVersion } = useGatewayStore();
  const { activeCompany, updateCompany } = useCompanyStore();
  const previousModelsVersionRef = useRef(modelsVersion);

  const [sessions, setSessions] = useState<GatewaySessionRow[]>([]);
  const [cronJobs, setCronJobs] = useState<CronJob[]>([]);
  const [modelChoices, setModelChoices] = useState<GatewayModelChoice[]>([]);
  const [controlSnapshot, setControlSnapshot] = useState<AgentControlSnapshot | null>(null);
  const [modelDraft, setModelDraft] = useState("");
  const [skillMode, setSkillMode] = useState<SkillMode>("inherit");
  const [customSkillsDraft, setCustomSkillsDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [savingModel, setSavingModel] = useState(false);
  const [savingSkills, setSavingSkills] = useState(false);
  const [resettingSession, setResettingSession] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  const [departmentDraft, setDepartmentDraft] = useState<string>("");
  const [managerDraft, setManagerDraft] = useState<string>("");
  const [syncManagerToDeptLead, setSyncManagerToDeptLead] = useState(false);
  const [savingOrg, setSavingOrg] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

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

  useEffect(() => {
    if (!employee) {
      return;
    }
    setDepartmentDraft(employee.departmentId ?? "");
    setManagerDraft(employee.reportsTo ?? "");
  }, [employee]);

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

  const loadDetails = useCallback(
    async (agentId: string, options?: { silent?: boolean }) => {
      if (!gateway.isConnected) {
        return;
      }

      if (!options?.silent) {
        setLoading(true);
      }

      try {
        setError(null);
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
          .map((session) => ({ ...session, agentId: parseAgentIdFromSessionKey(session.key) }))
          .filter((session): session is GatewaySessionRow & { agentId: string } => {
            return session.agentId === agentId;
          })
          .sort((a, b) => resolveSessionUpdatedAt(b) - resolveSessionUpdatedAt(a));

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
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : String(loadError));
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
    void loadDetails(id);
  }, [id, loadDetails]);

  useEffect(() => {
    if (!connected || !id) {
      return;
    }
    void loadDetails(id, { silent: true });
  }, [connected, id, loadDetails]);

  useEffect(() => {
    if (!id || modelsVersion <= 0) {
      previousModelsVersionRef.current = modelsVersion;
      return;
    }
    if (previousModelsVersionRef.current === modelsVersion) {
      return;
    }
    previousModelsVersionRef.current = modelsVersion;
    void loadDetails(id, { silent: true });
  }, [id, loadDetails, modelsVersion]);

  if (!activeCompany) {
    return <div className="p-8 text-center text-muted-foreground">未选择正在运营的公司组织</div>;
  }

  if (!employee) {
    return <div className="p-8 text-center text-muted-foreground">未找到对应员工档案</div>;
  }

  const lastActive = sessions.reduce((latest, session) => {
    return Math.max(latest, resolveSessionUpdatedAt(session));
  }, 0);

  const activeSessionCount = sessions.filter((session) =>
    isSessionActive(session, currentTime),
  ).length;

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

  const handleSaveModel = async () => {
    if (!id || savingModel) {
      return;
    }

    setSavingModel(true);
    setNotice(null);
    setError(null);
    try {
      const result = await gateway.setAgentModelOverride(id, modelDraft);
      const modelToApply = modelDraft.trim() || controlSnapshot?.defaultModel?.trim() || "";
      if (modelToApply) {
        try {
          const session = await gateway.resolveSession(id);
          await gateway.sendChatMessage(session.key, `/model ${modelToApply}`);
        } catch (err) {
          console.warn("Failed to apply session model", err);
        }
      }
      await loadDetails(id, { silent: true });
      setNotice(result.updated ? "模型设置已更新。" : "模型设置未发生变化。");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSavingModel(false);
    }
  };

  const handleSaveSkills = async () => {
    if (!id || savingSkills) {
      return;
    }

    let nextSkills: string[] | null = null;
    if (skillMode === "none") {
      nextSkills = [];
    } else if (skillMode === "custom") {
      nextSkills = normalizeCustomSkills(customSkillsDraft);
      if (nextSkills.length === 0) {
        setError("自定义技能模式下，至少填写一个技能名。\n可用换行或逗号分隔。\n");
        return;
      }
    }

    setSavingSkills(true);
    setNotice(null);
    setError(null);
    try {
      const result = await gateway.setAgentSkillsOverride(id, nextSkills);
      await loadDetails(id, { silent: true });
      setNotice(result.updated ? "技能策略已更新。" : "技能策略未发生变化。");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSavingSkills(false);
    }
  };

  const handleResetMainSession = async () => {
    if (!id || resettingSession) {
      return;
    }

    setResettingSession(true);
    setNotice(null);
    setError(null);
    try {
      const sessionKey = `agent:${id}:main`;
      await gateway.resetSession(sessionKey);
      await loadDetails(id, { silent: true });
      setNotice(`已重置主会话上下文：${sessionKey}`);
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : String(resetError));
    } finally {
      setResettingSession(false);
    }
  };

  const handleSaveOrg = async () => {
    if (!activeCompany || !employee || !id || savingOrg) {
      return;
    }
    setSavingOrg(true);
    setNotice(null);
    setError(null);

    try {
      const deptId = departmentDraft.trim() || undefined;
      const managerId = managerDraft.trim() || undefined;

      const dept = deptId ? departments.find((item) => item.id === deptId) ?? null : null;
      const shouldSyncManager = syncManagerToDeptLead && dept && dept.leadAgentId;
      const effectiveManager = shouldSyncManager ? dept!.leadAgentId : managerId;

      const nextEmployees = activeCompany.employees.map((emp) => {
        if (emp.agentId !== employee.agentId) {
          return emp;
        }
        return {
          ...emp,
          departmentId: deptId,
          reportsTo: effectiveManager,
        };
      });

      const normalized = applyDepartmentLeadConstraints({
        company: activeCompany,
        nextDepartments: departments,
        nextEmployees,
      });

      await updateCompany({ employees: normalized.employees, departments: normalized.departments });
      for (const warning of normalized.warnings) {
        toast.info("组织校准", warning);
      }
      setNotice("组织归属已更新并落盘。");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingOrg(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-4 md:p-6 lg:p-8">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar className="w-16 h-16 border">
            <AvatarImage src={getAvatarUrl(employee.agentId, employee.avatarJobId)} />
            <AvatarFallback>{employee.nickname.slice(0, 1)}</AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{employee.nickname}</h1>
            <p className="text-muted-foreground text-sm mt-1">{employee.role}</p>
            {employee.metaRole && (
              <Badge variant="secondary" className="mt-2 uppercase tracking-wider">
                {employee.metaRole}
              </Badge>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate("/employees")}>
            返回列表
          </Button>
          <Button onClick={() => navigate(`/chat/${employee.agentId}`)}>对话</Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 whitespace-pre-line">
          {error}
        </div>
      )}

      {notice && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {notice}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">节点状态</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 mt-1">
              <span
                className={`w-3 h-3 rounded-full ${activeSessionCount > 0 ? "bg-green-500 animate-pulse" : "bg-slate-300"}`}
              />
              <span className="font-bold text-lg text-slate-800">
                {activeSessionCount > 0 ? "活跃处理中" : "待命闲置"}
              </span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">累计处理工作流</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black">
              {sessions.length} <span className="text-sm font-normal text-slate-500">条记录</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">最后汇报时间</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-medium">{formatTime(lastActive || undefined)}</div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8 mb-4">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          节点运行装箱 (Container Config)
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          控制该智能体的计算引擎、操作权限与上下文记忆。
        </p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">🏛 组织归属 (Department)</CardTitle>
          <CardDescription>
            调整该节点所属部门与直属上级。部门负责人默认汇报给 CEO（如负责人上级缺失）。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block">
              <div className="mb-1 text-sm font-medium text-slate-700">所属部门</div>
              <select
                className="w-full h-10 rounded-md border border-slate-300 px-3 py-2 text-sm bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={departmentDraft}
                onChange={(e) => setDepartmentDraft(e.target.value)}
              >
                <option value="">待分配</option>
                {departments
                  .filter((dept) => !dept.archived)
                  .map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name}
                    </option>
                  ))}
              </select>
              <div className="mt-2 text-xs text-slate-500">
                当前: <strong className="text-slate-700">{resolveDepartmentLabel({ deptId: employee.departmentId, departments })}</strong>
              </div>
            </label>

            <label className="block">
              <div className="mb-1 text-sm font-medium text-slate-700">直属上级 (reportsTo)</div>
              <select
                className="w-full h-10 rounded-md border border-slate-300 px-3 py-2 text-sm bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={managerDraft}
                onChange={(e) => setManagerDraft(e.target.value)}
              >
                <option value="">(无)</option>
                {activeCompany.employees
                  .filter((emp) => emp.agentId !== employee.agentId)
                  .map((emp) => (
                    <option key={emp.agentId} value={emp.agentId}>
                      {emp.nickname} {emp.metaRole ? `(${emp.metaRole})` : ""} - {emp.agentId}
                    </option>
                  ))}
              </select>
              <div className="mt-2 text-xs text-slate-500">
                当前: <strong className="text-slate-700">{employee.reportsTo || "(无)"}</strong>
              </div>
            </label>
          </div>

          <label className="flex items-center gap-3 text-sm select-none">
            <input
              type="checkbox"
              checked={syncManagerToDeptLead}
              onChange={(e) => setSyncManagerToDeptLead(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
            />
            <span className="text-slate-700">
              保存时同步直属上级为部门负责人（适合入组/转组）
            </span>
          </label>

          <div className="flex justify-end">
            <Button onClick={() => void handleSaveOrg()} disabled={savingOrg || loading}>
              {savingOrg ? "保存中..." : "保存组织归属"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            🧠 神经网格通道 (LLM Engine)
          </CardTitle>
          <CardDescription>指定该员工处理任务时调用的大模型底座。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col md:flex-row gap-4 items-end">
            <div className="flex-1 space-y-2 w-full">
              <label className="text-sm font-medium text-slate-700">配置策略</label>
              <select
                className="w-full h-10 rounded-md border border-slate-300 px-3 py-2 text-sm bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={modelDraft || ""}
                onChange={(e) => setModelDraft(e.target.value)}
              >
                <option value="">
                  继承全栈默认模式 ({controlSnapshot?.defaultModel ?? "未知"})
                </option>
                {modelDraftIsUnknown && modelDraft.trim().length > 0 ? (
                  <option value={modelDraft}>当前配置: {modelDraft}</option>
                ) : null}
                {modelChoices.map((model) => (
                  <option key={toModelRef(model)} value={toModelRef(model)}>
                    独立覆盖: {model.name} ({toModelRef(model)})
                  </option>
                ))}
              </select>
            </div>
            <div className="pb-0.5">
              <Button onClick={() => void handleSaveModel()} disabled={savingModel || loading}>
                {savingModel ? "保存中..." : "保存引擎设置"}
              </Button>
            </div>
          </div>
          <div className="text-xs text-slate-500 bg-slate-50 p-3 rounded-lg border mt-2">
            当前底层实际生效:{" "}
            <strong className="text-slate-700">{effectiveModel ?? "未设置"}</strong>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            🛡️ 安全协议与沙箱边界 (Skills)
          </CardTitle>
          <CardDescription>
            控制此节点能调用哪些底层能力（例如：文件读写、跨节点下发等）。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <button
              className={`p-4 rounded-lg border text-left flex flex-col items-start gap-2 transition-colors ${skillMode === "inherit" ? "border-indigo-500 bg-indigo-50/50 ring-1 ring-indigo-500" : "hover:bg-slate-50"}`}
              onClick={() => setSkillMode("inherit")}
            >
              <span className="font-semibold text-slate-900 flex items-center justify-between w-full">
                继承默认权限{" "}
                {skillMode === "inherit" && (
                  <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                )}
              </span>
              <span className="text-xs text-slate-500 leading-relaxed font-mono truncate w-full">
                {defaultSkillsLabel}
              </span>
            </button>
            <button
              className={`p-4 rounded-lg border text-left flex flex-col items-start gap-2 transition-colors ${skillMode === "none" ? "border-red-500 bg-red-50/50 ring-1 ring-red-500" : "hover:bg-slate-50"}`}
              onClick={() => setSkillMode("none")}
            >
              <span className="font-semibold text-slate-900 flex items-center justify-between w-full">
                最高隔离 (禁用全技能){" "}
                {skillMode === "none" && <div className="w-2 h-2 rounded-full bg-red-500"></div>}
              </span>
              <span className="text-xs text-slate-500">该特工将仅能执行纯文本问答推理。</span>
            </button>
            <button
              className={`p-4 rounded-lg border text-left flex flex-col items-start gap-2 transition-colors ${skillMode === "custom" ? "border-amber-500 bg-amber-50/50 ring-1 ring-amber-500" : "hover:bg-slate-50"}`}
              onClick={() => setSkillMode("custom")}
            >
              <span className="font-semibold text-slate-900 flex items-center justify-between w-full">
                自定义特权 (白名单){" "}
                {skillMode === "custom" && (
                  <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                )}
              </span>
              <span className="text-xs text-slate-500">手动指定允许调用的底层系统组件。</span>
            </button>
          </div>

          {skillMode === "custom" && (
            <div className="mt-4 space-y-2 p-4 bg-slate-50 rounded-lg border">
              <label className="text-sm font-medium text-slate-700">技能白名单编排</label>
              <textarea
                className="w-full min-h-[96px] rounded-md border border-slate-200 px-3 py-2 text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="在此输入技能标识（例如 file.read, db.query 等），换行或逗号分隔..."
                value={customSkillsDraft}
                onChange={(event) => setCustomSkillsDraft(event.target.value)}
              />
            </div>
          )}

          <div className="border-t pt-4">
            <Button onClick={() => void handleSaveSkills()} disabled={savingSkills || loading}>
              {savingSkills ? "装载中..." : "装载安全协议"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6 border-red-200 shadow-sm">
        <CardHeader className="bg-red-50/40 pb-4 border-b border-red-100">
          <CardTitle className="text-base flex items-center gap-2 text-red-900">
            🔄 行动记忆流控制 (Memory Reset)
          </CardTitle>
          <CardDescription className="text-red-900/80">
            清理此节点的短期记忆。若发生思维循环或对旧指令有顽固记忆，可在此重置该节点。
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="text-sm text-slate-600">
              <p>
                操作将**永久切断并封存**现有主线对话上下文，使该节点仿佛从刚入职时重新开始执行任务。
              </p>
            </div>
            <Button
              variant="outline"
              className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 shrink-0"
              onClick={() => setResetDialogOpen(true)}
              disabled={resettingSession || loading}
            >
              {resettingSession ? "重置中..." : "清除记忆流并重启网络"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <ActionFormDialog
        open={resetDialogOpen}
        onOpenChange={setResetDialogOpen}
        title="确认清除行动记忆？"
        description="操作将切断现有主线对话上下文，使该节点仿佛从刚入职时重新开始执行任务（这是不可逆操作）。"
        confirmLabel="强制清除"
        fields={[]}
        onSubmit={handleResetMainSession}
      />

      <Card>
        <CardHeader>
          <CardTitle>自动化班次</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="text-sm text-muted-foreground animate-pulse">正在加载...</div>
          ) : cronJobs.length === 0 ? (
            <div className="text-sm text-muted-foreground">暂无该员工的自动化班次</div>
          ) : (
            cronJobs.map((job) => {
              const idValue = typeof job.id === "string" ? job.id : "unknown";
              const name =
                typeof job.name === "string" && job.name.trim().length > 0 ? job.name : idValue;
              return (
                <div key={idValue} className="rounded-lg border p-3 text-sm">
                  <div className="font-medium text-slate-700">{name}</div>
                  <div className="flex gap-4 mt-2">
                    <div className="text-xs text-slate-500">
                      <span className="text-slate-400">下次派班:</span>{" "}
                      {formatTime(job.state?.nextRunAtMs)}
                    </div>
                    <div className="text-xs text-slate-500">
                      <span className="text-slate-400">最近执行:</span>{" "}
                      {formatTime(job.state?.lastRunAtMs)}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>工作记录</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {sessions.length === 0 ? (
            <div className="text-sm text-muted-foreground">暂无会话记录</div>
          ) : (
            sessions.slice(0, 20).map((session) => (
              <div key={session.key} className="rounded-lg border bg-white p-4 shadow-sm">
                <div className="font-semibold text-slate-800 tracking-wide mb-2 line-clamp-1">
                  {resolveSessionTitle(session)}
                </div>
                <div className="flex items-center justify-between">
                  {/* <div className="text-[10px] text-slate-400 font-mono bg-slate-50 px-1.5 py-0.5 rounded truncate max-w-[50%]">KEY: {session.key.slice(0, 24)}...</div> */}
                  <span className="text-[10px] bg-slate-50 text-slate-500 px-2 py-1 rounded border border-slate-100">
                    沟通频道
                  </span>
                  <div className="text-xs text-slate-500">
                    最后活跃于 {formatTime(resolveSessionUpdatedAt(session) || undefined)}
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
