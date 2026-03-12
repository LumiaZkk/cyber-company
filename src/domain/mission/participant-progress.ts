import type { RequestRecord } from "../delegation/types";
import { DISPATCH_BUSINESS_ACK_REMINDER_MS } from "../../application/delegation/dispatch-policy";

export type ParticipantProgressTone =
  | "slate"
  | "blue"
  | "amber"
  | "rose"
  | "emerald"
  | "violet";

export type ParticipantProgressStatus = {
  statusLabel: string;
  detail: string;
  tone: ParticipantProgressTone;
  isBlocking: boolean;
};

export function formatParticipantElapsedMinutes(updatedAt: number, now: number): string {
  const diffMinutes = Math.max(0, Math.floor((now - updatedAt) / 60_000));
  if (diffMinutes <= 0) {
    return "刚刚";
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} 分钟前`;
  }
  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;
  return minutes > 0 ? `${hours} 小时 ${minutes} 分钟前` : `${hours} 小时前`;
}

export function resolveBlockedParticipantStatus(
  request: RequestRecord,
): ParticipantProgressStatus {
  return {
    statusLabel: "已阻塞",
    detail: request.responseSummary ?? request.summary,
    tone: "rose",
    isBlocking: true,
  };
}

export function resolvePendingParticipantStatus(
  request: RequestRecord,
  now: number,
): ParticipantProgressStatus {
  const stale = now - request.updatedAt >= DISPATCH_BUSINESS_ACK_REMINDER_MS;
  if (request.deliveryState === "unknown") {
    return {
      statusLabel: "投递未确认",
      detail: stale
        ? `${request.title} 的投递状态仍未确认，且 ${formatParticipantElapsedMinutes(request.updatedAt, now)} 还没有业务回执。先不要判定失败，但需要人工跟进。`
        : `${request.title} 已进入后台投递，但 transport ACK 仍未确认。对方仍可能直接回结果。`,
      tone: stale ? "rose" : "amber",
      isBlocking: stale,
    };
  }
  return {
    statusLabel: stale ? "未回复" : "待回复",
    detail: stale
      ? `${request.title} 已发出，但 ${formatParticipantElapsedMinutes(request.updatedAt, now)} 仍未收到确认。`
      : `${request.title} 已发出，正在等待确认。`,
    tone: stale ? "rose" : "amber",
    isBlocking: stale,
  };
}

export function resolveAcknowledgedParticipantStatus(
  request: RequestRecord,
  now: number,
): ParticipantProgressStatus {
  const text = `${request.title}\n${request.responseSummary ?? request.summary}`;
  const elapsed = formatParticipantElapsedMinutes(request.updatedAt, now);
  const looksLikeStarted = /已开始|开始|立即执行|重写|写作|处理中|交稿时间|文件路径/i.test(text);

  if (looksLikeStarted) {
    const stale = now - request.updatedAt >= 20 * 60_000;
    return {
      statusLabel: stale ? "已开工未交付" : "已开工",
      detail: stale
        ? `${request.responseSummary ?? "已确认开始处理"}，但 ${elapsed} 仍未看到新的交付结果。`
        : request.responseSummary ?? "已确认开始处理，正在产出结果。",
      tone: stale ? "amber" : "blue",
      isBlocking: stale,
    };
  }

  const stale = now - request.updatedAt >= 20 * 60_000;
  return {
    statusLabel: stale ? "已接单未推进" : "已接单",
    detail: stale
      ? `${request.responseSummary ?? "已确认收到任务"}，但 ${elapsed} 没有新的推进。`
      : request.responseSummary ?? "已确认收到任务，等待进一步处理。",
    tone: stale ? "amber" : "violet",
    isBlocking: stale,
  };
}

export function resolveAnsweredParticipantStatus(
  request: RequestRecord,
): ParticipantProgressStatus {
  const text = `${request.title}\n${request.responseSummary ?? request.summary}`;
  if (/冻结|旧稿不得再尝试发布|等待新指令|待命/i.test(text)) {
    return {
      statusLabel: "已冻结待命",
      detail: request.responseSummary ?? "旧链路已冻结，正在等待新的发布指令。",
      tone: "emerald",
      isBlocking: false,
    };
  }
  if (/作废|就位|检查重点|已明确|标准/i.test(text)) {
    return {
      statusLabel: "已确认",
      detail: request.responseSummary ?? "这一步已经明确回复，可以继续往下走。",
      tone: "emerald",
      isBlocking: false,
    };
  }
  if (request.resolution === "partial") {
    return {
      statusLabel: "部分完成",
      detail: request.responseSummary ?? request.summary,
      tone: "amber",
      isBlocking: true,
    };
  }
  return {
    statusLabel: "已回复",
    detail: request.responseSummary ?? request.summary,
    tone: "emerald",
    isBlocking: false,
  };
}

const participantStatusPriority = new Map<string, number>([
  ["已阻塞", 0],
  ["交接阻塞", 0],
  ["投递未确认", 1],
  ["未回复", 1],
  ["待回复", 1],
  ["已开工未交付", 2],
  ["已接单未推进", 2],
  ["已开工", 3],
  ["已接单", 3],
  ["已交付待下游", 4],
  ["部分完成", 5],
  ["待接手", 6],
  ["已就绪待稿", 7],
  ["已确认", 8],
  ["已冻结待命", 9],
  ["已回复", 9],
  ["已交接", 9],
]);

export function pickCurrentParticipant<T extends { statusLabel: string; updatedAt: number }>(
  participants: T[],
): T | null {
  return (
    [...participants].sort((left, right) => {
      const leftPriority = participantStatusPriority.get(left.statusLabel) ?? 99;
      const rightPriority = participantStatusPriority.get(right.statusLabel) ?? 99;
      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }
      return right.updatedAt - left.updatedAt;
    })[0] ?? null
  );
}

export function isParticipantCompletedLike(statusLabel: string): boolean {
  return ["已确认", "已交付待下游", "已回复", "已冻结待命", "已交接"].includes(
    statusLabel,
  );
}
