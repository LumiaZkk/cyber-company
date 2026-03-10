import * as Dialog from "@radix-ui/react-dialog";
import { Play, Pause, Trash2, Clock, GitCommit } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useOrgQuery } from "../../application/org";
import { ActionFormDialog } from "../../components/ui/action-form-dialog";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { buildAutomationScenario } from "../../application/company/automation-recommendations";
import { gateway, type CronJob, type CronListResult } from "../../application/gateway";
import { toast } from "../../components/system/toast-store";

import { formatTime } from "../../lib/utils";

type CreateAutomationTemplate = {
  name?: string;
  expr?: string;
  everyMs?: number;
  task?: string;
  agentId?: string;
};

export function AutomationPresentationPage() {
  const { activeCompany } = useOrgQuery();
  const employees = useMemo(() => activeCompany?.employees ?? [], [activeCompany?.employees]);
  const companyAgentIdsKey = employees
    .map((employee) => employee.agentId)
    .sort((left, right) => left.localeCompare(right))
    .join("|");

  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionRunning, setActionRunning] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const [removeJobDialogOpen, setRemoveJobDialogOpen] = useState(false);
  const [removeJobTarget, setRemoveJobTarget] = useState<{ id: string; name: string } | null>(null);

  // Custom dialog state
  const [draftName, setDraftName] = useState("");
  const [draftAgentId, setDraftAgentId] = useState("");
  const [draftScheduleType, setDraftScheduleType] = useState<"every" | "cron">("cron");
  const [draftExpr, setDraftExpr] = useState("");
  const [draftEveryMs, setDraftEveryMs] = useState("3600000"); // 1 hour default
  const [draftTask, setDraftTask] = useState("");

  const loadJobs = useCallback(async () => {
    if (!gateway.isConnected) return;

    try {
      setError(null);
      const result = (await gateway.listCron()) as CronListResult;
      const allJobs = Array.isArray(result.jobs) ? result.jobs : [];

      const companyAgentIds = new Set(employees.map((e) => e.agentId));
      const filteredJobs = allJobs.filter((j) => !j.agentId || companyAgentIds.has(j.agentId));
      setJobs(filteredJobs);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, [employees]);

  useEffect(() => {
    setLoading(true);
    void loadJobs();
    const timer = setInterval(() => {
      void loadJobs();
    }, 15_000);
    return () => clearInterval(timer);
  }, [activeCompany?.id, companyAgentIdsKey, loadJobs]);

  if (!activeCompany) {
    return <div className="p-8 text-center text-muted-foreground">未选择正在运营的公司组织</div>;
  }

  const scenario = buildAutomationScenario({ company: activeCompany, jobs });

  const openCreateDialog = (template?: CreateAutomationTemplate) => {
    const ceo = employees.find((e) => e.metaRole === "ceo") || employees[0];
    setDraftName(template?.name || "");
    setDraftAgentId(template?.agentId || ceo?.agentId || "");
    setDraftScheduleType(template?.expr ? "cron" : "every");
    setDraftExpr(template?.expr || "");
    setDraftEveryMs(String(template?.everyMs || 3600000));
    setDraftTask(template?.task || "");
    setCreateDialogOpen(true);
  };

  const handleCreateSubmit = async () => {
    if (!draftName.trim() || !draftTask.trim() || !draftAgentId) {
      toast.error("验证失败", "请填写完整的信息");
      return;
    }

    let scheduleParams = {};
    if (draftScheduleType === "cron") {
      if (!draftExpr.trim()) return toast.error("验证失败", "未填写 Cron 表达式");
      scheduleParams = { kind: "cron", expr: draftExpr.trim() };
    } else {
      scheduleParams = { kind: "every", everyMs: parseInt(draftEveryMs, 10) };
    }

    setActionRunning(true);
    try {
      await gateway.addCron({
        name: draftName.trim(),
        agentId: draftAgentId,
        enabled: true,
        sessionTarget: "main",
        wakeMode: "now",
        schedule: scheduleParams,
        payload: {
          kind: "agentTurn",
          message: draftTask.trim(),
        },
      });
      toast.success("执行班次已创建", "新的自动化部署已启动");
      setCreateDialogOpen(false);
      await loadJobs();
    } catch (e: unknown) {
      toast.error("创建失败", e instanceof Error ? e.message : String(e));
    } finally {
      setActionRunning(false);
    }
  };

  const toggleCronStatus = async (job: CronJob) => {
    try {
      const nextStatus = !(job.enabled !== false);
      await gateway.updateCron(job.id, { enabled: nextStatus });
      toast.success("状态已更新", `已${nextStatus ? "开启" : "停用"}班次: ${job.name}`);
      await loadJobs();
    } catch (e: unknown) {
      toast.error("状态更新失败", e instanceof Error ? e.message : String(e));
    }
  };

  const removeCronJob = (id: string, name: string) => {
    setRemoveJobTarget({ id, name });
    setRemoveJobDialogOpen(true);
  };

  const onRemoveJobSubmit = async () => {
    if (!removeJobTarget) return;
    try {
      await gateway.removeCron(removeJobTarget.id);
      toast.success("班次已移除", `已删除班次: ${removeJobTarget.name}`);
      await loadJobs();
      setRemoveJobDialogOpen(false);
    } catch (e: unknown) {
      toast.error("删除失败", e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-4 md:p-6 lg:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">自动化班次</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            通过 COO 下发高频自动化任务与运营流水线
          </p>
        </div>
        <Button disabled={actionRunning} onClick={() => openCreateDialog()}>
          新建自动化
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle>场景推荐自动化</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">{scenario.description}</p>
            </div>
            <Badge variant="secondary">{scenario.label}</Badge>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {scenario.recommendations.map((template) => (
            <button
              key={template.id}
              className={`rounded-lg border p-4 text-left transition-colors ${
                template.status === "already_scheduled"
                  ? "border-emerald-200 bg-emerald-50/40 hover:border-emerald-300"
                  : "hover:border-indigo-400 hover:bg-indigo-50/40"
              }`}
              disabled={actionRunning}
              onClick={() => {
                openCreateDialog({
                  name: template.label,
                  expr: template.expr,
                  everyMs: template.everyMs,
                  task: template.task,
                  agentId: template.recommendedAgentId,
                });
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-900">{template.label}</div>
                  <div className="mt-1 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">
                    {template.category}
                  </div>
                </div>
                <Badge variant={template.status === "already_scheduled" ? "secondary" : "outline"}>
                  {template.status === "already_scheduled" ? "已存在相似班次" : "推荐创建"}
                </Badge>
              </div>
              <div className="text-xs text-slate-500 mt-2 flex items-center gap-1">
                <Clock className="w-3 h-3" /> 调度频次：{template.scheduleLabel}
              </div>
              <div className="text-sm text-slate-600 mt-2">{template.task}</div>
              <div className="mt-3 rounded-md bg-slate-100/80 px-3 py-2 text-xs leading-relaxed text-slate-600">
                {template.reason}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>建议执行节点：{template.recommendedAgentLabel || "CEO / COO"}</span>
                {template.matchedJobName ? <span>已检测到：{template.matchedJobName}</span> : null}
              </div>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle>全局自动班次监控面板</CardTitle>
          <Badge variant="secondary">{jobs.length} 项常驻班次</Badge>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          {loading ? (
            <div className="text-sm text-muted-foreground animate-pulse text-center py-8">
              正在从 Gateway 加载排期流...
            </div>
          ) : jobs.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-8 border border-dashed rounded-lg bg-slate-50">
              系统内暂无自动化任务记录。试着从上方模板选用。
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {jobs.map((job) => {
                const id = typeof job.id === "string" ? job.id : "unknown";
                const name =
                  typeof job.name === "string" && job.name.trim().length > 0 ? job.name : id;
                const enabled = job.enabled !== false;
                const executor = employees.find((e) => e.agentId === job.agentId);

                return (
                  <div
                    key={id}
                    className={`rounded-lg border transition-all overflow-hidden ${enabled ? "border-slate-200 bg-white" : "border-slate-100 bg-slate-50 opacity-80"}`}
                  >
                    <div className="border-b px-4 py-3 flex items-center justify-between bg-slate-50/50">
                      <div className="font-semibold text-slate-900 truncate flex-1 pr-2 flex items-center gap-2">
                        {name}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-slate-400 hover:text-red-500 hover:bg-red-50"
                          onClick={() => removeCronJob(id, name)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant={enabled ? "outline" : "default"}
                          size="sm"
                          className={`h-8 font-medium ${enabled ? "text-slate-600" : "bg-green-600 hover:bg-green-700"}`}
                          onClick={() => toggleCronStatus(job)}
                        >
                          {enabled ? (
                            <>
                              <Pause className="w-3 h-3 mr-1" /> 停用
                            </>
                          ) : (
                            <>
                              <Play className="w-3 h-3 mr-1" /> 启用
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                    <div className="p-4 space-y-3">
                      <div className="flex items-start justify-between text-sm">
                        <div className="text-slate-500 font-medium">执行节点</div>
                        <div className="text-slate-900 font-medium bg-slate-100 px-2 py-0.5 rounded text-xs">
                          {executor?.nickname || job.agentId}{" "}
                          <span className="text-slate-400 ml-1">
                            ({executor?.role || "未知角色"})
                          </span>
                        </div>
                      </div>
                      <div className="flex items-start justify-between text-sm">
                        <div className="text-slate-500 font-medium">执行策略</div>
                        <div className="text-slate-700 text-xs px-2 py-0.5 bg-slate-100 rounded border font-mono">
                          {job.schedule?.kind === "cron"
                            ? `专家模式周期 [${job.schedule?.expr}]`
                            : `高频间隔 (每 ${Math.round((job.schedule?.everyMs || 0) / 60000)} 分钟)`}
                        </div>
                      </div>
                      <div className="flex items-start justify-between text-sm mt-3">
                        <div className="text-slate-500 font-medium min-w-16">核心动作</div>
                        <div className="text-slate-700 text-xs text-right break-words flex-1 ml-4 bg-blue-50/50 p-2 rounded border border-blue-50 leading-relaxed font-mono">
                          <GitCommit className="w-3 h-3 inline mr-1 text-blue-400 align-text-bottom" />{" "}
                          {job.payload?.message || "-"}
                        </div>
                      </div>

                      <div className="pt-3 border-t grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-slate-50 p-2 rounded">
                          <div className="text-slate-400 mb-0.5">上次完结状态</div>
                          <div className="font-medium text-slate-700 flex items-center gap-1">
                            {job.state?.lastStatus === "ok" ? (
                              <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                            ) : job.state?.lastStatus === "error" ? (
                              <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                            ) : (
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                            )}
                            {job.state?.lastStatus || "尚未执行"}
                          </div>
                        </div>
                        <div className="bg-slate-50 p-2 rounded">
                          <div className="text-slate-400 mb-0.5">上次处理时间</div>
                          <div className="font-medium text-slate-700">
                            {formatTime(job.state?.lastRunAtMs)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 创建自动化 Dialog */}
      <Dialog.Root open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[90] bg-black/35 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[91] w-[min(92vw,36rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <Dialog.Title className="text-lg font-bold text-slate-900">排期新任务</Dialog.Title>
            <Dialog.Description className="mt-1 text-sm text-slate-500 mb-6">
              表单将直传给 Gateway 进行注册配置，自动加入定时触发队列。
            </Dialog.Description>

            <div className="space-y-4">
              <label className="block text-sm">
                <div className="mb-1.5 font-medium text-slate-700">
                  任务名 (唯一标识) <span className="text-red-500">*</span>
                </div>
                <input
                  type="text"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  placeholder="例如：晚间对账"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none transition focus:border-indigo-500"
                />
              </label>

              <label className="block text-sm">
                <div className="mb-1.5 font-medium text-slate-700">
                  分配给计算节点 <span className="text-red-500">*</span>
                </div>
                <select
                  value={draftAgentId}
                  onChange={(e) => setDraftAgentId(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none transition focus:border-indigo-500"
                >
                  <option value="" disabled>
                    选择接收指派的节点...
                  </option>
                  {employees.map((e) => (
                    <option key={e.agentId} value={e.agentId}>
                      {e.nickname} ({e.role})
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex gap-4">
                <label className="block text-sm w-1/3">
                  <div className="mb-1.5 font-medium text-slate-700">调度类型</div>
                  <select
                    value={draftScheduleType}
                    onChange={(e) =>
                      setDraftScheduleType(e.target.value === "every" ? "every" : "cron")
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none transition focus:border-indigo-500"
                  >
                    <option value="every">固定时间片段轮询</option>
                    <option value="cron">专家模式 (分时表达式)</option>
                  </select>
                </label>

                {draftScheduleType === "cron" ? (
                  <label className="block text-sm flex-1">
                    <div className="mb-1.5 font-medium text-slate-700 flex items-center gap-1">
                      分配高级周期 (Cron) <span className="text-red-500">*</span>
                    </div>
                    <input
                      type="text"
                      value={draftExpr}
                      onChange={(e) => setDraftExpr(e.target.value)}
                      placeholder="如 0 9 * * * (每天早九点)"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none transition focus:border-indigo-500"
                    />
                  </label>
                ) : (
                  <label className="block text-sm flex-1">
                    <div className="mb-1.5 font-medium text-slate-700">间隔预设</div>
                    <select
                      value={draftEveryMs}
                      onChange={(e) => setDraftEveryMs(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none transition focus:border-indigo-500"
                    >
                      <option value="60000">每 1 分钟 (极高频调试用)</option>
                      <option value="3600000">每 1 小时</option>
                      <option value="86400000">每 24 小时</option>
                    </select>
                  </label>
                )}
              </div>

              <label className="block text-sm">
                <div className="mb-1.5 font-medium text-slate-700">
                  指令内容 <span className="text-red-500">*</span>
                </div>
                <textarea
                  rows={3}
                  value={draftTask}
                  onChange={(e) => setDraftTask(e.target.value)}
                  placeholder="请输入发送给节点的 prompt 内容..."
                  className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 outline-none transition focus:border-indigo-500"
                />
              </label>
            </div>

            <div className="flex justify-end gap-2 mt-8">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateDialogOpen(false)}
                disabled={actionRunning}
              >
                取消
              </Button>
              <Button
                onClick={handleCreateSubmit}
                disabled={
                  actionRunning ||
                  !draftName ||
                  !draftTask ||
                  !draftAgentId ||
                  (draftScheduleType === "cron" ? !draftExpr : false)
                }
              >
                {actionRunning ? "投定中..." : "下发注册"}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <ActionFormDialog
        open={removeJobDialogOpen}
        onOpenChange={setRemoveJobDialogOpen}
        title="永久删除班次"
        description={`确定要永久删除班次 "${removeJobTarget?.name}" 吗？此操作不可逆，相关定时任务将被彻底解绑。`}
        confirmLabel="确认删除"
        fields={[]}
        onSubmit={onRemoveJobSubmit}
      />
    </div>
  );
}
