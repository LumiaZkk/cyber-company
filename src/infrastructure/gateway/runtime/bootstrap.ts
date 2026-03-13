import type {
  BackendCapabilities,
  ProviderArchiveStrategy,
  ProviderManifest,
  ProviderRoomStrategy,
  ProviderRuntimeStrategy,
  ProviderStorageStrategy,
} from "./types";

function resolveActorStrategy(capabilities: BackendCapabilities): ProviderRuntimeStrategy {
  if (capabilities.sessionHistory && capabilities.skillsStatus) {
    return "native-multi-actor";
  }
  if (capabilities.sessionHistory) {
    return "virtual-actor";
  }
  return "single-executor";
}

function resolveStorageStrategy(capabilities: BackendCapabilities): ProviderStorageStrategy {
  return capabilities.agentFiles ? "provider-files" : "product-store";
}

function resolveArchiveStrategy(capabilities: BackendCapabilities): ProviderArchiveStrategy {
  return capabilities.sessionArchives ? "provider-archives" : "product-archives";
}

function resolveRoomStrategy(capabilities: BackendCapabilities): ProviderRoomStrategy {
  return capabilities.sessionHistory ? "product-room" : "product-room";
}

export function buildProviderManifest(input: {
  providerId: string;
  capabilities: BackendCapabilities;
}): ProviderManifest {
  const actorStrategy = resolveActorStrategy(input.capabilities);
  const storageStrategy = resolveStorageStrategy(input.capabilities);
  const archiveStrategy = resolveArchiveStrategy(input.capabilities);
  const roomStrategy = resolveRoomStrategy(input.capabilities);
  const notes: string[] = [];

  if (actorStrategy === "virtual-actor") {
    notes.push("后端缺少完整多 agent 语义，系统将使用虚拟角色模式。");
  }
  if (storageStrategy === "product-store") {
    notes.push("后端不提供 agent 文件区，交付物将存入产品侧 artifact store。");
  }
  if (archiveStrategy === "product-archives") {
    notes.push("后端不提供归档接口，系统将使用产品侧轮次归档。");
  }
  if (!input.capabilities.sessionStatus && input.capabilities.runtimeObservability) {
    notes.push("后端不提供 session_status，运行态修复将退回 lifecycle/chat 驱动的降级模式。");
  }

  return {
    providerId: input.providerId,
    capabilities: input.capabilities,
    actorStrategy,
    storageStrategy,
    archiveStrategy,
    roomStrategy,
    notes,
  };
}
