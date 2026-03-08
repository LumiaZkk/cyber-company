import { getDefaultGatewayUrl } from "../../lib/utils";
import { createAgentBackendFromCore } from "./core-adapter";
import { openClawBackend } from "./openclaw-adapter";
import type { AgentBackend, BackendCore } from "./types";

export type BackendProviderMeta = {
  id: string;
  label: string;
  description: string;
  urlLabel: string;
  tokenLabel: string;
  tokenOptional: boolean;
  defaultUrl: string;
  tokenPlaceholder: string;
  connectHint: string;
};

export type BackendProviderDefinition = BackendProviderMeta & {
  backend: AgentBackend;
};

export function createBackendProviderFromCore(
  meta: BackendProviderMeta,
  core: BackendCore,
): BackendProviderDefinition {
  return {
    ...meta,
    backend: createAgentBackendFromCore(core),
  };
}

export const backendProviders: BackendProviderDefinition[] = [
  {
    id: "openclaw",
    label: "OpenClaw",
    description: "通过 OpenClaw Gateway 连接多 Agent 运行时。",
    urlLabel: "Gateway 地址",
    tokenLabel: "访问令牌",
    tokenOptional: true,
    defaultUrl: getDefaultGatewayUrl(),
    tokenPlaceholder: "本地启动时通常可以留空",
    connectHint: "openclaw serve",
    backend: openClawBackend,
  },
];

export function getDefaultBackendProviderId(): string {
  return backendProviders[0]?.id ?? "openclaw";
}

export function getBackendProviderDefinition(providerId: string): BackendProviderDefinition {
  return (
    backendProviders.find((provider) => provider.id === providerId)
    ?? backendProviders[0]
  );
}

export function listBackendProviderMeta(): BackendProviderMeta[] {
  return backendProviders.map(({ backend: _backend, ...provider }) => provider);
}
