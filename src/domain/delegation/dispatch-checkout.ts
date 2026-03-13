import type {
  DispatchCheckoutState,
  DispatchRecord,
  DispatchReleaseReason,
} from "./types";

export type DispatchCheckoutPatch = Pick<
  DispatchRecord,
  | "checkoutState"
  | "checkoutActorId"
  | "checkoutSessionKey"
  | "checkedOutAt"
  | "releasedAt"
  | "releaseReason"
>;

export type DispatchCheckoutSummary = {
  checkoutState: DispatchCheckoutState;
  stateLabel: string;
  detail: string;
  tone: "warning" | "info" | "success" | "danger";
  actorId: string | null;
  sessionKey: string | null;
  checkedOutAt: number | null;
  releasedAt: number | null;
  releaseReason: DispatchReleaseReason | null;
};

function normalizeString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function deriveCheckoutActorId(record: DispatchRecord): string | null {
  const explicitActorId = normalizeString(record.checkoutActorId);
  if (explicitActorId) {
    return explicitActorId;
  }
  const consumerSessionKey = normalizeString(record.checkoutSessionKey) ?? normalizeString(record.consumerSessionKey);
  if (consumerSessionKey?.startsWith("agent:") && consumerSessionKey.endsWith(":main")) {
    return consumerSessionKey.slice("agent:".length, consumerSessionKey.length - ":main".length).trim() || null;
  }
  return record.targetActorIds.length === 1 ? normalizeString(record.targetActorIds[0]) : null;
}

export function buildActorMainSessionKey(actorId: string | null | undefined): string | null {
  const normalized = normalizeString(actorId);
  return normalized ? `agent:${normalized}:main` : null;
}

function deriveCheckoutSessionKey(record: DispatchRecord, actorId: string | null): string | null {
  return (
    normalizeString(record.checkoutSessionKey) ??
    normalizeString(record.consumerSessionKey) ??
    buildActorMainSessionKey(actorId)
  );
}

function resolveReleasedReason(record: DispatchRecord): DispatchReleaseReason | null {
  if (record.status === "answered") {
    return "answered";
  }
  if (record.status === "blocked") {
    return "blocked";
  }
  if (record.status === "superseded") {
    return "superseded";
  }
  return null;
}

export function normalizeDispatchCheckout(record: DispatchRecord): DispatchCheckoutPatch {
  const actorId = deriveCheckoutActorId(record);
  const sessionKey = deriveCheckoutSessionKey(record, actorId);
  if (record.status === "acknowledged") {
    return {
      checkoutState: "claimed",
      checkoutActorId: actorId,
      checkoutSessionKey: sessionKey,
      checkedOutAt:
        (typeof record.checkedOutAt === "number" && Number.isFinite(record.checkedOutAt)
          ? record.checkedOutAt
          : null) ?? record.updatedAt,
      releasedAt: null,
      releaseReason: null,
    };
  }
  const releaseReason = resolveReleasedReason(record);
  if (releaseReason) {
    const releasedAt =
      (typeof record.releasedAt === "number" && Number.isFinite(record.releasedAt)
        ? record.releasedAt
        : null) ??
      (typeof record.consumedAt === "number" && Number.isFinite(record.consumedAt)
        ? record.consumedAt
        : null) ??
      record.updatedAt;
    return {
      checkoutState: "released",
      checkoutActorId: actorId,
      checkoutSessionKey: sessionKey,
      checkedOutAt:
        (typeof record.checkedOutAt === "number" && Number.isFinite(record.checkedOutAt)
          ? record.checkedOutAt
          : null) ??
        (releaseReason === "superseded" ? null : releasedAt),
      releasedAt,
      releaseReason,
    };
  }
  return {
    checkoutState: "open",
    checkoutActorId: null,
    checkoutSessionKey: null,
    checkedOutAt: null,
    releasedAt: null,
    releaseReason: null,
  };
}

export function buildDispatchCheckoutUpdate(input: {
  existing?: DispatchRecord;
  nextStatus: DispatchRecord["status"];
  timestamp: number;
  actorId?: string | null;
  sessionKey?: string | null;
  targetActorIds?: string[];
}): DispatchCheckoutPatch {
  const existingCheckout = input.existing
    ? normalizeDispatchCheckout(input.existing)
    : {
        checkoutState: "open" as const,
        checkoutActorId: null,
        checkoutSessionKey: null,
        checkedOutAt: null,
        releasedAt: null,
        releaseReason: null,
      };
  const fallbackActorId =
    normalizeString(input.actorId) ??
    existingCheckout.checkoutActorId ??
    (input.targetActorIds?.length === 1 ? normalizeString(input.targetActorIds[0]) : null);
  const fallbackSessionKey =
    normalizeString(input.sessionKey) ??
    existingCheckout.checkoutSessionKey ??
    buildActorMainSessionKey(fallbackActorId);

  if (input.nextStatus === "acknowledged") {
    return {
      checkoutState: "claimed",
      checkoutActorId: fallbackActorId,
      checkoutSessionKey: fallbackSessionKey,
      checkedOutAt: existingCheckout.checkedOutAt ?? input.timestamp,
      releasedAt: null,
      releaseReason: null,
    };
  }
  if (input.nextStatus === "answered" || input.nextStatus === "blocked") {
    return {
      checkoutState: "released",
      checkoutActorId: fallbackActorId,
      checkoutSessionKey: fallbackSessionKey,
      checkedOutAt: existingCheckout.checkedOutAt ?? input.timestamp,
      releasedAt: input.timestamp,
      releaseReason: input.nextStatus,
    };
  }
  if (input.nextStatus === "superseded") {
    return {
      checkoutState: "released",
      checkoutActorId: existingCheckout.checkoutActorId,
      checkoutSessionKey: existingCheckout.checkoutSessionKey,
      checkedOutAt: existingCheckout.checkedOutAt,
      releasedAt: input.timestamp,
      releaseReason: "superseded",
    };
  }
  return {
    checkoutState: "open",
    checkoutActorId: null,
    checkoutSessionKey: null,
    checkedOutAt: null,
    releasedAt: null,
    releaseReason: null,
  };
}

export function describeDispatchCheckout(input: {
  dispatch: DispatchRecord;
  resolveActorLabel?: (actorId: string | null) => string;
}): DispatchCheckoutSummary {
  const checkout = normalizeDispatchCheckout(input.dispatch);
  const actorLabel = input.resolveActorLabel?.(checkout.checkoutActorId ?? null)
    ?? checkout.checkoutActorId
    ?? "成员";
  if (checkout.checkoutState === "claimed") {
    return {
      checkoutState: "claimed",
      stateLabel: "执行中",
      detail: `${actorLabel} 已接手这条派单，正在执行。`,
      tone: "info",
      actorId: checkout.checkoutActorId ?? null,
      sessionKey: checkout.checkoutSessionKey ?? null,
      checkedOutAt: checkout.checkedOutAt ?? null,
      releasedAt: checkout.releasedAt ?? null,
      releaseReason: checkout.releaseReason ?? null,
    };
  }
  if (checkout.checkoutState === "released") {
    if (checkout.releaseReason === "blocked") {
      return {
        checkoutState: "released",
        stateLabel: "阻塞交回",
        detail: `${actorLabel} 已以阻塞状态交回这条派单。`,
        tone: "danger",
        actorId: checkout.checkoutActorId ?? null,
        sessionKey: checkout.checkoutSessionKey ?? null,
        checkedOutAt: checkout.checkedOutAt ?? null,
        releasedAt: checkout.releasedAt ?? null,
        releaseReason: "blocked",
      };
    }
    if (checkout.releaseReason === "superseded") {
      return {
        checkoutState: "released",
        stateLabel: "已释放",
        detail: "这条派单已被更新版本替代。",
        tone: "warning",
        actorId: checkout.checkoutActorId ?? null,
        sessionKey: checkout.checkoutSessionKey ?? null,
        checkedOutAt: checkout.checkedOutAt ?? null,
        releasedAt: checkout.releasedAt ?? null,
        releaseReason: "superseded",
      };
    }
    return {
      checkoutState: "released",
      stateLabel: "已交回",
      detail: `${actorLabel} 已交回结果，等待主线收口。`,
      tone: "success",
      actorId: checkout.checkoutActorId ?? null,
      sessionKey: checkout.checkoutSessionKey ?? null,
      checkedOutAt: checkout.checkedOutAt ?? null,
      releasedAt: checkout.releasedAt ?? null,
      releaseReason: checkout.releaseReason ?? null,
    };
  }
  return {
    checkoutState: "open",
    stateLabel: "待接手",
    detail: "这条派单还没有被明确认领。",
    tone: "warning",
    actorId: null,
    sessionKey: null,
    checkedOutAt: null,
    releasedAt: null,
    releaseReason: null,
  };
}
