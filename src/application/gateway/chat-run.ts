import { gateway } from "./index";

export type GatewayChatRunTerminalState = "final" | "aborted" | "error";

export function waitForGatewayChatRunTerminal(input: {
  providerSessionKey: string;
  runId: string | null;
  timeoutMs?: number;
}): Promise<GatewayChatRunTerminalState> {
  return new Promise((resolve, reject) => {
    const timeoutMs = input.timeoutMs ?? 90_000;
    let settled = false;
    let unsubscribe: (() => void) | null = null;
    let timeoutId = 0;

    const cleanup = () => {
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
      window.clearTimeout(timeoutId);
    };

    const finish = (callback: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      callback();
    };

    timeoutId = window.setTimeout(() => {
      finish(() => {
        reject(new Error("等待模型切换完成超时；主会话可能仍在执行 /model，请稍后重试。"));
      });
    }, timeoutMs);

    unsubscribe = gateway.subscribe("chat", (rawPayload) => {
      if (!rawPayload || typeof rawPayload !== "object") {
        return;
      }

      const payload = rawPayload as Record<string, unknown>;
      const sessionKey =
        typeof payload.sessionKey === "string" ? payload.sessionKey.trim() : "";
      const state = typeof payload.state === "string" ? payload.state : "";
      const payloadRunId =
        typeof payload.runId === "string" && payload.runId.trim().length > 0
          ? payload.runId.trim()
          : null;

      if (sessionKey !== input.providerSessionKey) {
        return;
      }
      if (state !== "final" && state !== "aborted" && state !== "error") {
        return;
      }
      if (input.runId && payloadRunId !== input.runId) {
        return;
      }

      finish(() => {
        if (state === "error") {
          reject(new Error(typeof payload.errorMessage === "string" ? payload.errorMessage : "模型切换失败。"));
          return;
        }
        if (state === "aborted") {
          reject(new Error("模型切换被中止。"));
          return;
        }
        resolve("final");
      });
    });
  });
}
