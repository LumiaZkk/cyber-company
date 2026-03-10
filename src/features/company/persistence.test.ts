import { beforeEach, describe, expect, it, vi } from "vitest";

import { gateway } from "../backend";
import {
  deleteCompanyCascade,
  getConfigOwnerAgentId,
  saveCompanyConfig,
} from "./persistence";
import { readCompanyRuntimeSnapshot, writeCompanyRuntimeSnapshot } from "../runtime/company-runtime";
import type { Company, CyberCompanyConfig } from "./types";

function createCompany(
  id: string,
  name: string,
  employeeAgentIds: Array<{ agentId: string; metaRole?: "ceo" | "hr" | "cto" | "coo"; isMeta?: boolean }>,
): Company {
  return {
    id,
    name,
    description: "",
    icon: "🏢",
    template: "blank",
    employees: employeeAgentIds.map((employee, index) => ({
      agentId: employee.agentId,
      nickname: employee.metaRole?.toUpperCase() ?? `员工${index + 1}`,
      role: employee.metaRole ?? "员工",
      isMeta: employee.isMeta ?? Boolean(employee.metaRole),
      metaRole: employee.metaRole,
    })),
    quickPrompts: [],
    createdAt: id === "company-1" ? 1 : 2,
  };
}

function createConfig(): CyberCompanyConfig {
  return {
    version: 1,
    activeCompanyId: "company-2",
    preferences: { theme: "classic", locale: "zh-CN" },
    companies: [
      createCompany("company-1", "旧公司", [
        { agentId: "old-ceo", metaRole: "ceo" },
        { agentId: "old-hr", metaRole: "hr" },
      ]),
      createCompany("company-2", "新公司", [{ agentId: "new-ceo", metaRole: "ceo" }]),
    ],
  };
}

describe("company persistence", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    vi.restoreAllMocks();

    Object.defineProperty(globalThis, "localStorage", {
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
        removeItem: (key: string) => {
          storage.delete(key);
        },
      },
      configurable: true,
      writable: true,
    });
  });

  it("falls back to the active company CEO when the stored config owner no longer exists", async () => {
    storage.set("cyber_company_config_owner", "missing-ceo");

    vi.spyOn(gateway, "isConnected", "get").mockReturnValue(true);
    vi.spyOn(gateway, "listAgents").mockResolvedValue({
      agents: [
        { id: "old-ceo", name: "old-ceo" },
        { id: "new-ceo", name: "new-ceo" },
        { id: "other-ceo", name: "other-ceo" },
      ],
    } as Awaited<ReturnType<typeof gateway.listAgents>>);
    const setAgentFile = vi.spyOn(gateway, "setAgentFile").mockResolvedValue({
      ok: true,
      agentId: "new-ceo",
      workspace: "~/.openclaw/workspaces/new-ceo",
      file: {
        name: "company-config.json",
        path: "~/.openclaw/workspaces/new-ceo/company-config.json",
        missing: false,
        content: "{}",
      },
    });

    const saved = await saveCompanyConfig(createConfig());

    expect(saved).toBe(true);
    expect(setAgentFile).toHaveBeenCalledWith(
      "new-ceo",
      "company-config.json",
      expect.any(String),
    );
    expect(setAgentFile.mock.calls).toEqual(
      expect.arrayContaining([
        ["new-ceo", "company-context.json", expect.any(String)],
        ["new-ceo", "OPERATIONS.md", expect.any(String)],
        ["new-ceo", "SOUL.md", expect.stringContaining('Role: CEO')],
      ]),
    );
    expect(getConfigOwnerAgentId()).toBe("new-ceo");
  });

  it("deletes company-scoped state and cascades cleanup into unique agent resources", async () => {
    storage.set("cyber_company_config_owner", "old-ceo");
    storage.set("cyber_company_mission_records:company-1", '[{"id":"mission-1"}]');
    storage.set("cyber_company_conversation_state:company-1", '[{"conversationId":"conv-1"}]');
    storage.set("cyber_company_round_records:company-1", '[{"id":"round-1"}]');
    storage.set("cyber_company_artifacts:company-1", '[{"id":"artifact-1"}]');
    storage.set("cyber_company_dispatch_records:company-1", '[{"id":"dispatch-1"}]');
    storage.set("cyber_company_room_records:company-1", '[{"id":"room-1"}]');
    storage.set("cyber_company_room_bindings:company-1", '[{"roomId":"room-1"}]');
    storage.set("cyber_company_work_items:company-1", '[{"id":"work-1"}]');
    writeCompanyRuntimeSnapshot("company-1", { agents: [] });

    vi.spyOn(gateway, "isConnected", "get").mockReturnValue(true);
    vi.spyOn(gateway, "listAgents").mockResolvedValue({
      agents: [
        { id: "old-ceo", name: "old-ceo" },
        { id: "old-hr", name: "old-hr" },
        { id: "new-ceo", name: "new-ceo" },
      ],
    } as Awaited<ReturnType<typeof gateway.listAgents>>);
    const setAgentFile = vi.spyOn(gateway, "setAgentFile").mockResolvedValue({
      ok: true,
      agentId: "new-ceo",
      workspace: "~/.openclaw/workspaces/new-ceo",
      file: {
        name: "company-config.json",
        path: "~/.openclaw/workspaces/new-ceo/company-config.json",
        missing: false,
        content: "{}",
      },
    });
    const deleteAgent = vi.spyOn(gateway, "deleteAgent").mockImplementation(async (agentId) => ({
      ok: true,
      agentId,
      removedSessions: 1,
      removedCronJobs: 1,
    }));
    const removeAgentConfigEntries = vi.spyOn(gateway, "removeAgentConfigEntries").mockResolvedValue({
      updated: 2,
    });

    const result = await deleteCompanyCascade(createConfig(), "company-1");

    expect(result).toMatchObject({
      activeCompanyId: "company-2",
      companies: [{ id: "company-2", name: "新公司" }],
    });
    expect(getConfigOwnerAgentId()).toBe("new-ceo");
    expect(storage.get("cyber_company_mission_records:company-1")).toBeUndefined();
    expect(storage.get("cyber_company_conversation_state:company-1")).toBeUndefined();
    expect(storage.get("cyber_company_round_records:company-1")).toBeUndefined();
    expect(storage.get("cyber_company_artifacts:company-1")).toBeUndefined();
    expect(storage.get("cyber_company_dispatch_records:company-1")).toBeUndefined();
    expect(storage.get("cyber_company_room_records:company-1")).toBeUndefined();
    expect(storage.get("cyber_company_room_bindings:company-1")).toBeUndefined();
    expect(storage.get("cyber_company_work_items:company-1")).toBeUndefined();
    expect(readCompanyRuntimeSnapshot("company-1")).toBeNull();
    expect(deleteAgent).toHaveBeenCalledWith("old-ceo", { deleteFiles: true, purgeState: true });
    expect(deleteAgent).toHaveBeenCalledWith("old-hr", { deleteFiles: true, purgeState: true });
    expect(removeAgentConfigEntries).toHaveBeenCalledWith(["old-ceo", "old-hr"]);
    expect(setAgentFile.mock.calls).toEqual(
      expect.arrayContaining([
        ["new-ceo", "company-config.json", expect.stringContaining('"company-2"')],
        ["new-ceo", "company-context.json", expect.any(String)],
        ["new-ceo", "OPERATIONS.md", expect.any(String)],
        ["new-ceo", "SOUL.md", expect.stringContaining('Role: CEO')],
      ]),
    );
  });

  it("persists an empty config, deletes the final company agents, and clears the stale owner", async () => {
    storage.set("cyber_company_config_owner", "solo-ceo");

    const config: CyberCompanyConfig = {
      version: 1,
      activeCompanyId: "company-1",
      preferences: { theme: "classic", locale: "zh-CN" },
      companies: [
        createCompany("company-1", "独苗公司", [
          { agentId: "solo-ceo", metaRole: "ceo" },
          { agentId: "solo-hr", metaRole: "hr" },
        ]),
      ],
    };

    vi.spyOn(gateway, "isConnected", "get").mockReturnValue(true);
    vi.spyOn(gateway, "listAgents").mockResolvedValue({
      agents: [
        { id: "solo-ceo", name: "solo-ceo" },
        { id: "solo-hr", name: "solo-hr" },
      ],
    } as Awaited<ReturnType<typeof gateway.listAgents>>);
    const setAgentFile = vi.spyOn(gateway, "setAgentFile").mockResolvedValue({
      ok: true,
      agentId: "solo-ceo",
      workspace: "~/.openclaw/workspaces/solo-ceo",
      file: {
        name: "company-config.json",
        path: "~/.openclaw/workspaces/solo-ceo/company-config.json",
        missing: false,
        content: "{}",
      },
    });
    const deleteAgent = vi.spyOn(gateway, "deleteAgent").mockImplementation(async (agentId) => ({
      ok: true,
      agentId,
    }));
    const removeAgentConfigEntries = vi.spyOn(gateway, "removeAgentConfigEntries").mockResolvedValue({
      updated: 2,
    });

    const result = await deleteCompanyCascade(config, "company-1");

    expect(result).toMatchObject({
      activeCompanyId: "",
      companies: [],
    });
    expect(getConfigOwnerAgentId()).toBeNull();
    expect(deleteAgent).toHaveBeenCalledWith("solo-ceo", { deleteFiles: true, purgeState: true });
    expect(deleteAgent).toHaveBeenCalledWith("solo-hr", { deleteFiles: true, purgeState: true });
    expect(removeAgentConfigEntries).toHaveBeenCalledWith(["solo-ceo", "solo-hr"]);
    expect(setAgentFile.mock.calls).toEqual(
      expect.arrayContaining([
        ["solo-ceo", "company-config.json", expect.stringContaining('"companies": []')],
      ]),
    );
  });
});
