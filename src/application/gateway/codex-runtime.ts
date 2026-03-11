import type { AgentControlSnapshot, GatewayModelChoice, GatewaySessionRow } from "./index";
import { gateway } from "./index";
import { waitForGatewayChatRunTerminal } from "./chat-run";

type SessionModelPlanEntry = {
  actorId: string;
  model: string;
  sessionKey: string;
};

type SessionLike = Pick<GatewaySessionRow, "actorId" | "key">;
type ControlLike = Pick<AgentControlSnapshot, "defaultModel" | "modelOverride">;

function normalizeNonEmptyString(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function resolveEffectiveModel(snapshot: ControlLike | null | undefined): string | null {
  return normalizeNonEmptyString(snapshot?.modelOverride) ?? normalizeNonEmptyString(snapshot?.defaultModel);
}

export function isCodexModelRef(modelRef: string | null | undefined): boolean {
  const normalized = normalizeNonEmptyString(modelRef);
  return normalized ? normalized.startsWith("openai-codex/") : false;
}

export function buildCodexSessionReapplyPlan(input: {
  sessions: SessionLike[];
  controlSnapshots: Record<string, ControlLike | null | undefined>;
}): SessionModelPlanEntry[] {
  const plannedSessionKeys = new Set<string>();
  const plan: SessionModelPlanEntry[] = [];

  for (const session of input.sessions) {
    const sessionKey = normalizeNonEmptyString(session.key);
    const actorId = normalizeNonEmptyString(session.actorId);
    if (!sessionKey || !actorId || plannedSessionKeys.has(sessionKey)) {
      continue;
    }

    const effectiveModel = resolveEffectiveModel(input.controlSnapshots[actorId]);
    if (!effectiveModel || !isCodexModelRef(effectiveModel)) {
      continue;
    }

    plannedSessionKeys.add(sessionKey);
    plan.push({
      actorId,
      model: effectiveModel,
      sessionKey,
    });
  }

  return plan;
}

export async function syncCodexModelsToAllowlist(models: GatewayModelChoice[]) {
  const codexModels = models.filter((model) => model.provider === "openai-codex");
  if (codexModels.length === 0) {
    return false;
  }

  const snapshot = await gateway.getConfigSnapshot();
  const hash = snapshot.hash;
  if (!hash) {
    return false;
  }

  const currentModels =
    (snapshot.config as { agents?: { defaults?: { models?: Record<string, unknown> } } })?.agents?.defaults
      ?.models ?? {};
  const nextModels = { ...currentModels };
  let changed = false;

  for (const model of codexModels) {
    const ref = `${model.provider}/${model.id}`;
    if (!(ref in nextModels)) {
      nextModels[ref] = {};
      changed = true;
    }
  }

  if (!changed) {
    return false;
  }

  await gateway.patchConfig(
    {
      agents: {
        defaults: {
          models: nextModels,
        },
      },
    },
    hash,
  );

  return true;
}

export async function reapplyCodexModelsToActiveSessions(): Promise<{
  failed: number;
  matched: number;
  reapplied: number;
}> {
  const sessionsResult = await gateway.listSessions({
    includeGlobal: true,
    includeUnknown: true,
    limit: 1000,
  });
  const sessions = sessionsResult.sessions ?? [];
  const actorIds = [
    ...new Set(
      sessions
        .map((session) => normalizeNonEmptyString(session.actorId))
        .filter((actorId): actorId is string => Boolean(actorId)),
    ),
  ];
  if (actorIds.length === 0) {
    return { failed: 0, matched: 0, reapplied: 0 };
  }

  const controlEntries = await Promise.all(
    actorIds.map(async (actorId) => [actorId, await gateway.getAgentControlSnapshot(actorId)] as const),
  );
  const controlSnapshots = Object.fromEntries(controlEntries);
  const plan = buildCodexSessionReapplyPlan({ sessions, controlSnapshots });
  if (plan.length === 0) {
    return { failed: 0, matched: 0, reapplied: 0 };
  }

  const settled = await Promise.allSettled(
    plan.map(async (entry) => {
      const ack = await gateway.sendChatMessage(entry.sessionKey, `/model ${entry.model}`);
      await waitForGatewayChatRunTerminal({
        providerSessionKey: entry.sessionKey,
        runId: ack?.runId ?? null,
      });
    }),
  );

  let reapplied = 0;
  let failed = 0;
  settled.forEach((result, index) => {
    if (result.status === "fulfilled") {
      reapplied += 1;
      return;
    }
    failed += 1;
    console.warn("Failed to reapply Codex model to active session", {
      actorId: plan[index]?.actorId,
      error: result.reason,
      sessionKey: plan[index]?.sessionKey,
    });
  });

  return {
    failed,
    matched: plan.length,
    reapplied,
  };
}

export function formatCodexRuntimeSyncDescription(result: {
  failed: number;
  matched: number;
  reapplied: number;
}): string {
  if (result.matched === 0) {
    return "当前没有检测到需要热切换的 Codex 活动会话。";
  }
  if (result.failed === 0) {
    return `已完成 ${result.reapplied} 个活动会话的 Codex 模型重绑。`;
  }
  return `已重绑 ${result.reapplied}/${result.matched} 个活动会话，另有 ${result.failed} 个会话重绑失败。`;
}
