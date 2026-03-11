import { buildDefaultOrgSettings } from "./autonomy-policy";
import type { Company } from "./types";

export const DEFAULT_MAIN_COMPANY_ID = "system-main-company";
export const DEFAULT_MAIN_COMPANY_NAME = "Meta Company";
export const DEFAULT_MAIN_AGENT_ID = "main";

export function buildDefaultMainCompany(): Company {
  const departmentId = "system-main-department";

  return {
    id: DEFAULT_MAIN_COMPANY_ID,
    name: DEFAULT_MAIN_COMPANY_NAME,
    description: "OpenClaw 默认 main agent 的系统映射入口。",
    icon: "🧠",
    template: "system-main",
    system: {
      reserved: true,
      kind: "openclaw-main",
      mappedAgentId: DEFAULT_MAIN_AGENT_ID,
    },
    orgSettings: buildDefaultOrgSettings({
      autoCalibrate: false,
    }),
    departments: [
      {
        id: departmentId,
        name: "主控台",
        leadAgentId: DEFAULT_MAIN_AGENT_ID,
        kind: "meta",
        color: "slate",
        order: 0,
        missionPolicy: "manager_delegated",
      },
    ],
    employees: [
      {
        agentId: DEFAULT_MAIN_AGENT_ID,
        nickname: "Main",
        role: "OpenClaw Main Agent",
        isMeta: true,
        metaRole: "ceo",
        departmentId,
      },
    ],
    quickPrompts: [],
    createdAt: 0,
  };
}

export function isReservedSystemCompany(company: Company | null | undefined): boolean {
  return Boolean(company?.system?.reserved);
}

export function isDefaultMainCompany(company: Company | null | undefined): boolean {
  return company?.system?.kind === "openclaw-main" || company?.id === DEFAULT_MAIN_COMPANY_ID;
}
