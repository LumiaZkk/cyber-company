import type { GatewaySessionArchiveRow } from "../gateway/client";
import {
  isInternalAssistantMonologueText,
  isSyntheticWorkflowPromptText,
  isTruthMirrorNoiseText,
  normalizeTruthText,
  stripTruthInternalMonologue,
} from "../execution/message-truth";
import type { RoundRecord } from "./types";

export type HistoryRoundItem = {
  id: string;
  title: string;
  preview: string | null;
  archivedAt: number;
  restorable: boolean;
  source: "product" | "provider";
  providerArchiveId?: string | null;
  fileName?: string;
  reason?: string;
  round: RoundRecord | null;
};

export function getHistoryRoundBadgeLabel(_item: HistoryRoundItem): string {
  return "已归档";
}

export function sanitizeRoundTitle(value: string | null | undefined): string {
  return normalizeTruthText(value ?? "")
    .replace(/^\[[^\]]+\]\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeRoundField(value: string | null | undefined): string {
  return sanitizeRoundTitle(value)
    .trim()
    .toLowerCase();
}

function compactRoundText(text: string, limit: number = 320): string {
  const normalized = normalizeTruthText(stripTruthInternalMonologue(text))
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  if (normalized.length <= limit) {
    return normalized;
  }
  const head = normalized.slice(0, Math.floor(limit * 0.7)).trimEnd();
  const tail = normalized.slice(-Math.floor(limit * 0.2)).trimStart();
  return `${head} … ${tail}`;
}

export function sanitizeRoundPreview(value: string | null | undefined, limit: number = 320): string | null {
  if (!value) {
    return null;
  }
  const compacted = compactRoundText(value, limit);
  return compacted.length > 0 ? compacted : null;
}

function buildRoundMirrorCoverageKey(input: {
  title?: string | null;
  preview?: string | null;
  workItemId?: string | null;
  roomId?: string | null;
}): string {
  const scope =
    input.workItemId?.trim() ||
    input.roomId?.trim() ||
    "global";
  const title = normalizeRoundField(input.title);
  const preview = normalizeRoundField(sanitizeRoundPreview(input.preview));
  return [scope, title, preview].join("::");
}

function buildProductSemanticKey(round: RoundRecord): string {
  const scope =
    round.workItemId?.trim() ||
    round.roomId?.trim() ||
    round.sourceActorId?.trim() ||
    "global";
  const title = normalizeRoundField(round.title);
  const preview = normalizeRoundField(sanitizeRoundPreview(round.preview, 140));
  const reason = normalizeRoundField(round.reason ?? "product");
  return [scope, title, preview, reason].join("::");
}

function scoreProductRound(round: RoundRecord): number {
  let score = round.archivedAt;
  if (round.providerArchiveId?.trim()) {
    score += 100_000_000_000;
  }
  if (round.restorable) {
    score += 10_000_000_000;
  }
  return score;
}

function buildProviderSemanticKey(archive: GatewaySessionArchiveRow): string {
  const title = normalizeRoundField(archive.title || archive.fileName);
  const reason = normalizeRoundField(archive.reason ?? "provider");
  return [title, reason].join("::");
}

function scoreProviderArchive(archive: GatewaySessionArchiveRow): number {
  const previewLength = normalizeRoundField(sanitizeRoundPreview(archive.preview, 140)).length;
  return previewLength * 1_000_000_000 + archive.archivedAt;
}

function shouldKeepProviderArchive(archive: GatewaySessionArchiveRow): boolean {
  const title = sanitizeRoundTitle(archive.title || archive.fileName);
  const preview = sanitizeRoundPreview(archive.preview, 140);
  if (!title && !preview) {
    return false;
  }
  if (preview) {
    if (isTruthMirrorNoiseText(preview) || isSyntheticWorkflowPromptText(preview)) {
      return false;
    }
    if (isInternalAssistantMonologueText(preview)) {
      return false;
    }
  }
  return true;
}

export function buildHistoryRoundItems(input: {
  productRounds: RoundRecord[];
  providerRounds: GatewaySessionArchiveRow[];
}): HistoryRoundItem[] {
  const productBySemantic = new Map<string, RoundRecord>();
  input.productRounds.forEach((round) => {
    const semanticKey = buildProductSemanticKey(round);
    const previous = productBySemantic.get(semanticKey);
    if (!previous || scoreProductRound(round) >= scoreProductRound(previous)) {
      productBySemantic.set(semanticKey, round);
    }
  });

  const normalizedProductRounds = [...productBySemantic.values()];

  const productItems: HistoryRoundItem[] = normalizedProductRounds.map((round) => ({
    id: round.id,
    title: sanitizeRoundTitle(round.title),
    preview: sanitizeRoundPreview(round.preview, 140),
    archivedAt: round.archivedAt,
    restorable: round.restorable,
    source: "product",
    providerArchiveId: round.providerArchiveId ?? null,
    reason: round.reason ?? undefined,
    round,
  }));

  const coveredProviderIds = new Set(
    productItems.map((item) => item.providerArchiveId).filter((value): value is string => Boolean(value)),
  );
  const coveredMirrorKeys = new Set(
    normalizedProductRounds.map((round) =>
      buildRoundMirrorCoverageKey({
        title: round.title,
        preview: round.preview,
        workItemId: round.workItemId,
        roomId: round.roomId,
      }),
    ),
  );

  const providerBySemantic = new Map<string, GatewaySessionArchiveRow>();
  input.providerRounds.forEach((archive) => {
    if (!shouldKeepProviderArchive(archive)) {
      return;
    }
    if (coveredProviderIds.has(archive.id)) {
      return;
    }
    const providerMirrorKey = buildRoundMirrorCoverageKey({
      title: archive.title || archive.fileName,
      preview: sanitizeRoundPreview(archive.preview, 140),
    });
    if (coveredMirrorKeys.has(providerMirrorKey)) {
      return;
    }
    const semanticKey = buildProviderSemanticKey(archive);
    const previous = providerBySemantic.get(semanticKey);
    if (!previous || scoreProviderArchive(archive) >= scoreProviderArchive(previous)) {
      providerBySemantic.set(semanticKey, archive);
    }
  });

  const providerItems: HistoryRoundItem[] = [...providerBySemantic.values()].map((archive) => ({
    id: archive.id,
    title: sanitizeRoundTitle(archive.title || archive.fileName),
    preview: sanitizeRoundPreview(archive.preview, 140),
    archivedAt: archive.archivedAt,
    restorable: true,
    source: "provider",
    providerArchiveId: archive.id,
    fileName: archive.fileName,
    reason: archive.reason,
    round: null,
  }));

  return [...productItems, ...providerItems].sort((left, right) => right.archivedAt - left.archivedAt);
}
