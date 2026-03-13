import { describe, expect, it } from "vitest";
import { buildAuthorityExecutorReadinessChecks } from "./executor-readiness";
import type {
  AuthorityExecutorCapabilitySnapshot,
  AuthorityExecutorConfig,
  AuthorityExecutorStatus,
} from "./contract";

function createExecutorStatus(
  overrides: Partial<AuthorityExecutorStatus> = {},
): AuthorityExecutorStatus {
  return {
    adapter: "openclaw-bridge",
    state: "ready",
    provider: "openclaw",
    note: "Authority 已接入 OpenClaw。",
    ...overrides,
  };
}

function createExecutorConfig(
  overrides: Partial<AuthorityExecutorConfig> = {},
): AuthorityExecutorConfig {
  return {
    type: "openclaw",
    openclaw: {
      url: "ws://localhost:18789",
      tokenConfigured: true,
    },
    connectionState: "ready",
    lastError: null,
    lastConnectedAt: 1_000,
    ...overrides,
  };
}

function createCapabilitySnapshot(
  overrides: Partial<AuthorityExecutorCapabilitySnapshot> = {},
): AuthorityExecutorCapabilitySnapshot {
  return {
    sessionStatus: "supported",
    processRuntime: "unsupported",
    notes: [],
    ...overrides,
  };
}

describe("authority executor readiness checks", () => {
  it("marks the happy path as ready except unsupported optional process runtime", () => {
    const checks = buildAuthorityExecutorReadinessChecks({
      executor: createExecutorStatus(),
      executorConfig: createExecutorConfig(),
      executorCapabilities: createCapabilitySnapshot(),
    });

    expect(checks.find((check) => check.id === "connection")?.state).toBe("ready");
    expect(checks.find((check) => check.id === "auth")?.state).toBe("ready");
    expect(checks.find((check) => check.id === "session-status")?.state).toBe("ready");
    expect(checks.find((check) => check.id === "agent-files")?.state).toBe("ready");
    expect(checks.find((check) => check.id === "process-runtime")?.state).toBe("degraded");
  });

  it("surfaces missing token and unsupported session status as readiness issues", () => {
    const checks = buildAuthorityExecutorReadinessChecks({
      executor: createExecutorStatus({
        state: "degraded",
        provider: "none",
        note: "Authority 尚未接入 OpenClaw。",
      }),
      executorConfig: createExecutorConfig({
        openclaw: {
          url: "ws://localhost:18789",
          tokenConfigured: false,
        },
        connectionState: "degraded",
      }),
      executorCapabilities: createCapabilitySnapshot({
        sessionStatus: "unsupported",
      }),
    });

    expect(checks.find((check) => check.id === "auth")?.state).toBe("degraded");
    expect(checks.find((check) => check.id === "session-status")?.summary).toContain("不支持 session_status");
    expect(checks.find((check) => check.id === "agent-files")?.state).toBe("degraded");
  });

  it("blocks readiness when the executor is blocked and capabilities are still unknown", () => {
    const checks = buildAuthorityExecutorReadinessChecks({
      executor: createExecutorStatus({
        state: "blocked",
        provider: "none",
        note: "OpenClaw 地址未配置。",
      }),
      executorConfig: createExecutorConfig({
        openclaw: {
          url: "",
          tokenConfigured: false,
        },
        connectionState: "blocked",
      }),
      executorCapabilities: createCapabilitySnapshot({
        sessionStatus: "unknown",
        processRuntime: "unknown",
      }),
    });

    expect(checks.find((check) => check.id === "connection")?.state).toBe("blocked");
    expect(checks.find((check) => check.id === "auth")?.state).toBe("blocked");
    expect(checks.find((check) => check.id === "session-status")?.state).toBe("blocked");
    expect(checks.find((check) => check.id === "agent-files")?.state).toBe("blocked");
  });
});
