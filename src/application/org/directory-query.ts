import { useEffect, useMemo, useState } from "react";
import { buildOrgAdvisorSnapshot } from "../../application/assignment/org-fit";
import {
  mapAgentRuntimeAvailabilityToLegacyStatus,
  type AgentSessionRecord,
  type AgentRuntimeRecord,
} from "../../application/agent-runtime";
import {
  gateway,
  type AgentListEntry,
  type GatewaySessionRow,
  useGatewayStore,
} from "../../application/gateway";
import { buildEmployeeOperationalInsights } from "../../application/governance/company-insights";
import type { Company, Department } from "../../domain/org/types";
import { resolveOrgIssues } from "../../domain/org/policies";
import { isSessionActive, resolveSessionActorId, resolveSessionUpdatedAt } from "../../lib/sessions";
import { useOrgQuery } from "./index";

export type AgentFileRow = Awaited<ReturnType<typeof gateway.listAgentFiles>>["files"][number];
export type AgentFileWorkspace = { workspace: string; files: AgentFileRow[] };
type EmployeeInsight = ReturnType<typeof buildEmployeeOperationalInsights>[number];
export type DirectoryEmployeeInsight = EmployeeInsight;

export type DirectoryEmployeeRow = Company["employees"][number] & {
  lastActive: number;
  lastActiveAt: number;
  realName: string;
  sessionCount: number;
  skills: string[];
  status: "running" | "idle" | "stopped";
  workspace: string;
};

export type ParsedDirectorySession = GatewaySessionRow & { agentId: string };

const EMPTY_DIRECTORY_SURFACE = {
  balancedEmployees: [],
  departments: [] as Department[],
  employeeInsights: [],
  employeesData: [] as DirectoryEmployeeRow[],
  fragileEmployees: [],
  insightByAgentId: new Map<string, EmployeeInsight>(),
  orgAdvisor: null,
  orgIssueCount: 0,
  orgIssues: [],
  overloadedEmployees: [],
  parsedSessions: [] as ParsedDirectorySession[],
};

type BuildEmployeeDirectorySurfaceInput = {
  activeAgentSessions: AgentSessionRecord[];
  activeAgentRuntime: AgentRuntimeRecord[];
  agents: AgentListEntry[];
  company: Company;
  currentTime: number;
  sessions: GatewaySessionRow[];
};

export function buildEmployeeDirectorySurface({
  activeAgentSessions,
  activeAgentRuntime,
  agents,
  company,
  currentTime,
  sessions,
}: BuildEmployeeDirectorySurfaceInput) {
  const departments: Department[] = Array.isArray(company.departments) ? company.departments : [];
  const orgIssues = resolveOrgIssues({ employees: company.employees });
  const orgAdvisor = buildOrgAdvisorSnapshot(company);
  const parsedSessions = sessions
    .map((session) => ({ ...session, agentId: resolveSessionActorId(session) }))
    .filter((session): session is ParsedDirectorySession => {
      return typeof session.agentId === "string";
    });

  const employeeInsights = buildEmployeeOperationalInsights({
    company,
    sessions: parsedSessions,
    activeAgentRuntime,
    now: currentTime,
  });
  const runtimeByAgentId = new Map(activeAgentRuntime.map((runtime) => [runtime.agentId, runtime]));
  const sessionRuntimeByKey = new Map(
    activeAgentSessions.map((session) => [session.sessionKey, session] as const),
  );

  const employeesData: DirectoryEmployeeRow[] = company.employees.map((employee) => {
    const liveAgent = agents.find((agent) => agent.id === employee.agentId);
    const employeeSessions = parsedSessions.filter((session) => session.agentId === employee.agentId);
    const agentRuntime = runtimeByAgentId.get(employee.agentId) ?? null;
    const lastActive = employeeSessions.reduce((latest, session) => {
      return Math.max(latest, resolveSessionUpdatedAt(session));
    }, 0);
    const runtimeLastActive = Math.max(
      agentRuntime?.lastSeenAt ?? 0,
      agentRuntime?.lastBusyAt ?? 0,
      agentRuntime?.lastIdleAt ?? 0,
    );
    const status = agentRuntime
      ? mapAgentRuntimeAvailabilityToLegacyStatus(agentRuntime.availability)
      : (employeeSessions.some((session) => {
          const sessionRuntime = sessionRuntimeByKey.get(session.key);
          if (sessionRuntime) {
            return sessionRuntime.sessionState === "running" || sessionRuntime.sessionState === "streaming";
          }
          return isSessionActive(session, currentTime);
        })
          ? "running"
          : Math.max(lastActive, runtimeLastActive) > 0 || Boolean(liveAgent)
            ? "idle"
            : "stopped");

    const employeeSkills =
      "skills" in employee && Array.isArray((employee as { skills?: unknown }).skills)
        ? ((employee as { skills: string[] }).skills ?? [])
        : [];

    return {
      ...employee,
      lastActive: Math.max(lastActive, runtimeLastActive),
      lastActiveAt: Math.max(lastActive, runtimeLastActive),
      realName: liveAgent?.name || employee.nickname,
      sessionCount: employeeSessions.length,
      skills: liveAgent?.identity?.theme ? [] : employeeSkills,
      status,
      workspace: "N/A",
    };
  });

  const insightByAgentId = new Map(employeeInsights.map((insight) => [insight.agentId, insight]));
  const overloadedEmployees = employeeInsights.filter((insight) => insight.loadState === "overloaded");
  const fragileEmployees = employeeInsights.filter((insight) => insight.reliabilityState === "fragile");
  const balancedEmployees = employeeInsights.filter((insight) => insight.loadState === "balanced");

  return {
    balancedEmployees,
    departments,
    employeeInsights,
    employeesData,
    fragileEmployees,
    insightByAgentId,
    orgAdvisor,
    orgIssueCount: orgIssues.length,
    orgIssues,
    overloadedEmployees,
    parsedSessions,
  };
}

export function useOrgDirectoryQuery() {
  const { activeCompany, activeAgentSessions, activeAgentRuntime } = useOrgQuery();
  const supportsAgentFiles = useGatewayStore((state) => state.capabilities.agentFiles);
  const manifest = useGatewayStore((state) => state.manifest);
  const [agents, setAgents] = useState<AgentListEntry[]>([]);
  const [sessions, setSessions] = useState<GatewaySessionRow[]>([]);
  const [agentFiles, setAgentFiles] = useState<Record<string, AgentFileWorkspace>>({});
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  useEffect(() => {
    async function loadData() {
      if (!gateway.isConnected) {
        return;
      }
      try {
        const [agentsResponse, sessionsResponse] = await Promise.all([
          gateway.listAgents(),
          gateway.listSessions(),
        ]);

        const nextAgents = agentsResponse.agents || [];
        setAgents(nextAgents);
        setSessions(sessionsResponse.sessions || []);

        if (nextAgents.length > 0 && supportsAgentFiles) {
          const filesMap: Record<string, AgentFileWorkspace> = {};
          await Promise.all(
            nextAgents.map(async (agent) => {
              try {
                const response = await gateway.listAgentFiles(agent.id);
                filesMap[agent.id] = {
                  workspace: response.workspace,
                  files: response.files || [],
                };
              } catch {
                // Keep the rest of the runtime visible even if one workspace cannot be listed.
              }
            }),
          );
          setAgentFiles(filesMap);
        } else if (!supportsAgentFiles) {
          setAgentFiles({});
        }
      } catch (error) {
        console.error("Failed to load employee directory runtime", error);
      }
    }

    void loadData();
    const timer = window.setInterval(() => {
      void loadData();
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [activeCompany?.id, supportsAgentFiles]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentTime(Date.now());
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const directorySurface = useMemo(() => {
    if (!activeCompany) {
      return EMPTY_DIRECTORY_SURFACE;
    }
    return buildEmployeeDirectorySurface({
      activeAgentSessions,
      activeAgentRuntime,
      agents,
      company: activeCompany,
      currentTime,
      sessions,
    });
  }, [activeAgentRuntime, activeAgentSessions, activeCompany, agents, currentTime, sessions]);

  return {
    activeCompany,
    agentFiles,
    agents,
    currentTime,
    manifest,
    sessions,
    supportsAgentFiles,
    ...directorySurface,
  };
}
