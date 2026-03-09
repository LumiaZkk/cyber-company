import { gateway } from '../backend';
import {
  buildCeoOperationsGuide,
  buildCompanyContextSnapshot,
  CEO_OPERATIONS_FILE_NAME,
  COMPANY_CONTEXT_FILE_NAME,
} from './agent-context';
import { clearConversationMissionRecords } from './mission-persistence';
import { clearConversationStateRecords } from './conversation-state-persistence';
import { clearRoundRecords } from './round-persistence';
import { clearArtifactRecords } from './artifact-persistence';
import { clearDispatchRecords } from './dispatch-persistence';
import { clearRequirementRoomRecords } from './room-persistence';
import { clearRoomConversationBindings } from './room-binding-persistence';
import { clearWorkItemRecords } from './work-item-persistence';
import { clearCompanyRuntimeSnapshot } from '../runtime/company-runtime';
import { generateCeoSoul } from '../employee/meta-agents';
import type { CyberCompanyConfig, Company } from './types';

const CONFIG_FILE_NAME = 'company-config.json';
const CACHE_KEY = 'cyber_company_config';
const CONFIG_OWNER_KEY = 'cyber_company_config_owner';
const ACTIVE_COMPANY_KEY = 'cyber_company_active_company_id';
let remoteConfigPersistenceDisabled = false;
let remoteConfigPersistenceWarningShown = false;

function readCachedConfig(): CyberCompanyConfig | null {
  const cached = localStorage.getItem(CACHE_KEY);
  if (!cached) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(cached);
    return isCyberCompanyConfig(parsed) ? normalizeActiveCompanySelection(parsed) : null;
  } catch {
    return null;
  }
}

export function peekCachedCompanyConfig(): CyberCompanyConfig | null {
  return readCachedConfig();
}

function cacheConfig(config: CyberCompanyConfig) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(config));
}

function persistConfigLocally(config: CyberCompanyConfig, ownerAgentId?: string | null) {
  cacheConfig(config);
  if (ownerAgentId) {
    setConfigOwnerAgentId(ownerAgentId);
  }
  setPersistedActiveCompanyId(config.activeCompanyId);
}

export function getPersistedActiveCompanyId(): string | null {
  const value = localStorage.getItem(ACTIVE_COMPANY_KEY);
  return value && value.trim().length > 0 ? value.trim() : null;
}

export function setPersistedActiveCompanyId(companyId: string) {
  const normalized = companyId.trim();
  if (!normalized) {
    clearPersistedActiveCompanyId();
    return;
  }
  localStorage.setItem(ACTIVE_COMPANY_KEY, normalized);
}

export function clearPersistedActiveCompanyId() {
  localStorage.removeItem(ACTIVE_COMPANY_KEY);
}

export function getConfigOwnerAgentId(): string | null {
  const value = localStorage.getItem(CONFIG_OWNER_KEY);
  return value && value.trim().length > 0 ? value.trim() : null;
}

export function setConfigOwnerAgentId(agentId: string) {
  localStorage.setItem(CONFIG_OWNER_KEY, agentId.trim());
}

export function clearConfigOwnerAgentId() {
  localStorage.removeItem(CONFIG_OWNER_KEY);
}

function findCompanyById(config: CyberCompanyConfig, companyId: string): Company | null {
  return config.companies.find((company) => company.id === companyId) ?? null;
}

function resolveCompanyCeoAgentId(company: Company): string | null {
  const ceo = company.employees.find((employee) => employee.metaRole === 'ceo');
  return ceo?.agentId ?? null;
}

function collectCompanyAgentIds(company: Company): Set<string> {
  return new Set(
    company.employees
      .map((employee) => employee.agentId?.trim() ?? '')
      .filter((agentId) => agentId.length > 0),
  );
}

function collectConfigAgentIds(config: CyberCompanyConfig): Set<string> {
  const agentIds = new Set<string>();
  config.companies.forEach((company) => {
    collectCompanyAgentIds(company).forEach((agentId) => {
      agentIds.add(agentId);
    });
  });
  return agentIds;
}

function isCyberCompanyConfig(value: unknown): value is CyberCompanyConfig {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<CyberCompanyConfig>;
  return (
    candidate.version === 1
    && Array.isArray(candidate.companies)
    && typeof candidate.activeCompanyId === 'string'
    && Boolean(candidate.preferences)
  );
}

function parseConfigContent(content: string | undefined): CyberCompanyConfig | null {
  if (!content || content.trim().length === 0) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(content);
    return isCyberCompanyConfig(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function resolveOwnerFromConfig(config: CyberCompanyConfig): string | null {
  const activeCompany = findCompanyById(config, config.activeCompanyId);
  const activeCompanyCeo = activeCompany ? resolveCompanyCeoAgentId(activeCompany) : null;
  if (activeCompanyCeo) {
    return activeCompanyCeo;
  }

  for (const company of config.companies) {
    const ceoAgentId = resolveCompanyCeoAgentId(company);
    if (ceoAgentId) {
      return ceoAgentId;
    }
  }

  return null;
}

function collectAvailableAgentIds(agents: Array<{ id?: string }>): Set<string> {
  return new Set(
    agents
      .map((agent) => (typeof agent.id === 'string' ? agent.id.trim() : ''))
      .filter((id) => id.length > 0),
  );
}

function isCeoAgentCandidate(agent: { id?: string; name?: string }) {
  return agent.name?.endsWith('-ceo') || agent.id?.endsWith('-ceo');
}

function isUnsafeConfigWriteError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('unsafe workspace file') && message.includes(CONFIG_FILE_NAME);
}

function normalizeActiveCompanySelection(config: CyberCompanyConfig): CyberCompanyConfig {
  if (config.companies.length === 0) {
    clearPersistedActiveCompanyId();
    return config;
  }

  const persistedActiveCompanyId = getPersistedActiveCompanyId();
  if (persistedActiveCompanyId) {
    const persistedCompany = findCompanyById(config, persistedActiveCompanyId);
    if (persistedCompany) {
      if (config.activeCompanyId === persistedActiveCompanyId) {
        return config;
      }
      return { ...config, activeCompanyId: persistedActiveCompanyId };
    }
    clearPersistedActiveCompanyId();
  }

  const currentActiveCompany = findCompanyById(config, config.activeCompanyId);
  if (currentActiveCompany) {
    setPersistedActiveCompanyId(currentActiveCompany.id);
    return config;
  }

  const fallbackCompanyId = config.companies[0]?.id;
  if (!fallbackCompanyId) {
    clearPersistedActiveCompanyId();
    return config;
  }

  setPersistedActiveCompanyId(fallbackCompanyId);
  return { ...config, activeCompanyId: fallbackCompanyId };
}

/**
 * Loads the company configuration from the currently connected Gateway.
 * It looks for the CEO agent and reads its company-config.json
 */
export async function loadCompanyConfig(): Promise<CyberCompanyConfig | null> {
  if (!gateway.isConnected) {
    return readCachedConfig();
  }

  try {
    const ownerAgentId = getConfigOwnerAgentId();
    const { agents } = await gateway.listAgents();

    const ceoAgentIds = agents
      .filter((agent) => isCeoAgentCandidate(agent))
      .map((agent) => agent.id);

    const candidateOwnerIds = ownerAgentId
      ? [ownerAgentId, ...ceoAgentIds.filter((id) => id !== ownerAgentId)]
      : ceoAgentIds;

    for (const candidateOwnerId of candidateOwnerIds) {
      try {
        const result = await gateway.getAgentFile(candidateOwnerId, CONFIG_FILE_NAME);
        const config = parseConfigContent(result.file.content);
        if (!config) {
          continue;
        }

        const normalizedConfig = normalizeActiveCompanySelection(config);
        try {
          await syncCompanyCeoContextFiles(normalizedConfig, collectAvailableAgentIds(agents));
        } catch (syncError) {
          console.warn('Failed to sync CEO context files during config load', syncError);
        }
        cacheConfig(normalizedConfig);
        setConfigOwnerAgentId(candidateOwnerId);
        return normalizedConfig;
      } catch {
        continue;
      }
    }

    return readCachedConfig();
  } catch (error) {
    console.error('Failed to load company config from Gateway, checking local cache', error);
    return readCachedConfig();
  }
}

async function resolveConfigOwner(config: CyberCompanyConfig): Promise<string | null> {
  const ownerFromStorage = getConfigOwnerAgentId();
  const ownerFromConfig = resolveOwnerFromConfig(config);

  try {
    const { agents } = await gateway.listAgents();
    const availableAgentIds = collectAvailableAgentIds(agents);
    const agentIdsInConfig = collectConfigAgentIds(config);

    if (
      ownerFromStorage &&
      availableAgentIds.has(ownerFromStorage) &&
      (config.companies.length === 0 || agentIdsInConfig.has(ownerFromStorage))
    ) {
      return ownerFromStorage;
    }

    if (ownerFromConfig && availableAgentIds.has(ownerFromConfig)) {
      return ownerFromConfig;
    }

    const firstCeo = agents.find((agent) => {
      const id = typeof agent.id === "string" ? agent.id.trim() : "";
      return id.length > 0 && isCeoAgentCandidate(agent);
    });
    return firstCeo?.id ?? null;
  } catch {
    return ownerFromStorage ?? ownerFromConfig;
  }
}

function clearLocalCompanyState(companyId: string) {
  clearConversationMissionRecords(companyId);
  clearConversationStateRecords(companyId);
  clearRoundRecords(companyId);
  clearArtifactRecords(companyId);
  clearDispatchRecords(companyId);
  clearRequirementRoomRecords(companyId);
  clearRoomConversationBindings(companyId);
  clearWorkItemRecords(companyId);
  clearCompanyRuntimeSnapshot(companyId);
}

function buildConfigAfterCompanyDeletion(
  currentConfig: CyberCompanyConfig,
  companyId: string,
): { company: Company; nextConfig: CyberCompanyConfig; uniqueAgentIds: string[] } | null {
  const company = findCompanyById(currentConfig, companyId);
  if (!company) {
    return null;
  }

  const remainingCompanies = currentConfig.companies.filter((entry) => entry.id !== companyId);
  const nextActiveCompanyId =
    remainingCompanies.length === 0
      ? ''
      : currentConfig.activeCompanyId !== companyId &&
          remainingCompanies.some((entry) => entry.id === currentConfig.activeCompanyId)
        ? currentConfig.activeCompanyId
        : remainingCompanies[0]?.id ?? '';
  const nextConfig: CyberCompanyConfig = {
    ...currentConfig,
    companies: remainingCompanies,
    activeCompanyId: nextActiveCompanyId,
  };
  const remainingAgentIds = collectConfigAgentIds(nextConfig);
  const uniqueAgentIds = [...collectCompanyAgentIds(company)].filter(
    (agentId) => !remainingAgentIds.has(agentId),
  );

  return { company, nextConfig, uniqueAgentIds };
}

async function cleanupRemoteCompanyAgentResources(
  agentIds: string[],
) {
  if (!gateway.isConnected || agentIds.length === 0) {
    return;
  }
  const failures: string[] = [];
  await Promise.all(
    agentIds.map(async (agentId) => {
      try {
        await gateway.deleteAgent(agentId, { deleteFiles: true, purgeState: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push(`${agentId}: ${message}`);
      }
    }),
  );
  if (failures.length > 0) {
    throw new Error(`Failed to delete company agents: ${failures.join("; ")}`);
  }
}

async function syncCompanyCeoContextFiles(
  config: CyberCompanyConfig,
  availableAgentIds?: Set<string>,
): Promise<void> {
  const knownAgentIds =
    availableAgentIds ??
    collectAvailableAgentIds((await gateway.listAgents()).agents);

  await Promise.all(
    config.companies.map(async (company) => {
      const ceoAgentId = resolveCompanyCeoAgentId(company);
      if (!ceoAgentId || !knownAgentIds.has(ceoAgentId)) {
        return;
      }

      const results = await Promise.allSettled([
        gateway.setAgentFile(ceoAgentId, 'SOUL.md', generateCeoSoul(company.name)),
        gateway.setAgentFile(
          ceoAgentId,
          COMPANY_CONTEXT_FILE_NAME,
          JSON.stringify(buildCompanyContextSnapshot(company), null, 2),
        ),
        gateway.setAgentFile(ceoAgentId, CEO_OPERATIONS_FILE_NAME, buildCeoOperationsGuide(company)),
      ]);

      results.forEach((result) => {
        if (result.status === 'rejected') {
          console.warn(`Failed to sync CEO context files for ${company.name}`, result.reason);
        }
      });
    }),
  );
}

export async function saveCompanyConfig(config: CyberCompanyConfig): Promise<boolean> {
  if (!gateway.isConnected) {
    return false;
  }

  if (config.companies.length > 0 && !config.activeCompanyId) {
    return false;
  }

  let ownerAgentId: string | null = null;
  let availableAgentIds: Set<string> | null = null;

  try {
    try {
      const { agents } = await gateway.listAgents();
      availableAgentIds = collectAvailableAgentIds(agents);
    } catch {
      availableAgentIds = null;
    }

    ownerAgentId = await resolveConfigOwner(config);
    if (!ownerAgentId) {
      console.error('Cannot save config: no owner CEO agent found');
      return false;
    }

    if (remoteConfigPersistenceDisabled) {
      persistConfigLocally(config, ownerAgentId);
      return true;
    }

    await gateway.setAgentFile(ownerAgentId, CONFIG_FILE_NAME, JSON.stringify(config, null, 2));
    await syncCompanyCeoContextFiles(config, availableAgentIds ?? undefined);
    persistConfigLocally(config, ownerAgentId);
    return true;
  } catch (error) {
    if (isUnsafeConfigWriteError(error)) {
      remoteConfigPersistenceDisabled = true;
      persistConfigLocally(config, ownerAgentId);
      if (!remoteConfigPersistenceWarningShown) {
        console.warn(
          `Gateway blocked writing ${CONFIG_FILE_NAME}; falling back to browser-local persistence for this session.`,
        );
        remoteConfigPersistenceWarningShown = true;
      }
      return true;
    }
    console.error('Failed to save company config', error);
    return false;
  }
}

export async function deleteCompanyCascade(
  currentConfig: CyberCompanyConfig,
  companyId: string,
): Promise<CyberCompanyConfig | null> {
  const deletionPlan = buildConfigAfterCompanyDeletion(currentConfig, companyId);
  if (!deletionPlan) {
    return null;
  }

  const { company, nextConfig, uniqueAgentIds } = deletionPlan;
  const fallbackOwnerAgentId =
    resolveOwnerFromConfig(nextConfig) ?? getConfigOwnerAgentId() ?? resolveCompanyCeoAgentId(company);

  if (gateway.isConnected) {
    const saved = await saveCompanyConfig(nextConfig);
    if (!saved) {
      throw new Error('Failed to persist company configuration after deletion');
    }
  } else {
    persistConfigLocally(nextConfig, fallbackOwnerAgentId);
  }

  clearLocalCompanyState(company.id);

  await cleanupRemoteCompanyAgentResources(uniqueAgentIds);

  if (nextConfig.companies.length === 0) {
    clearConfigOwnerAgentId();
  }

  return nextConfig;
}

export function clearConfigCache() {
  localStorage.removeItem(CACHE_KEY);
  clearConfigOwnerAgentId();
  clearPersistedActiveCompanyId();
}
