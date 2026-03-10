import { describe, expect, it } from "vitest";
import { buildProviderManifest } from "./bootstrap";
import { createBackendCapabilities } from "./types";

describe("backend bootstrap", () => {
  it("keeps a rich backend in native mode", () => {
    const manifest = buildProviderManifest({
      providerId: "openclaw",
      capabilities: createBackendCapabilities({
        sessionHistory: true,
        sessionArchives: true,
        agentFiles: true,
        skillsStatus: true,
      }),
    });

    expect(manifest).toMatchObject({
      providerId: "openclaw",
      actorStrategy: "native-multi-actor",
      storageStrategy: "provider-files",
      archiveStrategy: "provider-archives",
      roomStrategy: "product-room",
    });
    expect(manifest.notes).toEqual([]);
  });

  it("degrades a weak backend into virtual-actor product-owned mode", () => {
    const manifest = buildProviderManifest({
      providerId: "codex-lite",
      capabilities: createBackendCapabilities({
        sessionHistory: true,
        sessionArchives: false,
        agentFiles: false,
        skillsStatus: false,
      }),
    });

    expect(manifest).toMatchObject({
      providerId: "codex-lite",
      actorStrategy: "virtual-actor",
      storageStrategy: "product-store",
      archiveStrategy: "product-archives",
      roomStrategy: "product-room",
    });
    expect(manifest.notes).toEqual([
      "后端缺少完整多 agent 语义，系统将使用虚拟角色模式。",
      "后端不提供 agent 文件区，交付物将存入产品侧 artifact store。",
      "后端不提供归档接口，系统将使用产品侧轮次归档。",
    ]);
  });
});
