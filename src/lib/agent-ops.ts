import { gateway } from "../features/backend";
import type { Company } from "../features/company/types";
import { useCompanyStore } from "../features/company/store";
import { CONFIG_PROMPTS, resolveMetaAgentId, type MetaTarget } from "./chat-as-config";
import { useGatewayStore } from "../features/gateway/store";
import { toast } from "../features/ui/toast-store";
import { resolveLocalServiceOrigin } from "./utils";

export type ApprovalDecision = "allow-once" | "allow-always" | "deny";

type RequestOptions = {
  strictMethod?: boolean;
  silent?: boolean;
};

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function ensureConnected() {
  if (!gateway.isConnected) {
    throw new Error("Gateway 未连接，暂时无法执行该操作。");
  }
}

function ensureMetaAgent(company: Company, target: MetaTarget): string {
  const agentId = resolveMetaAgentId(company, target);
  if (!agentId) {
    throw new Error(`未找到 ${target.toUpperCase()} 节点，无法执行操作。`);
  }
  return agentId;
}

function normalizeNonEmptyString(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error("输入不能为空。");
  }
  return normalized;
}

async function sendPromptToMetaAgent(company: Company, target: MetaTarget, prompt: string) {
  ensureConnected();
  const agentId = ensureMetaAgent(company, target);
  const session = await gateway.resolveSession(agentId);
  await gateway.sendChatMessage(session.key, prompt);
  return { agentId, sessionKey: session.key };
}

async function requestGatewayMethod<T>(method: string, params: unknown, options?: RequestOptions): Promise<T> {
  const strictMethod = options?.strictMethod ?? true;
  const silent = options?.silent ?? false;

  if (strictMethod && !AgentOps.isGatewayMethodAvailable(method)) {
    throw new Error(`当前 Gateway 未开放 ${method} 能力。`);
  }

  ensureConnected();
  try {
    return await gateway.request<T>(method, params);
  } catch (error) {
    const message = toErrorMessage(error);
    if (!silent) {
      toast.error("操作失败", `${method}: ${message}`);
    }
    throw error;
  }
}

export const AgentOps = {
  isGatewayMethodAvailable(method: string): boolean {
    const methods = useGatewayStore.getState().hello?.features?.methods;
    return Array.isArray(methods) ? methods.includes(method) : false;
  },

  listAvailableMethods(): string[] {
    const methods = useGatewayStore.getState().hello?.features?.methods;
    return Array.isArray(methods) ? [...methods] : [];
  },

  async resolveApproval(id: string, decision: ApprovalDecision) {
    const approvalId = normalizeNonEmptyString(id);
    await requestGatewayMethod("exec.approval.resolve", { id: approvalId, decision });
    toast.success("审批已提交", `决策：${decision}`);
  },

  async sendToMetaAgent(company: Company, target: MetaTarget, message: string) {
    try {
      return await sendPromptToMetaAgent(company, target, normalizeNonEmptyString(message));
    } catch (error) {
      toast.error("下发失败", toErrorMessage(error));
      throw error;
    }
  },

  async hireEmployee(company: Company, config: { role: string; description: string; modelTier?: string; traits?: string; budget?: number; avatarFile?: File }) {
    try {
      let avatarJobId: string | undefined;
      
      if (config.avatarFile) {
        toast.info("化身生成", "正在将基础绘图上载至 Forge 核心...");
        const formData = new FormData();
        formData.append("file", config.avatarFile);
        formData.append("name", config.role);
        formData.append("author", company.name);

        const res = await fetch(`${resolveLocalServiceOrigin(7890)}/forge`, {
          method: "POST",
          body: formData,
        });
        
        if (!res.ok) {
          throw new Error(`化身微服务拒绝了请求。状态码：${res.status}`);
        }
        const data = await res.json();
        avatarJobId = data.job_id;
        toast.success("化身排期成功", `Forge 结界已收容该图谱，作业流：${avatarJobId}`);
      }

      const prompt = CONFIG_PROMPTS.hireEmployee(config);
      const result = await sendPromptToMetaAgent(company, "hr", prompt.prompt);
      
      // 更新公司对象以关联化身
      if (avatarJobId) {
        const store = useCompanyStore.getState();
        const activeCompany = store.activeCompany;
        if (activeCompany) {
          const updatedEmployees = activeCompany.employees.map(emp => {
            if (emp.agentId === result.agentId) {
              return { ...emp, avatarJobId };
            }
            return emp;
          });
          
          const newEmpRef = activeCompany.employees.find(e => e.agentId === result.agentId);
          if (!newEmpRef) {
            // 如果 HR 动作过慢未能即时被 Gateway Config 推送捕获导致找不到该员工
            // 我们手动推入一个预期的待定骨架
            updatedEmployees.push({
              agentId: result.agentId,
              nickname: config.role,
              role: config.description.slice(0, 15),
              isMeta: false,
              avatarJobId,
            });
          }
          await store.updateCompany({ employees: updatedEmployees });
        }
      }
      
      toast.success("系统节点激活", `已指示 HR 构造节点「${config.role.trim()}」及其系统记忆`);
      return result;
    } catch (error) {
      const message = toErrorMessage(error);
      toast.error("入职创建失败", message);
      throw error;
    }
  },

  async createAutomation(company: Company, agentNickname: string, schedule: string, task: string) {
    try {
      const prompt = CONFIG_PROMPTS.createAutomation(
        normalizeNonEmptyString(agentNickname),
        normalizeNonEmptyString(schedule),
        normalizeNonEmptyString(task),
      );
      const result = await sendPromptToMetaAgent(company, "coo", prompt.prompt);
      toast.success("自动化任务已下发", `已交给 COO 安排「${schedule.trim()}」班次`);
      return result;
    } catch (error) {
      const message = toErrorMessage(error);
      toast.error("自动化任务下发失败", message);
      throw error;
    }
  },

  async connectTelegram(company: Company, token: string) {
    try {
      const prompt = CONFIG_PROMPTS.connectTelegram(normalizeNonEmptyString(token));
      const result = await sendPromptToMetaAgent(company, "cto", prompt.prompt);
      toast.success("渠道配置任务已下发", "已通知 CTO 配置 Telegram 渠道");
      return result;
    } catch (error) {
      const message = toErrorMessage(error);
      toast.error("渠道配置失败", message);
      throw error;
    }
  },

  async assignTask(agentId: string, task: string) {
    const targetAgentId = normalizeNonEmptyString(agentId);
    const taskText = normalizeNonEmptyString(task);
    try {
      const session = await gateway.resolveSession(targetAgentId);
      await gateway.sendChatMessage(session.key, taskText);
      toast.success("任务已分配", "已将任务发送到目标员工会话");
      return { agentId: targetAgentId, sessionKey: session.key };
    } catch (error) {
      toast.error("任务分配失败", toErrorMessage(error));
      throw error;
    }
  },

  async stopTask(sessionKey: string, runId?: string) {
    ensureConnected();
    const key = normalizeNonEmptyString(sessionKey);
    try {
      const res = await gateway.abortChatRunsForSessionKeyWithPartials(key, runId);
      if (res.aborted) {
        toast.info("已发送停止信号", "成功下发中断任务指令");
      } else {
        toast.info("已发送停止信号", "当前可能没有正在执行的任务");
      }
    } catch (error) {
       toast.error("停止任务失败", toErrorMessage(error));
       throw error;
    }
  },

  async resetSession(sessionKey: string, reason: "new" | "reset" = "reset") {
    const key = normalizeNonEmptyString(sessionKey);
    await gateway.resetSession(key, reason);
    toast.success(
      reason === "new" ? "已开启新会话" : "会话已重置",
      reason === "new" ? "当前会话上下文已清空，并从新的空白轮次开始" : "该会话上下文已清空",
    );
  },

  async compactSession(sessionKey: string) {
    const key = normalizeNonEmptyString(sessionKey);
    await requestGatewayMethod("sessions.compact", { key });
    toast.success("会话已压缩", "历史上下文已整理");
  },

  async patchSession(params: { key: string; label?: string | null; archived?: boolean | null }) {
    const key = normalizeNonEmptyString(params.key);
    await requestGatewayMethod("sessions.patch", {
      key,
      label: params.label,
      archived: params.archived,
    });
    toast.success("会话信息已更新", "标签或归档状态已生效");
  },

  async deleteSession(sessionKey: string) {
    const key = normalizeNonEmptyString(sessionKey);
    await requestGatewayMethod("sessions.delete", { key });
    toast.success("会话已删除", "会话已从列表中移除");
  },

  async setAgentModel(agentId: string, model: string | null) {
    const id = normalizeNonEmptyString(agentId);
    const result = await gateway.setAgentModelOverride(id, model);
    if (result.updated) {
      toast.success("模型配置已更新", result.modelOverride ? `当前覆盖模型：${result.modelOverride}` : "已恢复默认模型");
    }
    return result;
  },

  async setAgentSkills(agentId: string, skills: string[] | null) {
    const id = normalizeNonEmptyString(agentId);
    const result = await gateway.setAgentSkillsOverride(id, skills);
    if (result.updated) {
      toast.success("技能配置已更新", result.skillsOverride ? `技能数：${result.skillsOverride.length}` : "已恢复默认技能");
    }
    return result;
  },

  async cloneAgent(agentId: string, nextName: string) {
    const id = normalizeNonEmptyString(agentId);
    const name = normalizeNonEmptyString(nextName);
    const result = await requestGatewayMethod<{ ok: true; agentId: string; name?: string }>(
      "agents.clone",
      { agentId: id, name },
    );
    toast.success("克隆成功", `新员工：${result.name ?? name}`);
    return result;
  },

  async updateRole(agentId: string, role: string, description: string) {
    const activeCompany = useCompanyStore.getState().activeCompany;
    if (!activeCompany) {
      throw new Error("无活跃公司，无法执行调岗操作。");
    }
    const id = normalizeNonEmptyString(agentId);
    const targetInfo = activeCompany.employees.find((e: any) => e.agentId === id);
    if (!targetInfo) {
      throw new Error("在当前公司结构中未查找到该员工名片。");
    }
    
    toast.info("审批立项", `向 HR 发送调岗请求：${targetInfo.nickname}`);
    const hrAgentId = resolveMetaAgentId(activeCompany, 'hr');
    if (!hrAgentId) {
      throw new Error("无 HR 节点，离线更新职级失败。");
    }
    const session = await gateway.resolveSession(hrAgentId);
    await gateway.sendChatMessage(
      session.key,
      `[ADMIN_ACTION] 角色职务调整。请将员工 ${targetInfo.nickname} (${id}) 的岗位更新为 "${role}"，职责描述更新为: "${description}"。务必更新档并在系统里生效。`
    );
    toast.success("执行中", "HR 已接管调岗流程。在处理完成并重载系统前，可能需要耐心等待数分钟。");
  },

  async fireAgent(agentId: string) {
    const activeCompany = useCompanyStore.getState().activeCompany;
    if (!activeCompany) {
      throw new Error("无活跃公司，无法执行开除操作。");
    }
    const id = normalizeNonEmptyString(agentId);
    const targetInfo = activeCompany.employees.find((e: any) => e.agentId === id);
    if (!targetInfo) {
      throw new Error("在当前公司结构中未查找到该员工名片。");
    }
    const targetName = targetInfo.nickname;
    
    toast.info("审批立项", `向 HR 发送解雇请求：${targetName}`);
    
    // Check if HR meta-agent exists
    const hrAgentId = resolveMetaAgentId(activeCompany, 'hr');
    if (!hrAgentId) {
       throw new Error("公司组织结构树中无 HR 节点，离职转交失败！");
    }
    const session = await gateway.resolveSession(hrAgentId);
    await gateway.sendChatMessage(
      session.key,
      `[ADMIN_ACTION] 执行销毁计算节点请求。请彻底解雇员工 ${targetName} (${id})，完成系统档注销、清理运行时状态。`
    );
    toast.success("执行中", "HR 已接管解雇流程，请稍后刷新检查员工名片薄。");
  },

  async createAgent(name: string) {
    const result = await gateway.createAgent(normalizeNonEmptyString(name));
    toast.success("员工创建成功", `Agent ID: ${result.agentId}`);
    return result;
  },

  async updateAgentName(agentId: string, name: string) {
    const id = normalizeNonEmptyString(agentId);
    const nextName = normalizeNonEmptyString(name);
    const result = await gateway.updateAgent({ agentId: id, name: nextName });
    toast.success("员工信息已更新", `新名称：${nextName}`);
    return result;
  },

  async listSessions(params?: {
    limit?: number;
    includeGlobal?: boolean;
    includeUnknown?: boolean;
    includeDerivedTitles?: boolean;
    includeLastMessage?: boolean;
    search?: string;
  }) {
    return gateway.listSessions(params);
  },

  async listCronJobs() {
    return gateway.listCron();
  },

  async createCronJob(job: Record<string, unknown>) {
    const result = await gateway.addCron(job);
    toast.success("自动化任务已创建", "Cron 任务写入成功");
    return result;
  },

  async updateCronJob(id: string, patch: Record<string, unknown>) {
    const cronId = normalizeNonEmptyString(id);
    const result = await requestGatewayMethod("cron.update", { id: cronId, ...patch });
    toast.success("自动化任务已更新", `任务 ID: ${cronId}`);
    return result;
  },

  async runCronJob(id: string) {
    const cronId = normalizeNonEmptyString(id);
    const result = await requestGatewayMethod("cron.run", { id: cronId });
    toast.success("自动化任务已触发", `任务 ID: ${cronId}`);
    return result;
  },

  async removeCronJob(id: string) {
    const cronId = normalizeNonEmptyString(id);
    const result = await gateway.removeCron(cronId);
    toast.success("自动化任务已删除", `任务 ID: ${cronId}`);
    return result;
  },

  async listToolsCatalog() {
    return requestGatewayMethod<Record<string, unknown>>("tools.catalog", {}, { strictMethod: false, silent: true });
  },

  async tailLogs(limit = 120) {
    return requestGatewayMethod<Record<string, unknown>>(
      "logs.tail",
      { limit: Math.max(1, Math.min(500, Math.floor(limit))) },
      { strictMethod: false, silent: true },
    );
  },

  async sendDirectMessage(sessionKey: string, message: string) {
    const key = normalizeNonEmptyString(sessionKey);
    const text = normalizeNonEmptyString(message);
    const result = await gateway.sendChatMessage(key, text);
    toast.info("消息已发送", "已投递到目标会话");
    return result;
  },

  async resolveSessionForAgent(agentId: string) {
    return gateway.resolveSession(normalizeNonEmptyString(agentId));
  },

  async getRuntimeStatus() {
    return gateway.getStatus();
  },

  async getChannelsStatus() {
    return gateway.getChannelsStatus();
  },

  async getSkillsStatus(agentId?: string) {
    return gateway.getSkillsStatus(agentId);
  },
};
