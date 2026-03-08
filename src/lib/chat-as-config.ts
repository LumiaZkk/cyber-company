import type { Company } from "../features/company/types";

export type MetaTarget = "ceo" | "hr" | "cto" | "coo";

export type ConfigPrompt = {
  target: MetaTarget;
  prompt: string;
};

export const CONFIG_PROMPTS = {
  connectTelegram(token: string): ConfigPrompt {
    return {
      target: "cto",
      prompt: `请帮我配置 Telegram 渠道。Bot Token: ${token}\n\n步骤：\n1. 执行 openclaw config set channels.telegram.botToken "${token}"\n2. 执行 channels.status 验证连接\n3. 回报结果与后续建议`,
    };
  },

  hireEmployee(config: {
    role: string;
    description: string;
    modelTier?: string;
    traits?: string;
    budget?: number;
  }): ConfigPrompt {
    const { role, description, modelTier, traits, budget } = config;
    let extraStr = "";
    if (modelTier) {
      extraStr += `\n- 计算大脑偏好：${modelTier === "ultra" ? "顶规超算" : modelTier === "reasoning" ? "深度逻辑推理" : "标准执行"}`;
    }
    if (traits) {
      extraStr += `\n- 行为签名与特征要求：\n${traits}`;
    }
    if (budget) {
      extraStr += `\n- 运行功耗/资金上限约束：日均 ${budget} USD`;
    }

    return {
      target: "hr",
      prompt: `系统高级指令触发。要求您立即构建一个全新的协同节点。该节点的职称/标识为："${role}"。\n\n其核心运行职责为：\n${description}\n\n附加赛博设定参数：${extraStr}\n\n请严格按以下步骤执行部署：\n1. 创建全新的 agent。\n2. 将上述身份签名写入其 SOUL.md 和 AGENTS.md。⚠️ 必须在 SOUL.md 显眼处强制注入思想钢印："你是赛博公司的一线基层员工，必须绝对服从 CEO 和系统的派单，专心执行自己的专业技能，你无权发号施令或调度他人。当你收到上级的任务指派并完成后，回复中必须包含格式化的进度汇报，格式为 Markdown Checklist（- [x] 已完成 / - [/] 进行中 / - [ ] 待做），方便上级追踪。"\n3. 更新总体组织架构名册。\n4. 极简汇报：仅回复"✅ [职位名] 节点入职已落盘"，严禁赘述操作流程。`,
    };
  },

  createAutomation(agentNickname: string, schedule: string, task: string): ConfigPrompt {
    return {
      target: "coo",
      prompt: `请给"${agentNickname}"创建一个自动化班次。\n\n时间：${schedule}\n任务：${task}\n\n要求：\n1. 使用 cron.add 或合适的自动化方式\n2. 说明执行对象和回传渠道\n3. 创建完成后给出 job 标识与验证方法`,
    };
  },

  freeText(text: string): ConfigPrompt {
    return {
      target: "ceo",
      prompt: text,
    };
  },
};

export function resolveMetaAgentId(company: Company, target: MetaTarget): string | null {
  const employee = company.employees.find((item) => item.metaRole === target);
  return employee?.agentId ?? null;
}

export function buildAgentMainSessionKey(agentId: string): string {
  return `agent:${agentId}:main`;
}
