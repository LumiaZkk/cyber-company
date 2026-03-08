export type DeviceAuthEntry = {
  token: string;
  scopes: string[];
  updatedAtMs: number;
};

type DeviceAuthStore = {
  version: 1;
  deviceId: string;
  tokens: Record<string, DeviceAuthEntry>;
};

const STORAGE_KEY = "openclaw.device.auth.v1";

function readStore(): DeviceAuthStore | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as DeviceAuthStore;
    if (!parsed || parsed.version !== 1 || typeof parsed.deviceId !== "string" || !parsed.tokens) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeStore(store: DeviceAuthStore) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // best-effort cache only
  }
}

export function loadDeviceAuthToken(params: {
  deviceId: string;
  role: string;
}): DeviceAuthEntry | null {
  const store = readStore();
  if (!store || store.deviceId !== params.deviceId) {
    return null;
  }
  return store.tokens[params.role] ?? null;
}

export function storeDeviceAuthToken(params: {
  deviceId: string;
  role: string;
  token: string;
  scopes?: string[];
}): DeviceAuthEntry {
  const nextStore = readStore();
  const store: DeviceAuthStore =
    nextStore && nextStore.deviceId === params.deviceId
      ? nextStore
      : { version: 1, deviceId: params.deviceId, tokens: {} };
  const entry: DeviceAuthEntry = {
    token: params.token,
    scopes: params.scopes ?? [],
    updatedAtMs: Date.now(),
  };
  store.tokens[params.role] = entry;
  writeStore(store);
  return entry;
}

export function clearDeviceAuthToken(params: { deviceId: string; role: string }) {
  const store = readStore();
  if (!store || store.deviceId !== params.deviceId) {
    return;
  }
  delete store.tokens[params.role];
  writeStore(store);
}
