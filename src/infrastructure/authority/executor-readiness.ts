import type {
  AuthorityExecutorCapabilitySnapshot,
  AuthorityExecutorConfig,
  AuthorityExecutorReadinessCheck,
  AuthorityExecutorStatus,
} from "./contract";

export function buildAuthorityExecutorReadinessChecks(input: {
  executor: AuthorityExecutorStatus;
  executorConfig: AuthorityExecutorConfig;
  executorCapabilities: AuthorityExecutorCapabilitySnapshot;
}): AuthorityExecutorReadinessCheck[] {
  const { executor, executorConfig, executorCapabilities } = input;

  const connectionCheck: AuthorityExecutorReadinessCheck = {
    id: "connection",
    label: "执行器连接",
    state: executor.state,
    summary: executor.note,
    detail: executorConfig.openclaw.url || "OpenClaw 地址未配置。",
  };

  const authCheck: AuthorityExecutorReadinessCheck = executorConfig.openclaw.tokenConfigured
    ? {
        id: "auth",
        label: "鉴权令牌",
        state: "ready",
        summary: "Authority 已检测到可用的 OpenClaw token / 设备身份。",
        detail: "执行器如果启用了鉴权，当前配置已经具备直接接入条件。",
      }
    : {
        id: "auth",
        label: "鉴权令牌",
        state: executor.state === "blocked" ? "blocked" : "degraded",
        summary: "当前还没有检测到 OpenClaw token / 设备身份。",
        detail: "如果下游 OpenClaw 要求鉴权，后续连接会失败。建议先在 Settings 里配置 token，或导出 OPENCLAW_GATEWAY_TOKEN。",
      };

  const sessionStatusCheck: AuthorityExecutorReadinessCheck =
    executorCapabilities.sessionStatus === "supported"
      ? {
          id: "session-status",
          label: "运行态探针",
          state: "ready",
          summary: "session_status 可用，Authority 可以主动补 runtime 状态。",
          detail: "运行态修复会优先走 session_status，再回退到 lifecycle/chat 事件。",
        }
      : executorCapabilities.sessionStatus === "unsupported"
        ? {
            id: "session-status",
            label: "运行态探针",
            state: "degraded",
            summary: "当前执行器不支持 session_status。",
            detail: "Authority 会退回 lifecycle/chat 驱动的降级修复模式。",
          }
        : {
            id: "session-status",
            label: "运行态探针",
            state: executor.state === "ready" ? "degraded" : "blocked",
            summary: "Authority 还没有确认 session_status 能力。",
            detail: "首次探测后会切换到真实能力边界。",
          };

  const processRuntimeCheck: AuthorityExecutorReadinessCheck =
    executorCapabilities.processRuntime === "supported"
      ? {
          id: "process-runtime",
          label: "进程观测",
          state: "ready",
          summary: "当前执行器支持 process runtime 观测。",
          detail: "Runtime Inspector 可以直接展示进程级运行态。",
        }
      : {
          id: "process-runtime",
          label: "进程观测",
          state: executorCapabilities.processRuntime === "unknown" ? "degraded" : "degraded",
          summary:
            executorCapabilities.processRuntime === "unknown"
              ? "Authority 还没有确认 process runtime 能力。"
              : "当前执行器不提供 process runtime 观测。",
          detail: "Runtime Inspector 会隐藏进程级 polling，只保留会话与事件侧观测。",
        };

  const agentFilesCheck: AuthorityExecutorReadinessCheck =
    executor.state === "ready"
      ? {
          id: "agent-files",
          label: "文件镜像",
          state: "ready",
          summary: "Authority 已具备把 agent files 镜像到执行器工作区的条件。",
          detail: "产品侧文件、skills 和受控 agent files 可以继续走 authority bridge 同步。",
        }
      : {
          id: "agent-files",
          label: "文件镜像",
          state: executor.state === "blocked" ? "blocked" : "degraded",
          summary: "执行器还没 ready，agent files mirror 暂时不会真正落地。",
          detail: "先恢复执行器连接，再继续依赖 agent files / workspace entry 链路。",
        };

  return [
    connectionCheck,
    authCheck,
    sessionStatusCheck,
    processRuntimeCheck,
    agentFilesCheck,
  ];
}
