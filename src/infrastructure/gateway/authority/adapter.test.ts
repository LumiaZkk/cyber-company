import { describe, expect, it } from "vitest";
import { resolveAuthorityBackendCapabilities } from "./adapter";

describe("authority backend adapter capability snapshot", () => {
  it("keeps optimistic authority defaults before executor capability is known", () => {
    const capabilities = resolveAuthorityBackendCapabilities(null);

    expect(capabilities.sessionStatus).toBe(true);
    expect(capabilities.processRuntime).toBe(false);
    expect(capabilities.agentFiles).toBe(true);
  });

  it("disables session status when authority reports unsupported executor capability", () => {
    const capabilities = resolveAuthorityBackendCapabilities({
      sessionStatus: "unsupported",
      processRuntime: "unsupported",
      notes: [
        "下游执行器不提供 session_status，Authority 会退回 lifecycle/chat 驱动的运行态修复。",
      ],
    });

    expect(capabilities.sessionStatus).toBe(false);
    expect(capabilities.processRuntime).toBe(false);
    expect(capabilities.runtimeObservability).toBe(true);
  });

  it("re-enables session status once authority confirms native support", () => {
    const capabilities = resolveAuthorityBackendCapabilities({
      sessionStatus: "supported",
      processRuntime: "unsupported",
      notes: [],
    });

    expect(capabilities.sessionStatus).toBe(true);
    expect(capabilities.processRuntime).toBe(false);
  });
});
