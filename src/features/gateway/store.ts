import { create } from 'zustand';
import {
  gateway,
  buildProviderManifest,
  getActiveBackendCapabilities,
  type BackendHello,
  getActiveBackendProvider,
  getActiveBackendProviderId,
  listBackendProviders,
  setActiveBackendProvider,
  type BackendCapabilities,
  type BackendProviderMeta,
  type ProviderManifest,
} from '../backend';
import {
  normalizeConnectError,
  type NormalizedConnectError,
} from './connect-errors';

const BACKEND_PROVIDER_KEY = 'cyber_company_backend_provider';
const GATEWAY_CONNECTED_ONCE_KEY = 'cyber_company_gateway_connected_once';
const GATEWAY_MODELS_VERSION_KEY = 'cyber_company_gateway_models_version';
const MAX_RECONNECT_ATTEMPTS = 3;
const LEGACY_GATEWAY_CONFIG_KEY = 'cyber_company_gateway_config';

function providerUrlKey(providerId: string) {
  return `cyber_company_backend_url__${providerId}`;
}

function providerTokenKey(providerId: string) {
  return `cyber_company_backend_token__${providerId}`;
}

function loadStoredValue(key: string, fallback: string): string {
  const value = localStorage.getItem(key);
  if (!value) {
    return fallback;
  }
  return value;
}

function loadStoredProviderId(): string {
  const stored = localStorage.getItem(BACKEND_PROVIDER_KEY);
  if (stored && stored.trim().length > 0) {
    return stored;
  }

  const legacyConfig = loadLegacyGatewayConfig();
  if (legacyConfig?.providerId) {
    return legacyConfig.providerId;
  }

  return getActiveBackendProviderId();
}

function loadLegacyGatewayConfig():
  | { providerId: string; url: string; token: string }
  | null {
  const raw = localStorage.getItem(LEGACY_GATEWAY_CONFIG_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<{
      providerId: string;
      url: string;
      token: string;
    }>;
    if (typeof parsed.url !== 'string' || parsed.url.trim().length === 0) {
      return null;
    }
    return {
      providerId:
        typeof parsed.providerId === 'string' && parsed.providerId.trim().length > 0
          ? parsed.providerId.trim()
          : getActiveBackendProviderId(),
      url: parsed.url.trim(),
      token: typeof parsed.token === 'string' ? parsed.token.trim() : '',
    };
  } catch {
    return null;
  }
}

function migrateLegacyGatewayConfig(providerId: string) {
  const legacyConfig = loadLegacyGatewayConfig();
  if (!legacyConfig || legacyConfig.providerId !== providerId) {
    return;
  }

  localStorage.setItem(BACKEND_PROVIDER_KEY, providerId);
  if (!localStorage.getItem(providerUrlKey(providerId))) {
    localStorage.setItem(providerUrlKey(providerId), legacyConfig.url);
  }
  if (!localStorage.getItem(providerTokenKey(providerId))) {
    localStorage.setItem(providerTokenKey(providerId), legacyConfig.token);
  }
  if (legacyConfig.url) {
    localStorage.setItem(GATEWAY_CONNECTED_ONCE_KEY, '1');
  }
}

function loadStoredProviderUrl(providerId: string, fallback: string): string {
  const direct = loadStoredValue(providerUrlKey(providerId), '');
  if (direct) {
    return direct;
  }
  const legacyConfig = loadLegacyGatewayConfig();
  if (legacyConfig?.providerId === providerId && legacyConfig.url) {
    return legacyConfig.url;
  }
  return fallback;
}

function loadStoredProviderToken(providerId: string): string {
  const direct = loadStoredValue(providerTokenKey(providerId), '');
  if (direct) {
    return direct;
  }
  const legacyConfig = loadLegacyGatewayConfig();
  if (legacyConfig?.providerId === providerId) {
    return legacyConfig.token;
  }
  return '';
}

function loadStoredNumber(key: string, fallback: number): number {
  const value = localStorage.getItem(key);
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

interface GatewayState {
  providerId: string;
  providers: BackendProviderMeta[];
  capabilities: BackendCapabilities;
  manifest: ProviderManifest;
  url: string;
  token: string;
  connected: boolean;
  connecting: boolean;
  hello: BackendHello | null;
  hasEverConnected: boolean;
  phase: 'never' | 'connecting' | 'connected' | 'reconnecting' | 'offline' | 'failed';
  reconnectAttempts: number;
  lastCloseReason: string | null;
  autoReconnect: boolean;
  autoConnectInitialized: boolean;
  error: string | null;
  connectError: NormalizedConnectError | null;
  modelsVersion: number;
  setProvider: (providerId: string) => void;
  connect: (url: string, token?: string) => void;
  disconnect: () => void;
  bootstrapAutoConnect: () => void;
  markModelsRefreshed: (version?: number) => number;
}

export const useGatewayStore = create<GatewayState>((set) => {
  const refreshCapabilities = async () => {
    try {
      const probed = await gateway.probeCapabilities();
      set({
        providerId: gateway.providerId,
        capabilities: probed,
        manifest: buildProviderManifest({
          providerId: gateway.providerId,
          capabilities: probed,
        }),
      });
    } catch {
      const fallback = getActiveBackendCapabilities();
      set({
        providerId: gateway.providerId,
        capabilities: fallback,
        manifest: buildProviderManifest({
          providerId: gateway.providerId,
          capabilities: fallback,
        }),
      });
    }
  };

  gateway.onHello((hello) => {
    const capabilities = getActiveBackendCapabilities();
    localStorage.setItem(GATEWAY_CONNECTED_ONCE_KEY, '1');
    set({
      providerId: gateway.providerId,
      capabilities,
      manifest: buildProviderManifest({
        providerId: gateway.providerId,
        capabilities,
      }),
      connected: true,
      connecting: false,
      hello,
      error: null,
      hasEverConnected: true,
      phase: 'connected',
      reconnectAttempts: 0,
      lastCloseReason: null,
      autoReconnect: true,
      connectError: null,
    });
    void refreshCapabilities();
  });

  gateway.onClose((info) => {
    const snapshot = useGatewayStore.getState();
    const capabilities = getActiveBackendCapabilities();
    const reconnectAttempts = snapshot.autoReconnect ? snapshot.reconnectAttempts + 1 : snapshot.reconnectAttempts;
    const reachedRetryLimit = snapshot.autoReconnect && reconnectAttempts >= MAX_RECONNECT_ATTEMPTS;
    const connectError = normalizeConnectError({
      code: info.code,
      reason: info.reason,
      error: info.error,
      hadToken: snapshot.token.trim().length > 0,
    });

    if (reachedRetryLimit) {
      gateway.disconnect();
    }

    set({
      connected: false,
      connecting: snapshot.autoReconnect && !reachedRetryLimit,
      capabilities,
      manifest: buildProviderManifest({
        providerId: gateway.providerId,
        capabilities,
      }),
      hello: null,
      phase: reachedRetryLimit ? 'failed' : snapshot.autoReconnect ? 'reconnecting' : 'offline',
      reconnectAttempts,
      lastCloseReason: info.reason || null,
      autoReconnect: snapshot.autoReconnect && !reachedRetryLimit,
      connectError,
      error: reachedRetryLimit
        ? `${connectError.title}: ${connectError.message}`
        : connectError.message,
    });
  });

  const initialProviderId = loadStoredProviderId();
  setActiveBackendProvider(initialProviderId);
  const initialProvider = getActiveBackendProvider();
  migrateLegacyGatewayConfig(initialProvider.id);
  const hasEverConnected =
    localStorage.getItem(GATEWAY_CONNECTED_ONCE_KEY) === '1' ||
    Boolean(loadLegacyGatewayConfig()?.url);
  const initialModelsVersion = loadStoredNumber(GATEWAY_MODELS_VERSION_KEY, 0);

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (event) => {
      if (event.key !== GATEWAY_MODELS_VERSION_KEY) {
        return;
      }
      set({ modelsVersion: loadStoredNumber(GATEWAY_MODELS_VERSION_KEY, 0) });
    });
  }

  return {
    providerId: initialProvider.id,
    providers: listBackendProviders(),
    capabilities: getActiveBackendCapabilities(),
    manifest: buildProviderManifest({
      providerId: initialProvider.id,
      capabilities: getActiveBackendCapabilities(),
    }),
    url: loadStoredProviderUrl(initialProvider.id, initialProvider.defaultUrl),
    token: loadStoredProviderToken(initialProvider.id),
    connected: false,
    connecting: false,
    hello: null,
    hasEverConnected,
    phase: hasEverConnected ? 'offline' : 'never',
    reconnectAttempts: 0,
    lastCloseReason: null,
    autoReconnect: false,
    autoConnectInitialized: false,
    error: null,
    connectError: null,
    modelsVersion: initialModelsVersion,

    setProvider: (providerId: string) => {
      const nextProvider = listBackendProviders().find((provider) => provider.id === providerId);
      if (!nextProvider || nextProvider.id === useGatewayStore.getState().providerId) {
        return;
      }

      localStorage.setItem(BACKEND_PROVIDER_KEY, nextProvider.id);
      setActiveBackendProvider(nextProvider.id);
      const activeProvider = getActiveBackendProvider();

      set({
        providerId: activeProvider.id,
        providers: listBackendProviders(),
        capabilities: getActiveBackendCapabilities(),
        manifest: buildProviderManifest({
          providerId: activeProvider.id,
          capabilities: getActiveBackendCapabilities(),
        }),
        url: loadStoredProviderUrl(activeProvider.id, activeProvider.defaultUrl),
        token: loadStoredProviderToken(activeProvider.id),
        connected: false,
        connecting: false,
        hello: null,
        phase: 'offline',
        reconnectAttempts: 0,
        lastCloseReason: null,
        autoReconnect: false,
        error: null,
        connectError: null,
      });
      void refreshCapabilities();
    },
    
    connect: (url: string, token?: string) => {
      const normalizedUrl = url.trim();
      const normalizedToken = (token || '').trim();
      const snapshot = useGatewayStore.getState();
      localStorage.setItem(BACKEND_PROVIDER_KEY, snapshot.providerId);
      localStorage.setItem(providerUrlKey(snapshot.providerId), normalizedUrl);
      localStorage.setItem(providerTokenKey(snapshot.providerId), normalizedToken);
      set((state) => ({
        providerId: gateway.providerId,
        url: normalizedUrl,
        token: normalizedToken,
        manifest: buildProviderManifest({
          providerId: gateway.providerId,
          capabilities: state.capabilities,
        }),
        connected: false,
        connecting: true,
        phase: state.hasEverConnected ? 'reconnecting' : 'connecting',
        reconnectAttempts: 0,
        autoReconnect: true,
        error: null,
        connectError: null,
      }));
      gateway.connect(normalizedUrl, normalizedToken);
    },

    disconnect: () => {
      gateway.disconnect();
      set({
        providerId: gateway.providerId,
        capabilities: getActiveBackendCapabilities(),
        manifest: buildProviderManifest({
          providerId: gateway.providerId,
          capabilities: getActiveBackendCapabilities(),
        }),
        connected: false,
        connecting: false,
        hello: null,
        phase: 'offline',
        reconnectAttempts: 0,
        lastCloseReason: null,
        autoReconnect: false,
        error: null,
        connectError: null,
      });
    },

    bootstrapAutoConnect: () => {
      set((state) => {
        if (state.autoConnectInitialized) {
          return state;
        }
        return { ...state, autoConnectInitialized: true };
      });

      const snapshot = useGatewayStore.getState();
      if (!snapshot.hasEverConnected || snapshot.connected || snapshot.connecting) {
        return;
      }

      snapshot.connect(snapshot.url, snapshot.token);
    },

    markModelsRefreshed: (version?: number) => {
      const currentVersion = loadStoredNumber(GATEWAY_MODELS_VERSION_KEY, useGatewayStore.getState().modelsVersion);
      const nextVersion = version ?? Math.max(Date.now(), currentVersion + 1);
      localStorage.setItem(GATEWAY_MODELS_VERSION_KEY, String(nextVersion));
      set({ modelsVersion: nextVersion });
      return nextVersion;
    },
  };
});
