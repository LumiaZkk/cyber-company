import {
  MessageSquare,
  Settings,
  Play,
  Database,
  HardDrive,
  Wifi,
  MoreVertical,
  ShieldAlert,
  Cpu,
  Trash2,
  FileText,
  FileJson,
  FileCode,
  Network,
  List,
  UserCog,
  Wand2,
  Building2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ActionFormDialog } from "../components/ui/action-form-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "../components/ui/avatar";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { DepartmentManagerDialog } from "../components/ui/department-manager-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import {
  HrDepartmentPlanDialog,
  type HrPlanDialogState,
} from "../components/ui/hr-department-plan-dialog";
import { ImmersiveHireDialog, type HireConfig } from "../components/ui/immersive-hire-dialog";
import { OrgChart } from "../components/ui/org-chart";
import { useCompanyStore } from "../features/company/store";
import type { Department } from "../features/company/types";
import { gateway, type AgentListEntry, type GatewaySessionRow } from "../features/backend";
import type { ChatMessage } from "../features/backend";
import { buildEmployeeOperationalInsights } from "../features/insights/company-insights";
import { toast } from "../features/ui/toast-store";
import { AgentOps } from "../lib/agent-ops";
import { resolveMetaAgentId } from "../lib/chat-as-config";
import { applyOrgRecommendation, buildOrgAdvisorSnapshot } from "../features/org/org-advisor";
import { applyHrDepartmentPlan, parseHrDepartmentPlan } from "../lib/hr-dept-plan";
import {
  applyDepartmentLeadConstraints,
  applyOneClickOrgFixups,
  resolveDepartmentLabel,
  resolveOrgIssues,
} from "../lib/org-departments";
import {
  isSessionActive,
  parseAgentIdFromSessionKey,
  resolveSessionUpdatedAt,
} from "../lib/sessions";
import { formatTime, getAvatarUrl } from "../lib/utils";

export function EmployeeList() {
  const navigate = useNavigate();
  const { activeCompany, updateCompany } = useCompanyStore();

  const [agents, setAgents] = useState<AgentListEntry[]>([]);
  const [sessions, setSessions] = useState<GatewaySessionRow[]>([]);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [hireDialogOpen, setHireDialogOpen] = useState(false);
  const [hireSubmitting, setHireSubmitting] = useState(false);

  const [fireEmployeeDialogOpen, setFireEmployeeDialogOpen] = useState(false);
  const [fireEmployeeTarget, setFireEmployeeTarget] = useState<string | null>(null);

  const [updateProfileDialogOpen, setUpdateProfileDialogOpen] = useState(false);
  const [updateProfileTarget, setUpdateProfileTarget] = useState<string | null>(null);
  const [updateProfileInitial, setUpdateProfileInitial] = useState({ nickname: "", role: "" });
  const [profileSubmitting, setProfileSubmitting] = useState(false);
  const [updateRoleDialogOpen, setUpdateRoleDialogOpen] = useState(false);
  const [updateRoleSubmitting, setUpdateRoleSubmitting] = useState(false);
  const [updateRoleTarget, setUpdateRoleTarget] = useState<string | null>(null);
  const [updateRoleInitial, setUpdateRoleInitial] = useState<{
    role: string;
    description: string;
  } | null>(null);

  const [agentFiles, setAgentFiles] = useState<Record<string, { workspace: string; files: any[] }>>(
    {},
  );
  const [editingFile, setEditingFile] = useState<{
    agentId: string;
    name: string;
    content: string;
    loaded: boolean;
    saving: boolean;
  } | null>(null);
  const [viewMode, setViewMode] = useState<"org" | "list">("org");
  const [departmentsDialogOpen, setDepartmentsDialogOpen] = useState(false);
  const [departmentsSaving, setDepartmentsSaving] = useState(false);
  const [fixingOrg, setFixingOrg] = useState(false);
  const [hrPlanDialogOpen, setHrPlanDialogOpen] = useState(false);
  const [hrPlanDialogState, setHrPlanDialogState] = useState<HrPlanDialogState>({ status: "idle" });
  const [applyingHrPlan, setApplyingHrPlan] = useState(false);
  const hrSubscriptionRef = useRef<null | (() => void)>(null);

  const formatBytes = (bytes?: number) => {
    if (bytes === undefined) return "--";
    if (bytes === 0) {
      return "0 B";
    }
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const handleOpenFile = async (agentId: string, fileName: string) => {
    setEditingFile({ agentId, name: fileName, content: "", loaded: false, saving: false });
    try {
      const res = await gateway.getAgentFile(agentId, fileName);
      setEditingFile({
        agentId,
        name: fileName,
        content: res.file?.content || "",
        loaded: true,
        saving: false,
      });
    } catch (e) {
      console.error(e);
      toast.error("读取失败", String(e));
      setEditingFile(null);
    }
  };

  const handleSaveFile = async () => {
    if (!editingFile) return;
    setEditingFile((prev) => (prev ? { ...prev, saving: true } : null));
    try {
      await gateway.setAgentFile(editingFile.agentId, editingFile.name, editingFile.content);
      toast.success("保存成功", "文件已更新并同步到网关。");
      setEditingFile(null);
    } catch (e) {
      console.error(e);
      toast.error("保存失败", String(e));
      setEditingFile((prev) => (prev ? { ...prev, saving: false } : null));
    }
  };

  const handleHireEmployee = async (config: HireConfig) => {
    if (!activeCompany) {
      return;
    }

    const role = (config.role ?? "").trim();
    const description = (config.description ?? "").trim();
    if (!role || !description) {
      return;
    }

    setHireSubmitting(true);
    try {
      const result = await AgentOps.hireEmployee(activeCompany, config);
      setHireDialogOpen(false);
      navigate(`/chat/${result.agentId}`);
    } finally {
      setHireSubmitting(false);
    }
  };

  const handleUpdateRoleSubmit = async (values: Record<string, string>) => {
    if (!updateRoleTarget) return;
    const role = (values.role ?? "").trim();
    const description = (values.description ?? "").trim();
    if (!role || !description) return;

    setUpdateRoleSubmitting(true);
    try {
      await AgentOps.updateRole(updateRoleTarget, role, description);
      setUpdateRoleDialogOpen(false);
    } finally {
      setUpdateRoleSubmitting(false);
    }
  };

  useEffect(() => {
    async function loadData() {
      if (!gateway.isConnected) {
        return;
      }
      try {
        const [aRes, sRes] = await Promise.all([gateway.listAgents(), gateway.listSessions()]);
        setAgents(aRes.agents || []);
        setSessions(sRes.sessions || []);

        if (aRes.agents) {
          const filesMap: Record<string, { workspace: string; files: any[] }> = {};
          await Promise.all(
            aRes.agents.map(async (a) => {
              try {
                const res = await gateway.listAgentFiles(a.id);
                filesMap[a.id] = { workspace: res.workspace, files: res.files || [] };
              } catch (e: unknown) {}
            }),
          );
          setAgentFiles(filesMap);
        }
      } catch (e) {
        console.error("Failed to load employee data", e);
      }
    }
    loadData();
    const t = setInterval(loadData, 15000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  const departments: Department[] = useMemo(() => {
    if (!activeCompany) {
      return [];
    }
    return Array.isArray(activeCompany.departments) ? activeCompany.departments : [];
  }, [activeCompany]);

  const orgIssues = useMemo(() => {
    if (!activeCompany) {
      return [];
    }
    return resolveOrgIssues({ employees: activeCompany.employees });
  }, [activeCompany]);
  const orgAdvisor = useMemo(() => {
    if (!activeCompany) {
      return null;
    }
    return buildOrgAdvisorSnapshot(activeCompany);
  }, [activeCompany]);

  const orgIssueCount = orgIssues.length;
  const hrPlanning = hrPlanDialogState.status === "waiting";

  const extractTextFromMessage = (message?: ChatMessage | null): string => {
    if (!message) {
      return "";
    }
    if (typeof message.content === "string") {
      return message.content;
    }
    if (Array.isArray(message.content)) {
      return message.content
        .map((block) => {
          if (typeof block === "string") {
            return block;
          }
          if (block && typeof block === "object" && !Array.isArray(block)) {
            const record = block as Record<string, unknown>;
            if (record.type === "text" && typeof record.text === "string") {
              return record.text;
            }
          }
          return "";
        })
        .join("\n")
        .trim();
    }
    if (typeof message.text === "string") {
      return message.text;
    }
    return "";
  };

  useEffect(() => {
    return () => {
      hrSubscriptionRef.current?.();
      hrSubscriptionRef.current = null;
    };
  }, []);

  const buildHrBootstrapPrompt = () => {
    if (!activeCompany) {
      return "";
    }
    const snapshot = {
      companyId: activeCompany.id,
      companyName: activeCompany.name,
      template: activeCompany.template,
      departments: Array.isArray(activeCompany.departments) ? activeCompany.departments : [],
      employees: activeCompany.employees.map((emp) => ({
        agentId: emp.agentId,
        nickname: emp.nickname,
        role: emp.role,
        isMeta: emp.isMeta,
        metaRole: emp.metaRole ?? null,
        reportsTo: emp.reportsTo ?? null,
        departmentId: emp.departmentId ?? null,
      })),
    };

    return (
      `你是该公司的 HR。请你负责“部门建立 + 汇报线校准”。\n\n` +
      `目标：让组织图不割裂、部门边界清晰。\n` +
      `规则：\n` +
      `- 部门必须绑定一个真实员工节点作为负责人（leadAgentId 必须是 employees 里的 agentId）。\n` +
      `- 每个部门负责人默认向 CEO 汇报（reportsTo=CEO）。\n` +
      `- 必须包含元部门：管理中枢(CEO)、人力资源部(HR)、技术部(CTO)、运营部(COO)。\n` +
      `- 普通员工默认归入部门，并尽量挂到该部门负责人下面（除非你认为更合理）。\n` +
      `- 不要改 meta 管理层的岗位，只在必要时调整他们的 reportsTo 来保证结构合理。\n\n` +
      `请输出结构化 JSON 方案（不要输出解释性文字），格式必须是一个 \`\`\`json 代码块：\n` +
      `\n\`\`\`json\n` +
      `{\n` +
      `  "kind": "cyber-company.departmentPlan.v1",\n` +
      `  "companyId": "${activeCompany.id}",\n` +
      `  "departments": [ { "id": "dep-...", "name": "...", "leadAgentId": "...", "color": "amber", "order": 0 } ],\n` +
      `  "employees": [ { "agentId": "...", "departmentId": "dep-...", "reportsTo": "..." } ]\n` +
      `}\n` +
      `\`\`\`\n\n` +
      `当前快照如下：\n\n` +
      `\`\`\`json\n${JSON.stringify(snapshot, null, 2)}\n\`\`\`\n`
    );
  };

  const handleHrBootstrapDepartments = async () => {
    if (!activeCompany) {
      return;
    }
    const hrAgentId = resolveMetaAgentId(activeCompany, "hr");
    if (!hrAgentId) {
      toast.error("无法下发", "当前公司没有 HR 节点。 ");
      return;
    }

    hrSubscriptionRef.current?.();
    hrSubscriptionRef.current = null;

    setHrPlanDialogOpen(true);
    setHrPlanDialogState({ status: "waiting", sessionKey: "", runId: null });

    try {
      const hrSession = await gateway.resolveSession(hrAgentId);
      const prompt = buildHrBootstrapPrompt();
      const ack = await gateway.sendChatMessage(hrSession.key, prompt, { timeoutMs: 300_000 });
      const runId = ack?.runId ?? null;

      setHrPlanDialogState({ status: "waiting", sessionKey: hrSession.key, runId });

      const unsubscribe = gateway.subscribe("chat", (rawPayload) => {
        if (!rawPayload || typeof rawPayload !== "object") {
          return;
        }

        const payload = rawPayload as Record<string, unknown>;
        const sessionKey = typeof payload.sessionKey === "string" ? payload.sessionKey : null;
        const state = typeof payload.state === "string" ? payload.state : null;
        const payloadRunId = typeof payload.runId === "string" ? payload.runId : null;

        if (!sessionKey || !state) {
          return;
        }
        if (sessionKey !== hrSession.key) {
          return;
        }

        if (runId && payloadRunId && payloadRunId !== runId) {
          return;
        }

        if (state === "error") {
          setHrPlanDialogState({
            status: "error",
            sessionKey: hrSession.key,
            runId,
            message: typeof payload.errorMessage === "string" ? payload.errorMessage : "chat error",
          });
          hrSubscriptionRef.current?.();
          hrSubscriptionRef.current = null;
          return;
        }

        if (state === "final") {
          const message = payload.message as ChatMessage | undefined;
          const msgText = extractTextFromMessage(message);
          setHrPlanDialogState({
            status: "ready",
            sessionKey: hrSession.key,
            runId,
            rawText: msgText,
          });
          hrSubscriptionRef.current?.();
          hrSubscriptionRef.current = null;
        }
      });

      hrSubscriptionRef.current = unsubscribe;
    } catch (err) {
      setHrPlanDialogState({
        status: "error",
        sessionKey: null,
        runId: null,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const canApplyHrPlan = hrPlanDialogState.status === "ready";

  const handleApplyHrPlan = async () => {
    if (!activeCompany || applyingHrPlan) {
      return;
    }
    if (hrPlanDialogState.status !== "ready") {
      return;
    }

    setApplyingHrPlan(true);
    try {
      const plan = parseHrDepartmentPlan(hrPlanDialogState.rawText);
      if (!plan) {
        toast.error("无法解析 HR 方案", "请让 HR 严格输出 departmentPlan.v1 的 JSON 代码块。 ");
        return;
      }
      if (plan.companyId !== activeCompany.id) {
        toast.error("HR 方案不匹配", `期望 companyId=${activeCompany.id}，实际=${plan.companyId}`);
        return;
      }

      const applied = applyHrDepartmentPlan({ company: activeCompany, plan });
      for (const warning of applied.warnings) {
        toast.info("HR 方案校验", warning);
      }

      const normalized = applyOneClickOrgFixups({
        company: activeCompany,
        nextDepartments: applied.departments,
        nextEmployees: applied.employees,
      });

      await updateCompany({
        departments: normalized.departments,
        employees: normalized.employees,
      });

      for (const warning of normalized.warnings) {
        toast.info("组织校准", warning);
      }
      toast.success("HR 方案已应用", "部门与汇报线已落盘。 ");
      setHrPlanDialogOpen(false);
      setHrPlanDialogState({ status: "idle" });
    } finally {
      setApplyingHrPlan(false);
    }
  };

  const handleFixOrg = async () => {
    if (!activeCompany || fixingOrg) {
      return;
    }
    if (orgIssueCount === 0) {
      toast.info("无需修复", "未检测到孤儿节点或循环引用。");
      return;
    }

    setFixingOrg(true);
    try {
      const normalized = applyOneClickOrgFixups({
        company: activeCompany,
        nextDepartments: departments,
        nextEmployees: activeCompany.employees,
      });

      const issuesAfter = resolveOrgIssues({ employees: normalized.employees }).length;

      await updateCompany({
        departments: normalized.departments,
        employees: normalized.employees,
      });

      for (const warning of normalized.warnings) {
        toast.info("组织校准", warning);
      }

      toast.success(
        "一键修复完成",
        `修复 ${normalized.stats.fixedManagers} 项 · 问题 ${normalized.stats.issuesBefore} -> ${issuesAfter}`,
      );
    } catch (err) {
      toast.error("修复失败", err instanceof Error ? err.message : String(err));
    } finally {
      setFixingOrg(false);
    }
  };

  const handleApplyOrgRecommendation = async (recommendationId: string) => {
    if (!activeCompany) {
      return;
    }
    const recommendation = orgAdvisor?.recommendations.find((item) => item.id === recommendationId);
    if (!recommendation) {
      return;
    }
    try {
      const normalized = applyOrgRecommendation({
        company: activeCompany,
        recommendation,
      });
      await updateCompany({
        departments: normalized.departments,
        employees: normalized.employees,
      });
      for (const warning of normalized.warnings) {
        toast.info("组织校准", warning);
      }
      toast.success("组织建议已应用", recommendation.title);
    } catch (err) {
      toast.error("应用失败", err instanceof Error ? err.message : String(err));
    }
  };

  if (!activeCompany) {
    return <div className="p-8 text-center text-muted-foreground">未选择正在运营的公司组织</div>;
  }

  const parsedSessions = sessions
    .map((session) => ({ ...session, agentId: parseAgentIdFromSessionKey(session.key) }))
    .filter((session): session is GatewaySessionRow & { agentId: string } => {
      return typeof session.agentId === "string";
    });

  const employeeInsights = useMemo(
    () =>
      buildEmployeeOperationalInsights({
        company: activeCompany,
        sessions: parsedSessions,
        now: currentTime,
      }),
    [activeCompany, parsedSessions, currentTime],
  );

  const handleUpdateProfile = async (values: Record<string, string>) => {
    if (!updateProfileTarget || !activeCompany) return;
    const nickname = (values.nickname ?? "").trim();
    const role = (values.role ?? "").trim();
    const shouldSyncIdentityName = values.syncIdentityName === "true";

    if (!nickname) {
      toast.error("更新失败", "花名不能为空。 ");
      return;
    }

    setProfileSubmitting(true);
    try {
      const newEmployees = activeCompany.employees.map((e) => {
        if (e.agentId === updateProfileTarget) {
          return { ...e, nickname, role };
        }
        return e;
      });
      await updateCompany({ employees: newEmployees });

      if (shouldSyncIdentityName) {
        try {
          await AgentOps.updateAgentName(updateProfileTarget, nickname);
        } catch (e: unknown) {
          const errMsg = e instanceof Error ? e.message : String(e);
          toast.warning("Identity Name 同步失败", errMsg);
        }
      }

      toast.success("资料已保存", "员工的花名和描述已更新。");
      setUpdateProfileDialogOpen(false);
    } catch (e: unknown) {
      toast.error("更新失败", String(e));
    } finally {
      setProfileSubmitting(false);
    }
  };

  const employeesData = activeCompany.employees.map((employee) => {
    const liveAgent = agents.find((agent) => agent.id === employee.agentId);
    const employeeSessions = parsedSessions.filter(
      (session) => session.agentId === employee.agentId,
    );
    const lastActive = employeeSessions.reduce((latest, session) => {
      return Math.max(latest, resolveSessionUpdatedAt(session));
    }, 0);
    const status = (
      employeeSessions.some((session) => isSessionActive(session, currentTime))
        ? "running"
        : lastActive > 0 || Boolean(liveAgent)
          ? "idle"
          : "stopped"
    ) as "running" | "idle" | "stopped";

    return {
      ...employee,
      status,
      realName: liveAgent?.name || employee.nickname,
      skills: liveAgent?.identity?.theme ? [] : (employee as any).skills || [], // fallback if we don't have gateway skills API direct mapping
      workspace: "N/A",
      sessionCount: employeeSessions.length,
      lastActiveAt: lastActive,
      lastActive,
    };
  });
  const insightByAgentId = new Map(employeeInsights.map((insight) => [insight.agentId, insight]));
  const overloadedEmployees = employeeInsights.filter((insight) => insight.loadState === "overloaded");
  const fragileEmployees = employeeInsights.filter((insight) => insight.reliabilityState === "fragile");
  const balancedEmployees = employeeInsights.filter((insight) => insight.loadState === "balanced");

  const updateProfileEmployee = updateProfileTarget
    ? (activeCompany.employees.find((emp) => emp.agentId === updateProfileTarget) ?? null)
    : null;

  const handleSaveDepartments = async (nextDepartments: Department[]) => {
    if (!activeCompany) {
      return;
    }
    setDepartmentsSaving(true);
    try {
      const normalized = applyDepartmentLeadConstraints({
        company: activeCompany,
        nextDepartments,
        nextEmployees: activeCompany.employees,
      });

      await updateCompany({
        departments: normalized.departments,
        employees: normalized.employees,
      });
      for (const warning of normalized.warnings) {
        toast.info("部门校准", warning);
      }
      toast.success("部门配置已更新", "已写入公司注册表 (company-config.json)。");
      setDepartmentsDialogOpen(false);
    } catch (err) {
      toast.error("保存失败", err instanceof Error ? err.message : String(err));
    } finally {
      setDepartmentsSaving(false);
    }
  };

  const handleFireEmployee = (agentId: string) => {
    setFireEmployeeTarget(agentId);
    setFireEmployeeDialogOpen(true);
  };

  const onFireEmployeeSubmit = async () => {
    if (!activeCompany || !fireEmployeeTarget) return;
    try {
      await AgentOps.fireAgent(fireEmployeeTarget);
      setTimeout(() => window.location.reload(), 1500);
    } catch (e: unknown) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-4 md:p-6 lg:p-8">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between mb-8 gap-4 lg:gap-0">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">员工管理档案</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            管理及调配赛博公司麾下的所有计算节点与 AI 特工
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 md:gap-4">
          <div className="bg-slate-100 p-1 rounded-lg flex items-center">
            <Button
              variant="ghost"
              size="sm"
              className={`h-8 px-3 rounded-md ${viewMode === "org" ? "bg-white shadow-sm text-indigo-600" : "text-slate-500 hover:text-slate-700"}`}
              onClick={() => setViewMode("org")}
            >
              <Network className="w-4 h-4 mr-2" />
              架构图
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={`h-8 px-3 rounded-md ${viewMode === "list" ? "bg-white shadow-sm text-indigo-600" : "text-slate-500 hover:text-slate-700"}`}
              onClick={() => setViewMode("list")}
            >
              <List className="w-4 h-4 mr-2" />
              列表
            </Button>
          </div>
          {viewMode === "org" ? (
            <Button
              variant="secondary"
              onClick={() => void handleHrBootstrapDepartments()}
              disabled={hrPlanning}
              title="由 HR agent 分析输出方案，前端仅负责落盘。"
            >
              <Building2 className="w-4 h-4 mr-2" />
              {hrPlanning ? "等待 HR..." : "HR 建部门"}
            </Button>
          ) : null}
          {viewMode === "org" ? (
            <Button
              variant="secondary"
              onClick={() => void handleFixOrg()}
              disabled={fixingOrg || orgIssueCount === 0}
              title={orgIssueCount > 0 ? `检测到 ${orgIssueCount} 个结构问题` : "未检测到结构问题"}
            >
              <Wand2 className="w-4 h-4 mr-2" />
              {fixingOrg
                ? "修复中..."
                : orgIssueCount > 0
                  ? `一键修复 (${orgIssueCount})`
                  : "一键修复"}
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => setDepartmentsDialogOpen(true)}>
            部门管理
          </Button>
          <Button onClick={() => setHireDialogOpen(true)}>招募新员工</Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-slate-200 bg-white">
          <CardContent className="p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">过载角色</div>
            <div className="mt-2 text-3xl font-black text-rose-700">{overloadedEmployees.length}</div>
            <div className="mt-2 text-xs text-slate-500">
              {overloadedEmployees.length > 0
                ? overloadedEmployees.slice(0, 2).map((employee) => employee.nickname).join("、")
                : "当前没有明显过载节点"}
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200 bg-white">
          <CardContent className="p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">脆弱节点</div>
            <div className="mt-2 text-3xl font-black text-amber-700">{fragileEmployees.length}</div>
            <div className="mt-2 text-xs text-slate-500">
              {fragileEmployees.length > 0
                ? fragileEmployees.slice(0, 2).map((employee) => employee.nickname).join("、")
                : "当前没有明显脆弱节点"}
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200 bg-white">
          <CardContent className="p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">稳定补位</div>
            <div className="mt-2 text-3xl font-black text-emerald-700">{balancedEmployees.length}</div>
            <div className="mt-2 text-xs text-slate-500">适合承担补位、接管或新任务的平衡节点</div>
          </CardContent>
        </Card>
        <Card className="border-slate-200 bg-white">
          <CardContent className="p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">最高负载</div>
            <div className="mt-2 text-lg font-black text-slate-900">
              {employeeInsights[0]
                ? `${employeeInsights[0].nickname} · ${employeeInsights[0].loadScore}`
                : "--"}
            </div>
            <div className="mt-2 text-xs text-slate-500">
              结合任务、交接、SLA 和会话活跃度的综合负载分
            </div>
          </CardContent>
        </Card>
      </div>

      {viewMode === "org" && orgAdvisor && (
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="border-b bg-slate-50/60">
            <CardTitle className="text-base">CEO 组织建议</CardTitle>
            <CardDescription>{orgAdvisor.headline}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 p-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
              {orgAdvisor.summary}
            </div>
            {orgAdvisor.recommendations.length > 0 ? (
              orgAdvisor.recommendations.map((recommendation) => (
                <div
                  key={recommendation.id}
                  className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{recommendation.title}</div>
                    <div className="mt-1 text-xs leading-5 text-slate-500">{recommendation.summary}</div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleApplyOrgRecommendation(recommendation.id)}
                  >
                    {recommendation.actionLabel}
                  </Button>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                当前没有需要立刻重整的组织问题。
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {viewMode === "org" ? (
        <div className="w-full bg-slate-50/50 rounded-xl border border-slate-200 overflow-hidden">
          <OrgChart
            employees={employeesData}
            departments={departments}
            onAction={(action, emp) => {
              if (action === "editProfile") {
                setUpdateProfileTarget(emp.agentId);
                setUpdateProfileInitial({
                  nickname: emp.nickname,
                  role: emp.role || "",
                });
                setUpdateProfileDialogOpen(true);
                return;
              }
              if (action === "updateRole") {
                setUpdateRoleTarget(emp.agentId);
                setUpdateRoleInitial({ role: emp.role || "", description: "" });
                setUpdateRoleDialogOpen(true);
              } else if (action === "fire") {
                handleFireEmployee(emp.agentId);
              }
            }}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {employeesData.map((emp) => {
            // Define isActive here, assuming it's based on emp.status
            const isActive = emp.status === "running" || emp.status === "idle";
            const insight = insightByAgentId.get(emp.agentId);
            return (
              <Card key={emp.agentId} className={emp.status === "stopped" ? "opacity-[0.85]" : ""}>
                <CardHeader className="flex flex-row items-start justify-between bg-slate-50/50 pb-4 border-b">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4">
                      <Avatar
                        className={`h-12 w-12 border ${isActive ? "border-zinc-700 bg-zinc-800 pl-0" : "border-zinc-800 bg-zinc-900"} rounded-xl`}
                      >
                        <AvatarImage
                          src={getAvatarUrl(emp.agentId, emp.avatarJobId)}
                          className="object-cover"
                        />
                        <AvatarFallback className="bg-zinc-800 text-zinc-400 font-mono text-sm rounded-xl">
                          {emp.nickname.slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                    </div>
                    <div>
                      <CardTitle className="text-xl flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full ${emp.status === "running" ? "bg-green-500 animate-pulse" : emp.status === "idle" ? "bg-emerald-400" : "bg-slate-300"}`}
                          title={emp.status}
                        ></span>
                        {emp.nickname}
                        {emp.metaRole && (
                          <Badge
                            variant="secondary"
                            className="text-[10px] uppercase font-bold tracking-wider"
                          >
                            {emp.metaRole}
                          </Badge>
                        )}
                      </CardTitle>
                      <CardDescription className="text-sm mt-1">{emp.role}</CardDescription>
                      <div className="mt-2">
                        <Badge variant="outline" className="text-[10px] bg-white">
                          部门: {resolveDepartmentLabel({ deptId: emp.departmentId, departments })}
                        </Badge>
                      </div>
                      {insight && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <Badge
                            variant="outline"
                            className={
                              insight.loadState === "overloaded"
                                ? "border-rose-200 bg-rose-50 text-rose-700"
                                : insight.loadState === "elevated"
                                  ? "border-amber-200 bg-amber-50 text-amber-700"
                                  : insight.loadState === "balanced"
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                    : "border-slate-200 bg-slate-50 text-slate-600"
                            }
                          >
                            负载 {insight.loadScore}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={
                              insight.reliabilityState === "strong"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : insight.reliabilityState === "watch"
                                  ? "border-amber-200 bg-amber-50 text-amber-700"
                                  : "border-rose-200 bg-rose-50 text-rose-700"
                            }
                          >
                            可靠性 {insight.reliabilityScore}
                          </Badge>
                        </div>
                      )}
                      {emp.skills && emp.skills.length > 0 && (
                        <div className="flex gap-1 mt-2 flex-wrap">
                          {emp.skills.map((s: string) => (
                            <Badge key={s} variant="outline" className="text-[10px] bg-white">
                              {s}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 text-right">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={
                          emp.status === "running"
                            ? "border-primary text-primary bg-primary/10"
                            : emp.status === "idle"
                              ? "border-green-500 text-green-600 bg-green-500/10"
                              : "text-slate-500"
                        }
                      >
                        {emp.status === "running"
                          ? "执行中 (Running)"
                          : emp.status === "idle"
                            ? "空闲待命 (Idle)"
                            : "沉睡中 (Stopped)"}
                      </Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 hover:bg-slate-200"
                          >
                            <MoreVertical className="w-4 h-4 text-slate-500" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48 z-50 bg-white">
                          <DropdownMenuLabel>管理操作</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => {
                              setUpdateProfileTarget(emp.agentId);
                              setUpdateProfileInitial({
                                nickname: emp.nickname,
                                role: emp.role || "",
                              });
                              setUpdateProfileDialogOpen(true);
                            }}
                          >
                            <UserCog className="w-4 h-4 mr-2" />
                            编辑员工资料
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setUpdateRoleTarget(emp.agentId);
                              setUpdateRoleInitial({ role: emp.role || "", description: "" });
                              setUpdateRoleDialogOpen(true);
                            }}
                          >
                            <ShieldAlert className="w-4 h-4 mr-2" />
                            调整底层 Prompt
                          </DropdownMenuItem>
                          <DropdownMenuItem disabled>
                            <Cpu className="w-4 h-4 mr-2" />
                            更换大脑模型 (WIP)
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-red-600 hover:bg-red-50 hover:text-red-700 focus:text-red-700"
                            onClick={() => handleFireEmployee(emp.agentId)}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            解雇此计算节点
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    {emp.lastActive > 0 && (
                      <span className="text-[10px] text-muted-foreground uppercase mt-1">
                        最后活动: {emp.lastActive ? formatTime(emp.lastActive) : "从未"}
                      </span>
                    )}
                    {insight && (
                      <div className="max-w-[240px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] leading-5 text-slate-600">
                        {insight.focusSummary}
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="md:col-span-1 space-y-4 text-sm text-slate-600">
                      <div className="flex justify-between items-center py-2 border-b border-slate-100">
                        <span className="flex items-center gap-2">
                          <HardDrive className="w-4 h-4" /> 底层代号
                        </span>
                        <span
                          className="font-mono text-xs max-w-[120px] truncate"
                          title={emp.realName}
                        >
                          {emp.realName}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-2 border-b border-slate-100">
                        <span className="flex items-center gap-2">
                          <Database className="w-4 h-4" /> 独立进程库
                        </span>
                        <span className="font-medium">{emp.sessionCount} 卷</span>
                      </div>
                      <div className="flex justify-between items-center py-2 border-b border-slate-100">
                        <span className="flex items-center gap-2">
                          <Wifi className="w-4 h-4" /> 系统路由
                        </span>
                        <span
                          className="font-mono text-[10px] max-w-[100px] truncate text-indigo-600 bg-indigo-50 px-1 rounded"
                          title={emp.agentId}
                        >
                          {emp.agentId.split("-")[0]}...
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-2 border-b border-slate-100">
                        <span className="flex items-center gap-2">
                          <Cpu className="w-4 h-4" /> 负载 / 可靠性
                        </span>
                        <span className="font-medium">
                          {insight ? `${insight.loadScore} / ${insight.reliabilityScore}` : "--"}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-2 border-b border-slate-100">
                        <span className="flex items-center gap-2">
                          <ShieldAlert className="w-4 h-4" /> 告警 / 交接
                        </span>
                        <span className="font-medium">
                          {insight ? `${insight.overdueAlerts} / ${insight.pendingHandoffs}` : "--"}
                        </span>
                      </div>
                    </div>

                    <div className="md:col-span-2 flex flex-col h-full max-h-48 min-h-[12rem]">
                      <h4 className="text-sm font-semibold mb-3">工作区档案库 (Workspace)</h4>
                      <div className="flex-1 bg-slate-50 border rounded-lg flex flex-col overflow-hidden">
                        <div className="bg-slate-100/80 px-3 py-2 border-b text-[10px] flex items-center justify-between text-slate-500 font-mono shrink-0">
                          <span
                            className="truncate max-w-[200px]"
                            title={agentFiles[emp.agentId]?.workspace || emp.workspace}
                          >
                            {agentFiles[emp.agentId]?.workspace || emp.workspace}
                          </span>
                          <span>{agentFiles[emp.agentId]?.files?.length ?? 0} items</span>
                        </div>
                        <div className="p-1 overflow-y-auto flex-1">
                          {agentFiles[emp.agentId]?.files?.map((f: any) => (
                            <div
                              key={f.name}
                              className="flex items-center justify-between px-2 py-1.5 hover:bg-white rounded cursor-pointer group text-sm border border-transparent hover:border-slate-200 transition-all shadow-sm hover:shadow"
                              onClick={() => handleOpenFile(emp.agentId, f.name)}
                            >
                              <div className="flex items-center gap-2 overflow-hidden">
                                {f.name.endsWith(".md") || f.name.endsWith(".txt") ? (
                                  <FileText className="w-4 h-4 text-blue-500 shrink-0" />
                                ) : f.name.endsWith(".json") ? (
                                  <FileJson className="w-4 h-4 text-emerald-500 shrink-0" />
                                ) : (
                                  <FileCode className="w-4 h-4 text-slate-400 shrink-0" />
                                )}
                                <span className="truncate group-hover:text-indigo-600 transition-colors text-xs">
                                  {f.name}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 text-[10px] text-slate-400 shrink-0 font-mono">
                                <span>{formatBytes(f.size)}</span>
                                <span>{f.updatedAtMs ? formatTime(f.updatedAtMs) : ""}</span>
                              </div>
                            </div>
                          ))}
                          {(!agentFiles[emp.agentId]?.files ||
                            agentFiles[emp.agentId].files.length === 0) && (
                            <div className="text-center py-4 text-xs text-slate-400">
                              正在索引工作区节点...
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="md:col-span-1 flex flex-col justify-end gap-3 border-l pl-6">
                      <span className="text-xs text-muted-foreground text-center">
                        指令及沟通面板
                      </span>
                      <Button
                        variant="default"
                        className="w-full bg-indigo-600 hover:bg-indigo-700"
                        onClick={() => navigate(`/chat/${emp.agentId}`)}
                        disabled={emp.status === "stopped"}
                      >
                        <MessageSquare className="w-4 h-4 mr-2" />
                        安全直连会话
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full"
                        disabled={emp.status === "stopped"}
                      >
                        <Play className="w-4 h-4 mr-2" />
                        挂载新任务表
                      </Button>
                      <Button
                        variant="ghost"
                        className="w-full text-slate-500 hover:bg-slate-200"
                        onClick={() => navigate(`/employees/${emp.agentId}`)}
                      >
                        <Settings className="w-4 h-4 mr-2" />
                        参数微调
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {employeesData.length === 0 && (
        <div className="text-center py-20 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
          <h3 className="text-lg font-medium text-slate-600">当前没有可调遣的员工</h3>
          <p className="text-sm text-slate-400 mt-2">点击右上方招募新员工以丰富公司架构体。</p>
        </div>
      )}

      {editingFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl flex flex-col overflow-hidden max-h-[90vh]">
            <div className="px-4 py-3 border-b flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-500" />
                <h3 className="font-semibold text-slate-800">{editingFile.name}</h3>
                <span className="text-xs text-slate-400 ml-2">({editingFile.agentId})</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-slate-500"
                onClick={() => setEditingFile(null)}
              >
                关闭
              </Button>
            </div>
            <div className="flex-1 p-0 overflow-hidden relative min-h-[400px]">
              {!editingFile.loaded ? (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-50 text-slate-500 text-sm">
                  读取文件中...
                </div>
              ) : (
                <textarea
                  className="w-full h-full absolute inset-0 p-4 font-mono text-sm resize-none focus:outline-none bg-slate-950 text-slate-300"
                  value={editingFile.content}
                  onChange={(e) => setEditingFile({ ...editingFile, content: e.target.value })}
                  spellCheck={false}
                />
              )}
            </div>
            <div className="px-4 py-3 border-t flex items-center justify-between bg-slate-50">
              <span className="text-xs text-slate-500 font-mono">
                {editingFile.loaded ? `${editingFile.content.length} characters` : ""}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setEditingFile(null)}>
                  取消
                </Button>
                <Button
                  disabled={!editingFile.loaded || editingFile.saving}
                  onClick={handleSaveFile}
                >
                  {editingFile.saving ? "保存中..." : "保存更改"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ImmersiveHireDialog
        open={hireDialogOpen}
        onOpenChange={setHireDialogOpen}
        onSubmit={handleHireEmployee}
        busy={hireSubmitting}
      />

      <ActionFormDialog
        open={updateProfileDialogOpen}
        onOpenChange={setUpdateProfileDialogOpen}
        title="编辑员工基本资料"
        description={
          updateProfileEmployee?.isMeta
            ? "修改花名和头衔；可选同步更新 Identity Name（Gateway 名称）。注意：meta 节点修改 Identity Name 可能影响系统自动识别。"
            : "修改花名和头衔；默认会把花名同步到 Identity Name（Gateway 名称），让会话/列表显示保持一致。"
        }
        confirmLabel="保存更新"
        busy={profileSubmitting}
        fields={[
          {
            name: "nickname",
            label: "展示花名",
            defaultValue: updateProfileInitial.nickname,
          },
          {
            name: "role",
            label: "展示头衔",
            defaultValue: updateProfileInitial.role,
          },
          {
            name: "syncIdentityName",
            label: "同步更新 Identity Name（Gateway 名称）",
            type: "checkbox",
            defaultValue: updateProfileEmployee?.isMeta ? "false" : "true",
          },
        ]}
        onSubmit={handleUpdateProfile}
      />

      <ActionFormDialog
        open={updateRoleDialogOpen}
        onOpenChange={setUpdateRoleDialogOpen}
        title="调整计算节点职务"
        description="系统将联系 HR 下发结构变动与系统提示词修改命令。"
        confirmLabel="确认调岗"
        busy={updateRoleSubmitting}
        fields={[
          {
            name: "role",
            label: "岗位名称",
            defaultValue: updateRoleInitial?.role || "",
            required: true,
            placeholder: "例如：高级架构师",
          },
          {
            name: "description",
            label: "岗位补充说明",
            defaultValue: updateRoleInitial?.description || "",
            required: true,
            multiline: true,
            placeholder: "输入新的职责描述",
          },
        ]}
        onSubmit={handleUpdateRoleSubmit}
      />

      <ActionFormDialog
        open={fireEmployeeDialogOpen}
        onOpenChange={setFireEmployeeDialogOpen}
        title="确认解约"
        description="此操作将从公司图谱中彻底除名该数字生物，且无法恢复参数。"
        confirmLabel="确认解约"
        fields={[]}
        onSubmit={onFireEmployeeSubmit}
      />

      <DepartmentManagerDialog
        open={departmentsDialogOpen}
        onOpenChange={setDepartmentsDialogOpen}
        departments={departments}
        employees={activeCompany.employees}
        busy={departmentsSaving}
        onSubmit={handleSaveDepartments}
      />

      <HrDepartmentPlanDialog
        open={hrPlanDialogOpen}
        onOpenChange={setHrPlanDialogOpen}
        state={hrPlanDialogState}
        canApply={canApplyHrPlan}
        busy={applyingHrPlan}
        onApply={handleApplyHrPlan}
      />
    </div>
  );
}
