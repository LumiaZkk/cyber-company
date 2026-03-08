import { gateway } from '../backend';
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
  localStorage.setItem(ACTIVE_COMPANY_KEY, companyId.trim());
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

function findCompanyById(config: CyberCompanyConfig, companyId: string): Company | null {
  return config.companies.find((company) => company.id === companyId) ?? null;
}

function resolveCompanyCeoAgentId(company: Company): string | null {
  const ceo = company.employees.find((employee) => employee.metaRole === 'ceo');
  return ceo?.agentId ?? null;
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
  if (ownerFromStorage) {
    return ownerFromStorage;
  }

  const ownerFromConfig = resolveOwnerFromConfig(config);
  if (ownerFromConfig) {
    return ownerFromConfig;
  }

  try {
    const { agents } = await gateway.listAgents();
    const firstCeo = agents.find((agent) => isCeoAgentCandidate(agent));
    return firstCeo?.id ?? null;
  } catch {
    return null;
  }
}

export async function saveCompanyConfig(config: CyberCompanyConfig): Promise<boolean> {
  if (!gateway.isConnected || !config.activeCompanyId) {
    return false;
  }

  let ownerAgentId: string | null = null;

  try {
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

export function clearConfigCache() {
  localStorage.removeItem(CACHE_KEY);
  localStorage.removeItem(CONFIG_OWNER_KEY);
  clearPersistedActiveCompanyId();
}
