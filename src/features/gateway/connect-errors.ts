import type { GatewayErrorInfo } from "./openclaw-gateway-client";

export type NormalizedConnectErrorType =
  | "gateway_unavailable"
  | "token_invalid"
  | "device_identity_required"
  | "origin_not_allowed"
  | "unknown";

export type NormalizedConnectError = {
  type: NormalizedConnectErrorType;
  title: string;
  message: string;
  steps: string[];
  debug: string | null;
};

type NormalizeConnectErrorInput = {
  code?: number;
  reason?: string;
  error?: GatewayErrorInfo;
  hadToken?: boolean;
};

function includesPattern(input: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(input));
}

function buildDebugString(input: NormalizeConnectErrorInput): string | null {
  const parts = [
    typeof input.code === "number" ? `close=${input.code}` : null,
    input.reason?.trim() ? `reason=${input.reason.trim()}` : null,
    input.error?.code?.trim() ? `gateway=${input.error.code.trim()}` : null,
    input.error?.message?.trim() ? `message=${input.error.message.trim()}` : null,
  ].filter((value): value is string => Boolean(value));

  return parts.length > 0 ? parts.join(" | ") : null;
}

export function normalizeConnectError(
  input: NormalizeConnectErrorInput,
): NormalizedConnectError {
  const reason = input.reason?.trim() ?? "";
  const gatewayCode = input.error?.code?.trim() ?? "";
  const gatewayMessage = input.error?.message?.trim() ?? "";
  const combined = `${gatewayCode} ${gatewayMessage} ${reason}`.trim().toLowerCase();
  const debug = buildDebugString(input);

  if (includesPattern(combined, [/origin not allowed/i, /\borigin\b/i])) {
    return {
      type: "origin_not_allowed",
      title: "当前页面来源未被允许",
      message: "Gateway 拒绝了这个网页来源，需要把当前页面域名加入允许列表后再连接。",
      steps: [
        "确认你是从被 Gateway 允许的前端地址打开当前页面。",
        "把当前页面来源加入 Gateway 的允许来源配置。",
        "更新配置后刷新页面并重试连接。",
      ],
      debug,
    };
  }

  if (includesPattern(combined, [/device identity required/i, /device identity/i])) {
    return {
      type: "device_identity_required",
      title: "当前设备尚未完成身份配对",
      message: "Gateway 需要已登记的设备身份，当前浏览器还没有通过设备身份校验。",
      steps: [
        "先在已授权设备或已配对浏览器中完成连接。",
        "确认当前浏览器会带上正确的设备身份信息后再重试。",
        "如果这是新设备，需要先完成设备配对或导入身份。",
      ],
      debug,
    };
  }

  if (
    includesPattern(combined, [
      /invalid token/i,
      /\bunauthorized\b/i,
      /\bforbidden\b/i,
      /\bauth/i,
      /\btoken\b/i,
    ])
  ) {
    const message = input.hadToken
      ? "Gateway 拒绝了当前 Token，请检查它是否过期、填错或权限不足。"
      : "当前 Gateway 需要鉴权，但页面没有提供可用的 Token。";

    return {
      type: "token_invalid",
      title: "Token 无效或缺失",
      message,
      steps: [
        "重新复制一份有效的 Gateway Token。",
        "确认 Token 没有多余空格、换行或被截断。",
        "如果 Token 已轮换，请使用新的 Token 重新连接。",
      ],
      debug,
    };
  }

  if (
    input.code === 1006
    || input.code === 1005
    || input.code === 0
    || combined.length === 0
    || combined === "connect failed"
    || includesPattern(combined, [
      /connection refused/i,
      /econnrefused/i,
      /failed to fetch/i,
      /\bnetwork\b/i,
      /gateway not connected/i,
      /\boffline\b/i,
      /\btimeout\b/i,
    ])
  ) {
    return {
      type: "gateway_unavailable",
      title: "Gateway 当前不可达",
      message: "前端无法稳定连到目标 Gateway，请先确认服务和网络本身可用。",
      steps: [
        "确认 Gateway 进程已经启动并监听正确端口。",
        "检查 Gateway URL 是否可达，默认本地地址是 ws://localhost:18789。",
        "如果连接远程地址，确认网络、防火墙和端口转发都正常。",
      ],
      debug,
    };
  }

  return {
    type: "unknown",
    title: "连接失败",
    message: "Gateway 拒绝了这次连接，但当前错误还没有被前端正确分类。",
    steps: [
      "先重试一次连接，确认是否是瞬时故障。",
      "如果问题持续存在，检查 Gateway 日志中的 connect 错误。",
      "把最后错误详情连同当前 URL 一起带给开发排查。",
    ],
    debug,
  };
}
