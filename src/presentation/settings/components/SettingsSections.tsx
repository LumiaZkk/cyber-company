import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Key,
  MessageCircle,
  Plus,
  RefreshCw,
  Server,
  Settings2,
} from "lucide-react";
import type {
  GatewayConfigSnapshot,
  GatewayDoctorBaseline,
  GatewayProviderConfig,
  GatewaySettingsCommandsResult,
  GatewaySettingsQueryResult,
  GatewayTelegramConfig,
} from "../../../application/gateway/settings";
import { buildCollaborationContextSnapshot } from "../../../application/company/collaboration-context";
import { buildDefaultOrgSettings } from "../../../domain/org/autonomy-policy";
import type {
  CollaborationEdge,
  CompanyCollaborationPolicy,
  Department,
  EmployeeRef,
} from "../../../domain/org/types";
import { ActionFormDialog } from "../../../components/ui/action-form-dialog";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";
import { formatTime } from "../../../lib/utils";
import { ConnectionDiagnosisSummary } from "../../shared/ConnectionDiagnosisSummary";

export function stringifyPreview(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

type RunCommand = (
  command: () => Promise<{ title: string; description: string } | null>,
  fallbackError: string,
) => Promise<{ title: string; description: string } | null>;

type EndpointKind = "department" | "agent";

function doctorToneClass(state: "ready" | "degraded" | "blocked") {
  if (state === "ready") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (state === "blocked") {
    return "border-red-200 bg-red-50 text-red-700";
  }
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function formatEmployeeLabel(employee: EmployeeRef) {
  return `${employee.nickname} (${employee.role})`;
}

function formatDepartmentLabel(
  department: Department,
  employeesById: Map<string, EmployeeRef>,
) {
  const lead = employeesById.get(department.leadAgentId);
  return `${department.name}${lead ? ` · ${lead.nickname}` : ""}`;
}

function describeCollaborationEdge(
  edge: CollaborationEdge,
  employeesById: Map<string, EmployeeRef>,
  departmentsById: Map<string, Department>,
) {
  const from =
    (edge.fromAgentId && employeesById.get(edge.fromAgentId)
      ? formatEmployeeLabel(employeesById.get(edge.fromAgentId)!)
      : null) ??
    (edge.fromDepartmentId && departmentsById.get(edge.fromDepartmentId)
      ? formatDepartmentLabel(departmentsById.get(edge.fromDepartmentId)!, employeesById)
      : null) ??
    edge.fromAgentId ??
    edge.fromDepartmentId ??
    "未知来源";
  const to =
    (edge.toAgentId && employeesById.get(edge.toAgentId)
      ? formatEmployeeLabel(employeesById.get(edge.toAgentId)!)
      : null) ??
    (edge.toDepartmentId && departmentsById.get(edge.toDepartmentId)
      ? formatDepartmentLabel(departmentsById.get(edge.toDepartmentId)!, employeesById)
      : null) ??
    edge.toAgentId ??
    edge.toDepartmentId ??
    "未知目标";
  const fromKind = edge.fromDepartmentId ? "部门" : "员工";
  const toKind = edge.toDepartmentId ? "部门" : "员工";
  return `${fromKind} ${from} -> ${toKind} ${to}`;
}

function isSameEdge(left: CollaborationEdge, right: CollaborationEdge) {
  return (
    left.fromAgentId === right.fromAgentId &&
    left.fromDepartmentId === right.fromDepartmentId &&
    left.toAgentId === right.toAgentId &&
    left.toDepartmentId === right.toDepartmentId
  );
}

function createCollaborationEdgeDraft(
  fromKind: EndpointKind,
  fromId: string,
  toKind: EndpointKind,
  toId: string,
): CollaborationEdge {
  return {
    ...(fromKind === "agent" ? { fromAgentId: fromId } : { fromDepartmentId: fromId }),
    ...(toKind === "agent" ? { toAgentId: toId } : { toDepartmentId: toId }),
  };
}

function CollaborationPolicyToggle(props: {
  label: string;
  active: boolean;
  disabled: boolean;
  onToggle: (next: boolean) => void;
}) {
  const { label, active, disabled, onToggle } = props;
  return (
    <button
      type="button"
      className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
        active
          ? "border-emerald-300 bg-emerald-50 text-emerald-800"
          : "border-slate-200 bg-white text-slate-600"
      } ${disabled ? "cursor-not-allowed opacity-60" : "hover:border-indigo-300 hover:bg-indigo-50/60"}`}
      onClick={() => onToggle(!active)}
      disabled={disabled}
    >
      <div className="font-medium">{label}</div>
      <div className="mt-1 text-[11px]">{active ? "已启用" : "已关闭"}</div>
    </button>
  );
}

export function SettingsHeader(props: {
  connected: boolean;
  loading: boolean;
  refreshRuntime: () => Promise<unknown>;
  runCommand: RunCommand;
}) {
  const { connected, loading, refreshRuntime, runCommand } = props;
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">全局设置</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          统一化管理安全网关、算力配置、接入渠道与运营实体
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Badge
          variant="outline"
          className={connected ? "text-green-700 bg-green-50 border-green-300" : "text-slate-500"}
        >
          {connected ? "Gateway 已连接" : "Gateway 未连接"}
        </Badge>
        <Button
          variant="outline"
          onClick={() =>
            void runCommand(
              async () => {
                await refreshRuntime();
                return {
                  title: "运行时已刷新",
                  description: "已获取最新编排、渠道和技能状态。",
                };
              },
              "刷新运行时失败",
            )
          }
          disabled={loading}
        >
          获取最新编排
        </Button>
      </div>
    </div>
  );
}

export function SettingsDoctorSection(props: {
  doctorBaseline: GatewayDoctorBaseline;
}) {
  const { doctorBaseline } = props;

  return (
    <Card className="shadow-sm border-slate-200">
      <CardHeader className="pb-3 border-b bg-slate-50/70">
        <CardTitle className="flex items-center justify-between gap-3 text-lg">
          <div className="flex items-center gap-2">
            <Server className="w-5 h-5 text-slate-500" />
            V1 稳定性 Doctor 基线
          </div>
          <Badge variant="outline" className={doctorToneClass(doctorBaseline.overallState)}>
            {doctorBaseline.overallState}
          </Badge>
        </CardTitle>
        <CardDescription>
          先分清 Gateway / Authority / Executor / Runtime 四层状态，再决定该修哪里。
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        <ConnectionDiagnosisSummary
          variant="steady"
          state={doctorBaseline.overallState}
          title="连接成功后，从这里看稳态诊断"
          summary="Settings Doctor 负责解释 Authority 控制面的当前健康度、写入边界和固定回归清单。首次接入流程仍然留在 Connect。"
          detail={
            doctorBaseline.lastError
              ? `最近同步错误：${doctorBaseline.lastError}`
              : `运行模式 ${doctorBaseline.mode}，已切到 command 的链路：${doctorBaseline.commandRoutes.join(", ")}`
          }
          layers={doctorBaseline.layers.map((layer) => ({
            id: layer.id,
            label: layer.label,
            state: layer.state,
            summary: layer.summary,
          }))}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {doctorBaseline.layers.map((layer) => (
            <div key={layer.id} className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-900">{layer.label}</div>
                <Badge variant="outline" className={doctorToneClass(layer.state)}>
                  {layer.state}
                </Badge>
              </div>
              <div className="text-xs text-slate-700">{layer.summary}</div>
              <div className="text-[11px] text-slate-500 break-all">{layer.detail}</div>
              {layer.timestamp ? (
                <div className="text-[11px] text-slate-400">最近时间：{formatTime(layer.timestamp)}</div>
              ) : null}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-sm font-semibold text-slate-900">当前写入边界</div>
            <div className="mt-2 text-xs text-slate-600">
              运行模式：<span className="font-mono">{doctorBaseline.mode}</span>
            </div>
            <div className="mt-1 text-xs text-slate-600">
              `/runtime` 兼容路径：{doctorBaseline.compatibilityPathEnabled ? "仍开启" : "已关闭"}
            </div>
            <div className="mt-1 text-xs text-slate-600">
              已切到 command 的链路：{doctorBaseline.commandRoutes.join(", ")}
            </div>
            {doctorBaseline.lastError ? (
              <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800">
                最近同步错误：{doctorBaseline.lastError}
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-sm font-semibold text-slate-900">固定回归清单</div>
            <div className="mt-2 space-y-1">
              {doctorBaseline.validationChecklist.map((item) => (
                <div key={item} className="text-xs text-slate-600">
                  - {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function SettingsGatewayCompanySection(props: {
  token: string | null;
  connected: boolean;
  companyConfig: {
    companies: Array<{ id: string; icon?: string; name: string }>;
    activeCompanyId?: string | null;
  } | null;
  activeCompany: GatewaySettingsQueryResult["activeCompany"];
  loading: boolean;
  companyCount: number;
  orgAutopilotEnabled: boolean;
  orgAutopilotSaving: boolean;
  collaborationPolicySaving: boolean;
  switchCompany: (id: string) => void;
  loadConfig: () => Promise<unknown>;
  reconnectGateway: () => void;
  disconnectGateway: () => void;
  handleToggleOrgAutopilot: () => Promise<{ title: string; description: string } | null>;
  handleUpdateCollaborationPolicy: (
    collaborationPolicy: CompanyCollaborationPolicy,
  ) => Promise<{ title: string; description: string } | null>;
  runCommand: RunCommand;
}) {
  const {
    token,
    connected,
    companyConfig,
    activeCompany,
    loading,
    companyCount,
    orgAutopilotEnabled,
    orgAutopilotSaving,
    collaborationPolicySaving,
    switchCompany,
    loadConfig,
    reconnectGateway,
    disconnectGateway,
    handleToggleOrgAutopilot,
    handleUpdateCollaborationPolicy,
    runCommand,
  } = props;

  const orgSettings = useMemo(
    () => (activeCompany ? buildDefaultOrgSettings(activeCompany.orgSettings) : null),
    [activeCompany],
  );
  const collaborationPolicy = orgSettings?.collaborationPolicy ?? null;
  const employeeOptions = useMemo(
    () =>
      (activeCompany?.employees ?? [])
        .slice()
        .sort((left, right) => left.nickname.localeCompare(right.nickname, "zh-CN")),
    [activeCompany],
  );
  const departmentOptions = useMemo(
    () =>
      (activeCompany?.departments ?? [])
        .filter((department) => !department.archived)
        .slice()
        .sort((left, right) => (left.order ?? 0) - (right.order ?? 0)),
    [activeCompany],
  );
  const employeesById = useMemo(
    () => new Map(employeeOptions.map((employee) => [employee.agentId, employee] as const)),
    [employeeOptions],
  );
  const departmentsById = useMemo(
    () => new Map(departmentOptions.map((department) => [department.id, department] as const)),
    [departmentOptions],
  );
  const [previewAgentId, setPreviewAgentId] = useState("");
  const [edgeFromKind, setEdgeFromKind] = useState<EndpointKind>("department");
  const [edgeFromId, setEdgeFromId] = useState("");
  const [edgeToKind, setEdgeToKind] = useState<EndpointKind>("department");
  const [edgeToId, setEdgeToId] = useState("");

  useEffect(() => {
    if (!employeeOptions.some((employee) => employee.agentId === previewAgentId)) {
      setPreviewAgentId(employeeOptions[0]?.agentId ?? "");
    }
  }, [employeeOptions, previewAgentId]);

  useEffect(() => {
    const options = edgeFromKind === "agent" ? employeeOptions : departmentOptions;
    const optionIds = new Set(
      options.map((option) => ("agentId" in option ? option.agentId : option.id)),
    );
    if (!optionIds.has(edgeFromId)) {
      setEdgeFromId(
        edgeFromKind === "agent"
          ? employeeOptions[0]?.agentId ?? ""
          : departmentOptions[0]?.id ?? "",
      );
    }
  }, [departmentOptions, edgeFromId, edgeFromKind, employeeOptions]);

  useEffect(() => {
    const options = edgeToKind === "agent" ? employeeOptions : departmentOptions;
    const optionIds = new Set(
      options.map((option) => ("agentId" in option ? option.agentId : option.id)),
    );
    if (!optionIds.has(edgeToId)) {
      setEdgeToId(
        edgeToKind === "agent"
          ? employeeOptions[0]?.agentId ?? ""
          : departmentOptions[0]?.id ?? "",
      );
    }
  }, [departmentOptions, edgeToId, edgeToKind, employeeOptions]);

  const previewScope = useMemo(() => {
    if (!activeCompany || !previewAgentId) {
      return null;
    }
    return buildCollaborationContextSnapshot({
      company: activeCompany,
      agentId: previewAgentId,
    });
  }, [activeCompany, previewAgentId]);

  const updatePolicy = (nextPolicy: CompanyCollaborationPolicy) =>
    runCommand(
      () => handleUpdateCollaborationPolicy(nextPolicy),
      "协作策略更新失败",
    );

  const explicitEdges = collaborationPolicy?.explicitEdges ?? [];

  const addExplicitEdge = async () => {
    if (!collaborationPolicy || !edgeFromId || !edgeToId) {
      return null;
    }
    const nextEdge = createCollaborationEdgeDraft(edgeFromKind, edgeFromId, edgeToKind, edgeToId);
    if (explicitEdges.some((edge) => isSameEdge(edge, nextEdge))) {
      return {
        title: "协作边未变化",
        description: "这条显式协作边已经存在。",
      };
    }
    return updatePolicy({
      ...collaborationPolicy,
      explicitEdges: [...explicitEdges, nextEdge],
    });
  };

  const removeExplicitEdge = async (edge: CollaborationEdge) => {
    if (!collaborationPolicy) {
      return null;
    }
    return updatePolicy({
      ...collaborationPolicy,
      explicitEdges: explicitEdges.filter((current) => !isSameEdge(current, edge)),
    });
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Server className="w-5 h-5 text-slate-500" />
            系统核心网关
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm bg-slate-50 p-3 rounded-lg border">
            <div className="text-slate-500 mb-1 text-xs font-bold tracking-wider">
              服务器通信端点
            </div>
            <div className="font-mono text-slate-400">****** (内部路由已屏蔽)</div>
            <div className="mt-2 text-slate-500 mb-1 text-xs font-bold tracking-wider">
              网关安全凭证
            </div>
            <div>{token ? "******** (签名已准入)" : "未挂载鉴权"}</div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => reconnectGateway()}
              disabled={loading || connected}
            >
              重连
            </Button>
            <Button
              variant="outline"
              className="w-full text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={() => disconnectGateway()}
              disabled={loading || !connected}
            >
              断开
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Settings2 className="w-5 h-5 text-slate-500" />
            业务线运营实体
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-slate-600 bg-slate-50 p-3 rounded-lg border">
            当前挂载了 <strong>{companyCount}</strong> 家注册公司。
            <br />
            运营视口聚焦于：
            <strong className="text-indigo-600">{activeCompany?.name ?? "无"}</strong>
          </div>
          <div className="grid grid-cols-1 gap-2 max-h-32 overflow-y-auto pr-2">
            {companyConfig?.companies.map((company) => (
              <button
                key={company.id}
                className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm ${company.id === companyConfig.activeCompanyId ? "border-indigo-500 bg-indigo-50/50 ring-1 ring-indigo-500" : "hover:bg-slate-50"}`}
                onClick={() => switchCompany(company.id)}
              >
                <span className="font-medium">
                  {company.icon} {company.name}
                </span>
                {company.id === companyConfig.activeCompanyId && (
                  <Badge className="scale-75 bg-indigo-500 text-white">Active</Badge>
                )}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => void loadConfig()}
            disabled={loading}
          >
            拉取注册表并校准当前参数
          </Button>
          {activeCompany && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">组织自校准</div>
                  <div className="mt-1 text-xs leading-5 text-slate-600">
                    开启后，系统会自动识别小团队直管、大团队设负责人的组织问题，并直接重整汇报链。
                  </div>
                  {activeCompany.orgSettings?.lastAutoCalibratedAt && (
                    <div className="mt-2 text-[11px] leading-5 text-slate-500">
                      最近一次自动校准：
                      {formatTime(activeCompany.orgSettings.lastAutoCalibratedAt)}
                      {activeCompany.orgSettings.lastAutoCalibrationActions?.length
                        ? ` · ${activeCompany.orgSettings.lastAutoCalibrationActions.join(" · ")}`
                        : ""}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={
                      orgAutopilotEnabled
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-slate-200 bg-white text-slate-500"
                    }
                  >
                    {orgAutopilotEnabled ? "已开启" : "已关闭"}
                  </Badge>
                  <Button
                    variant={orgAutopilotEnabled ? "outline" : "default"}
                    onClick={() =>
                      void runCommand(handleToggleOrgAutopilot, "组织自校准更新失败")
                    }
                    disabled={orgAutopilotSaving}
                  >
                    {orgAutopilotSaving
                      ? "保存中..."
                      : orgAutopilotEnabled
                        ? "关闭自动调整"
                        : "开启自动调整"}
                  </Button>
                </div>
              </div>
            </div>
          )}
          {activeCompany && collaborationPolicy && (
            <div className="rounded-xl border border-sky-200 bg-sky-50/40 p-4 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">协作策略</div>
                  <div className="mt-1 text-xs leading-5 text-slate-600">
                    维护谁可以正式使用 <span className="font-mono">company_dispatch</span> 协作，以及默认汇报链与显式跨部门边。
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={
                    collaborationPolicySaving
                      ? "border-amber-200 bg-amber-50 text-amber-700"
                      : "border-sky-200 bg-white text-sky-700"
                  }
                >
                  {collaborationPolicySaving ? "保存中" : "中心规则"}
                </Badge>
              </div>

              <div className="grid grid-cols-1 gap-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  默认规则
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <CollaborationPolicyToggle
                    label="CEO / HR 全局协作"
                    active={collaborationPolicy.globalDispatchMetaRoles?.includes("ceo") ?? false}
                    disabled={collaborationPolicySaving}
                    onToggle={(next) =>
                      void updatePolicy({
                        ...collaborationPolicy,
                        globalDispatchMetaRoles: next ? ["ceo", "hr"] : [],
                      })
                    }
                  />
                  <CollaborationPolicyToggle
                    label="负责人可派本部门成员"
                    active={collaborationPolicy.allowDepartmentLeadToDispatchWithinDepartment ?? false}
                    disabled={collaborationPolicySaving}
                    onToggle={(next) =>
                      void updatePolicy({
                        ...collaborationPolicy,
                        allowDepartmentLeadToDispatchWithinDepartment: next,
                      })
                    }
                  />
                  <CollaborationPolicyToggle
                    label="负责人可联系支持负责人"
                    active={collaborationPolicy.allowDepartmentLeadToDispatchToSupportLeads ?? false}
                    disabled={collaborationPolicySaving}
                    onToggle={(next) =>
                      void updatePolicy({
                        ...collaborationPolicy,
                        allowDepartmentLeadToDispatchToSupportLeads: next,
                      })
                    }
                  />
                  <CollaborationPolicyToggle
                    label="负责人可直接联系 CEO"
                    active={collaborationPolicy.allowDepartmentLeadToDispatchToCeo ?? false}
                    disabled={collaborationPolicySaving}
                    onToggle={(next) =>
                      void updatePolicy({
                        ...collaborationPolicy,
                        allowDepartmentLeadToDispatchToCeo: next,
                      })
                    }
                  />
                  <CollaborationPolicyToggle
                    label="员工可派同部门同事"
                    active={collaborationPolicy.allowDepartmentMembersWithinDepartment ?? false}
                    disabled={collaborationPolicySaving}
                    onToggle={(next) =>
                      void updatePolicy({
                        ...collaborationPolicy,
                        allowDepartmentMembersWithinDepartment: next,
                      })
                    }
                  />
                  <CollaborationPolicyToggle
                    label="员工可向直属经理派单"
                    active={collaborationPolicy.allowDepartmentMembersToManager ?? false}
                    disabled={collaborationPolicySaving}
                    onToggle={(next) =>
                      void updatePolicy({
                        ...collaborationPolicy,
                        allowDepartmentMembersToManager: next,
                      })
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  显式协作边
                </div>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-[auto,1fr,auto,1fr,auto]">
                  <select
                    value={edgeFromKind}
                    onChange={(event) => setEdgeFromKind(event.target.value as EndpointKind)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    <option value="department">来源部门</option>
                    <option value="agent">来源员工</option>
                  </select>
                  <select
                    value={edgeFromId}
                    onChange={(event) => setEdgeFromId(event.target.value)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    {(edgeFromKind === "agent" ? employeeOptions : departmentOptions).map((option) => (
                      <option
                        key={"agentId" in option ? option.agentId : option.id}
                        value={"agentId" in option ? option.agentId : option.id}
                      >
                        {"agentId" in option
                          ? formatEmployeeLabel(option)
                          : formatDepartmentLabel(option, employeesById)}
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center justify-center text-xs font-semibold text-slate-500">
                    可以正式协作给
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <select
                      value={edgeToKind}
                      onChange={(event) => setEdgeToKind(event.target.value as EndpointKind)}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                    >
                      <option value="department">目标部门</option>
                      <option value="agent">目标员工</option>
                    </select>
                    <select
                      value={edgeToId}
                      onChange={(event) => setEdgeToId(event.target.value)}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                    >
                      {(edgeToKind === "agent" ? employeeOptions : departmentOptions).map((option) => (
                        <option
                          key={"agentId" in option ? option.agentId : option.id}
                          value={"agentId" in option ? option.agentId : option.id}
                        >
                          {"agentId" in option
                            ? formatEmployeeLabel(option)
                            : formatDepartmentLabel(option, employeesById)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => void addExplicitEdge()}
                    disabled={collaborationPolicySaving || !edgeFromId || !edgeToId}
                  >
                    添加
                  </Button>
                </div>
                <div className="space-y-2">
                  {explicitEdges.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-4 text-sm text-slate-500">
                      当前没有显式跨默认规则的协作边。新员工会先按默认部门规则自动获得通信范围。
                    </div>
                  ) : (
                    explicitEdges.map((edge, index) => (
                      <div
                        key={`${edge.fromAgentId ?? edge.fromDepartmentId ?? "?"}:${edge.toAgentId ?? edge.toDepartmentId ?? "?"}:${index}`}
                        className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2"
                      >
                        <div className="text-sm text-slate-700">
                          {describeCollaborationEdge(edge, employeesById, departmentsById)}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:bg-red-50 hover:text-red-700"
                          onClick={() => void removeExplicitEdge(edge)}
                          disabled={collaborationPolicySaving}
                        >
                          删除
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">作用域预览</div>
                    <div className="mt-1 text-xs text-slate-500">
                      选择任意员工，查看当前协作策略实际展开后的可派单对象和汇报链。
                    </div>
                  </div>
                  <select
                    value={previewAgentId}
                    onChange={(event) => setPreviewAgentId(event.target.value)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    {employeeOptions.map((employee) => (
                      <option key={employee.agentId} value={employee.agentId}>
                        {formatEmployeeLabel(employee)}
                      </option>
                    ))}
                  </select>
                </div>
                {previewScope && (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Allowed Dispatch Targets
                      </div>
                      <div className="mt-2 space-y-1 text-sm text-slate-700">
                        {previewScope.allowedDispatchTargets.map((target) => (
                          <div key={target.agentId}>
                            {target.nickname} · {target.reason}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Default Report Chain
                      </div>
                      <div className="mt-2 space-y-1 text-sm text-slate-700">
                        {previewScope.defaultReportChain.length === 0 ? (
                          <div>当前没有上级链路</div>
                        ) : (
                          previewScope.defaultReportChain.map((actor) => (
                            <div key={actor.agentId}>{actor.nickname}</div>
                          ))
                        )}
                      </div>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Support Targets
                      </div>
                      <div className="mt-2 space-y-1 text-sm text-slate-700">
                        {previewScope.supportTargets.map((target) => (
                          <div key={target.agentId}>{target.nickname}</div>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Escalation Targets
                      </div>
                      <div className="mt-2 space-y-1 text-sm text-slate-700">
                        {previewScope.escalationTargets.map((target) => (
                          <div key={target.agentId}>{target.nickname}</div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function SettingsProvidersChannelsSection(props: {
  executorStatus: GatewaySettingsQueryResult["executorStatus"];
  executorConfig: GatewaySettingsQueryResult["executorConfig"];
  configSnapshot: GatewayConfigSnapshot | null;
  codexModels: GatewaySettingsQueryResult["codexModels"];
  providerConfigs: Record<string, GatewayProviderConfig>;
  telegramConfig: GatewayTelegramConfig;
  loading: boolean;
  executorSaving: boolean;
  codexAuthorizing: boolean;
  codexImporting: boolean;
  codexRefreshing: boolean;
  addProviderSaving: boolean;
  syncingProvider: string | null;
  setExecutorDialogOpen: (open: boolean) => void;
  setAddProviderDialogOpen: (open: boolean) => void;
  setTelegramDialogOpen: (open: boolean) => void;
  updateProviderKey: (provider: string) => void;
  handleExecutorReconnect: GatewaySettingsCommandsResult["handleExecutorReconnect"];
  handleStartCodexOAuth: GatewaySettingsCommandsResult["handleStartCodexOAuth"];
  handleImportCodexAuth: GatewaySettingsCommandsResult["handleImportCodexAuth"];
  handleRefreshCodexModels: GatewaySettingsCommandsResult["handleRefreshCodexModels"];
  handleSyncModels: (
    providerName: string,
    config: GatewayProviderConfig,
  ) => Promise<{ title: string; description: string } | null>;
  runCommand: RunCommand;
}) {
  const {
    executorStatus,
    executorConfig,
    configSnapshot,
    codexModels,
    providerConfigs,
    telegramConfig,
    loading,
    executorSaving,
    codexAuthorizing,
    codexImporting,
    codexRefreshing,
    syncingProvider,
    setExecutorDialogOpen,
    setAddProviderDialogOpen,
    setTelegramDialogOpen,
    updateProviderKey,
    handleExecutorReconnect,
    handleStartCodexOAuth,
    handleImportCodexAuth,
    handleRefreshCodexModels,
    handleSyncModels,
    runCommand,
  } = props;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card className="shadow-sm border-indigo-100 flex flex-col">
        <CardHeader className="bg-indigo-50/30 pb-4 border-b">
          <CardTitle className="flex items-center justify-between text-lg text-indigo-900 w-full">
            <div className="flex items-center gap-2">
              <Key className="w-5 h-5 text-indigo-600" />
              计算引擎资源栈
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1 text-indigo-700 bg-white"
              onClick={() => setAddProviderDialogOpen(true)}
            >
              <Plus className="w-4 h-4" /> 添加供应商
            </Button>
          </CardTitle>
          <CardDescription>按需调集各类大语言模型，并配发 API 执行令牌</CardDescription>
        </CardHeader>
        <CardContent className="pt-4 space-y-3 flex-1 overflow-y-auto max-h-80">
          <div className="p-3 rounded-xl border border-indigo-100 bg-white shadow-sm space-y-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-[200px] flex-1">
                <div className="font-semibold text-sm flex items-center gap-2">
                  Authority 执行后端
                  <Badge
                    variant="outline"
                    className={
                      executorStatus?.state === "ready"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : executorStatus?.state === "blocked"
                          ? "border-red-200 bg-red-50 text-red-700"
                          : "border-amber-200 bg-amber-50 text-amber-700"
                    }
                  >
                    {executorStatus?.state ?? "unknown"}
                  </Badge>
                </div>
                <div className="mt-1 text-xs text-slate-600">
                  下游类型：{executorConfig?.type ?? "openclaw"} · 地址：{executorConfig?.openclaw.url ?? "--"}
                </div>
                <div className="mt-1 text-[11px] text-slate-500">
                  Token: {executorConfig?.openclaw.tokenConfigured ? "******(已配置)" : "未配置"}
                  {executorConfig?.lastConnectedAt
                    ? ` · 最近接通 ${formatTime(executorConfig.lastConnectedAt)}`
                    : ""}
                </div>
                <div className="mt-1 text-[11px] text-slate-500">
                  {executorStatus?.note || executorConfig?.lastError || "Authority 将浏览器请求统一代理到下游 OpenClaw。"}
                </div>
                {executorConfig?.lastError ? (
                  <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800">
                    最近错误：{executorConfig.lastError}
                  </div>
                ) : null}
              </div>
              <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-8 text-xs bg-white text-indigo-700 border border-indigo-200 hover:bg-indigo-50"
                  onClick={() => setExecutorDialogOpen(true)}
                >
                  修改后端
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-8 text-xs bg-indigo-600 text-white hover:bg-indigo-700"
                  onClick={() =>
                    void runCommand(handleExecutorReconnect, "执行后端重连失败")
                  }
                  disabled={executorSaving || loading}
                >
                  {executorSaving ? "重连中..." : "立即重连"}
                </Button>
              </div>
            </div>
          </div>

          {!configSnapshot?.config ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
              当前还没有可用的下游配置快照。请先确保 Authority 已成功连接 OpenClaw，然后刷新运行时。
            </div>
          ) : null}

          <div className="p-3 rounded-xl border border-sky-100 bg-sky-50/60 shadow-sm space-y-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-[200px] flex-1">
                <div className="font-semibold text-sm flex items-center gap-2">
                  OpenAI Codex (OAuth)
                  <Badge className="bg-sky-600 text-white">推荐</Badge>
                  {codexModels.length > 0 && (
                    <span className="text-[10px] font-normal text-sky-600 bg-white px-1.5 py-0.5 rounded-full border border-sky-100">
                      {codexModels.length} Models
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-600 mt-1">
                  支持直接授权回调，也支持从当前网关主机的 <span className="font-mono">~/.codex/auth.json</span> 一键同步授权，无需手填 API Key。
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  {codexModels.length > 0
                    ? `已发现 ${codexModels.length} 个可用 Codex 模型，可直接供员工编排使用。`
                    : "尚未发现可用 Codex 模型；完成直接授权或本地同步后会自动刷新模型目录。"}
                </div>
                <div className="text-[11px] text-amber-700 mt-1">
                  这里导入的是 OpenClaw 内部可调用的 Codex 模型，不是独立的 Codex Agent 后端。
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-8 text-xs bg-white text-sky-700 border border-sky-200 hover:bg-sky-100"
                  onClick={() =>
                    void runCommand(handleStartCodexOAuth, "Codex 授权启动失败")
                  }
                  disabled={codexAuthorizing || codexImporting || codexRefreshing || loading}
                >
                  {codexAuthorizing ? "跳转中..." : "直接授权登录"}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-8 text-xs bg-sky-600 text-white hover:bg-sky-700"
                  onClick={() =>
                    void runCommand(handleImportCodexAuth, "Codex 授权同步失败")
                  }
                  disabled={codexAuthorizing || codexImporting || codexRefreshing || loading}
                >
                  {codexImporting ? "同步中..." : "同步本地 Codex 授权"}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-8 w-8 px-0 bg-white text-slate-600 hover:text-sky-600 hover:bg-sky-100"
                  disabled={codexAuthorizing || codexImporting || codexRefreshing || loading}
                  onClick={() =>
                    void runCommand(handleRefreshCodexModels, "Codex 模型刷新失败")
                  }
                  title="刷新 Codex 可用模型列表"
                >
                  <RefreshCw
                    className={`w-4 h-4 ${codexRefreshing ? "animate-spin text-sky-600" : ""}`}
                  />
                </Button>
              </div>
            </div>
            {codexModels.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {codexModels.slice(0, 6).map((model) => (
                  <Badge key={`${model.provider}/${model.id}`} variant="outline" className="bg-white">
                    {model.name || model.id}
                  </Badge>
                ))}
                {codexModels.length > 6 && (
                  <Badge variant="outline" className="bg-white text-slate-500">
                    +{codexModels.length - 6}
                  </Badge>
                )}
              </div>
            )}
          </div>
          {configSnapshot?.config ? Object.entries(providerConfigs).map(([providerName, pConfig]) => (
            <div
              key={providerName}
              className="flex items-center justify-between p-3 rounded-xl border bg-white shadow-sm flex-wrap gap-2"
            >
              <div className="flex-1 min-w-[120px]">
                <div className="font-semibold text-sm capitalize flex items-center gap-2">
                  {providerName.split("-")[0]}
                  {Array.isArray(pConfig.models) && (
                    <span className="text-[10px] font-normal text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded-full">
                      {pConfig.models.length} Models
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-500 mt-0.5 truncate max-w-[180px]">
                  鉴权: {pConfig.apiKey ? "******(已登记)" : "尚未配置"}
                </div>
                {pConfig.baseUrl && (
                  <div
                    className="text-[10px] text-slate-400 mt-0.5 truncate max-w-[180px]"
                    title={pConfig.baseUrl}
                  >
                    URL: {pConfig.baseUrl}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-8 w-8 px-0 bg-slate-50 text-slate-600 hover:text-indigo-600 hover:bg-slate-100"
                  disabled={syncingProvider === providerName}
                  onClick={() =>
                    void runCommand(
                      () => handleSyncModels(providerName, pConfig),
                      `${providerName} 模型同步失败`,
                    )
                  }
                  title="通过 API 同步平台最新模型列表"
                >
                  <RefreshCw
                    className={`w-4 h-4 ${syncingProvider === providerName ? "animate-spin text-indigo-500" : ""}`}
                  />
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-8 text-xs bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                  onClick={() => updateProviderKey(providerName)}
                >
                  更新密钥
                </Button>
              </div>
            </div>
          )) : null}
          {configSnapshot?.config && Object.keys(providerConfigs).length === 0 && (
            <div className="text-sm text-slate-400 text-center py-4">无提货商数据</div>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-sm border-emerald-100 flex flex-col">
        <CardHeader className="bg-emerald-50/30 pb-4 border-b">
          <CardTitle className="flex items-center gap-2 text-lg text-emerald-900">
            <MessageCircle className="w-5 h-5 text-emerald-600" />
            外网应用链路通信
          </CardTitle>
          <CardDescription>绑定后，赛博公司将接通对应该社交体系的外网全量消息</CardDescription>
        </CardHeader>
        <CardContent className="pt-4 space-y-3 flex-1 overflow-y-auto max-h-80">
          <div className="flex items-center justify-between p-3 rounded-xl border bg-white shadow-sm">
            <div>
              <div className="font-semibold text-sm flex items-center gap-2">
                Telegram 机器人
                {telegramConfig?.enabled && (
                  <Badge
                    variant="outline"
                    className="text-[9px] h-4 text-emerald-600 border-emerald-200 bg-emerald-50"
                  >
                    运行中
                  </Badge>
                )}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                Token: {telegramConfig?.botToken ? "******(已载入)" : "未装载"}
              </div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              className="h-8 text-xs bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              onClick={() => setTelegramDialogOpen(true)}
            >
              配置 / 覆盖
            </Button>
          </div>

          {(configSnapshot?.config
            ? Object.entries(configSnapshot.config.channels || {})
                .filter(([k]) => k !== "telegram" && k !== "defaults" && k !== "modelByChannel")
                .map(([channelName]) => (
                  <div
                    key={channelName}
                    className="flex items-center justify-between p-3 rounded-xl border bg-white shadow-sm opacity-60"
                  >
                    <div>
                      <div className="font-semibold text-sm capitalize">{channelName}</div>
                      <div className="text-xs text-slate-500 mt-0.5">暂不支持在此视图直接修改</div>
                    </div>
                    <Badge variant="outline">只读</Badge>
                  </div>
                ))
            : [])}
        </CardContent>
      </Card>
    </div>
  );
}

export function SettingsAdvancedSection(props: {
  advancedOpen: boolean;
  setAdvancedOpen: (open: boolean) => void;
  status: unknown;
  channels: unknown;
  skills: unknown;
}) {
  const { advancedOpen, setAdvancedOpen, status, channels, skills } = props;
  return (
    <div className="mt-12 border rounded-xl overflow-hidden bg-white shadow-sm">
      <button
        className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
        onClick={() => setAdvancedOpen(!advancedOpen)}
      >
        <div>
          <h3 className="font-semibold text-slate-700">系统底层探针监测器</h3>
          <p className="text-xs text-slate-500 mt-1">
            仅供系统级排错与高级运维参考，包含各注册集群的心跳快照。
          </p>
        </div>
        {advancedOpen ? (
          <ChevronUp className="text-slate-400" />
        ) : (
          <ChevronDown className="text-slate-400" />
        )}
      </button>

      {advancedOpen && (
        <div className="p-4 border-t grid grid-cols-1 lg:grid-cols-3 gap-4 bg-slate-50/50">
          <Card className="shadow-none border-slate-200">
            <CardHeader className="py-3">
              <CardTitle className="text-sm">网关心跳切片</CardTitle>
            </CardHeader>
            <CardContent className="p-0 border-t">
              <pre className="text-[10px] bg-slate-950 text-slate-300 p-3 overflow-auto h-64 rounded-b-lg m-0">
                {stringifyPreview(status)}
              </pre>
            </CardContent>
          </Card>
          <Card className="shadow-none border-slate-200">
            <CardHeader className="py-3">
              <CardTitle className="text-sm">外网联络站切片</CardTitle>
            </CardHeader>
            <CardContent className="p-0 border-t">
              <pre className="text-[10px] bg-slate-950 text-slate-300 p-3 overflow-auto h-64 rounded-b-lg m-0">
                {stringifyPreview(channels)}
              </pre>
            </CardContent>
          </Card>
          <Card className="shadow-none border-slate-200">
            <CardHeader className="py-3">
              <CardTitle className="text-sm">内核函数块切片</CardTitle>
            </CardHeader>
            <CardContent className="p-0 border-t">
              <pre className="text-[10px] bg-slate-950 text-slate-300 p-3 overflow-auto h-64 rounded-b-lg m-0">
                {stringifyPreview(skills)}
              </pre>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

export function SettingsDialogs(props: {
  executorDialogOpen: boolean;
  setExecutorDialogOpen: (open: boolean) => void;
  executorConfig: GatewaySettingsQueryResult["executorConfig"];
  telegramDialogOpen: boolean;
  setTelegramDialogOpen: (open: boolean) => void;
  providerKeyDialogOpen: boolean;
  setProviderKeyDialogOpen: (open: boolean) => void;
  providerKeyTarget: string | null;
  setProviderKeyTarget: (provider: string | null) => void;
  addProviderDialogOpen: boolean;
  setAddProviderDialogOpen: (open: boolean) => void;
  executorSaving: boolean;
  telegramSaving: boolean;
  providerKeySaving: boolean;
  addProviderSaving: boolean;
  handleExecutorConfigSubmit: (values: Record<string, string>) => Promise<{ title: string; description: string } | null>;
  handleTelegramSubmit: (values: Record<string, string>) => Promise<{ title: string; description: string } | null>;
  onProviderKeySubmit: (provider: string | null, values: Record<string, string>) => Promise<{ title: string; description: string } | null>;
  handleAddProviderSubmit: (values: Record<string, string>) => Promise<{ title: string; description: string } | null>;
  runCommand: RunCommand;
}) {
  const {
    executorDialogOpen,
    setExecutorDialogOpen,
    executorConfig,
    telegramDialogOpen,
    setTelegramDialogOpen,
    providerKeyDialogOpen,
    setProviderKeyDialogOpen,
    providerKeyTarget,
    setProviderKeyTarget,
    addProviderDialogOpen,
    setAddProviderDialogOpen,
    executorSaving,
    telegramSaving,
    providerKeySaving,
    addProviderSaving,
    handleExecutorConfigSubmit,
    handleTelegramSubmit,
    onProviderKeySubmit,
    handleAddProviderSubmit,
    runCommand,
  } = props;

  return (
    <>
      <ActionFormDialog
        open={executorDialogOpen}
        onOpenChange={setExecutorDialogOpen}
        title="更新下游 OpenClaw 执行器"
        description="浏览器只连接 Authority。这里配置的是 Authority 内部挂接的 OpenClaw 地址和令牌。"
        confirmLabel="保存并重连执行器"
        busy={executorSaving}
        fields={[
          {
            name: "openclawUrl",
            label: "OpenClaw URL",
            type: "text",
            required: true,
            defaultValue: executorConfig?.openclaw.url ?? "",
            placeholder: "例如: ws://127.0.0.1:18789",
          },
          {
            name: "openclawToken",
            label: "OpenClaw Token",
            type: "password",
            required: false,
            placeholder: executorConfig?.openclaw.tokenConfigured ? "留空表示保持原 token 不变" : "可选",
          },
        ]}
        onSubmit={async (values) => {
          const result = await runCommand(
            () => handleExecutorConfigSubmit(values),
            "执行后端配置失败",
          );
          if (result) {
            setExecutorDialogOpen(false);
          }
        }}
      />

      <ActionFormDialog
        open={telegramDialogOpen}
        onOpenChange={setTelegramDialogOpen}
        title="打通 Telegram 通道"
        description="填入机器人令牌，赛博公司底层将即时接管 Telegram 流量通信并分发响应。"
        confirmLabel="装载配置并重启网络"
        busy={telegramSaving}
        fields={[
          {
            name: "botToken",
            label: "Bot Token",
            type: "password",
            required: true,
            placeholder: "例如: 123456789:ABCDE...",
          },
        ]}
        onSubmit={async (values) => {
          const result = await runCommand(
            () => handleTelegramSubmit(values),
            "Telegram 配置失败",
          );
          if (result) {
            setTelegramDialogOpen(false);
          }
        }}
      />

      <ActionFormDialog
        open={providerKeyDialogOpen}
        onOpenChange={setProviderKeyDialogOpen}
        title={`更新 ${providerKeyTarget || ""} 鉴权密钥`}
        description="系统底层将更新此算力通道的 API Key。此操作仅替换配置，尚未生效至具体特工。"
        confirmLabel="装载专属密钥"
        busy={providerKeySaving}
        fields={[
          {
            name: "apiKey",
            label: "API Key",
            type: "password",
            required: true,
            placeholder: "例如: sk-xxxxxxxxxxxxxxxx",
          },
        ]}
        onSubmit={async (values) => {
          const result = await runCommand(
            () => onProviderKeySubmit(providerKeyTarget, values),
            "供应商密钥更新失败",
          );
          if (result) {
            setProviderKeyDialogOpen(false);
            setProviderKeyTarget(null);
          }
        }}
      />

      <ActionFormDialog
        open={addProviderDialogOpen}
        onOpenChange={setAddProviderDialogOpen}
        title="添加自定义模型供应商"
        description="系统底层将挂载新的算力连通渠道，支持兼容标准 OpenAI Base URL 的第三方提货商中转。"
        confirmLabel="注册集成通道"
        busy={addProviderSaving}
        fields={[
          {
            name: "providerName",
            label: "供应商标识 (Provider Name)",
            type: "text",
            required: true,
            placeholder: "例如: openai, openrouter, deepseek, ali...",
          },
          {
            name: "baseUrl",
            label: "代理端点 (Base URL) - 选填",
            type: "text",
            required: false,
            placeholder: "例如: https://api.deepseek.com/v1",
          },
          {
            name: "apiKey",
            label: "授权令牌 (API Key)",
            type: "password",
            required: true,
            placeholder: "例如: sk-xxxxxxxx",
          },
        ]}
        onSubmit={async (values) => {
          const result = await runCommand(
            () => handleAddProviderSubmit(values),
            "新增供应商失败",
          );
          if (result) {
            setAddProviderDialogOpen(false);
          }
        }}
      />
    </>
  );
}
