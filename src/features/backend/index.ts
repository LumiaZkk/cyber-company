import { backendManager } from "./manager";
import { getBackendProviderDefinition } from "./providers";

export { backendManager };
export const backend = backendManager;
export const gateway = backendManager;
export const listBackendProviders = () => backendManager.listProviders();
export const getActiveBackendProviderId = () => backendManager.providerId;
export const getActiveBackendProvider = () =>
  getBackendProviderDefinition(backendManager.providerId);
export const getActiveBackendCapabilities = () => backendManager.capabilities;
export const setActiveBackendProvider = (providerId: string) =>
  backendManager.setActiveProvider(providerId);

export type * from "./types";
export type * from "./providers";
export * from "./bootstrap";
export * from "./core-adapter";
export * from "./runtime";
export * from "./virtual-actor";
