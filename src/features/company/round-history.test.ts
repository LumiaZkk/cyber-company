import { describe, expect, it } from "vitest";
import { buildHistoryRoundItems, getHistoryRoundBadgeLabel } from "./round-history";
import type { RoundRecord } from "./types";

function createRound(overrides: Partial<RoundRecord> = {}): RoundRecord {
  return {
    id: "round:ceo:1",
    companyId: "novel-studio-001",
    title: "CEO 历史轮次",
    preview: "上一轮摘要",
    sourceActorId: "co-ceo",
    sourceActorLabel: "CEO",
    sourceSessionKey: "agent:co-ceo:main",
    sourceConversationId: "agent:co-ceo:main",
    messages: [],
    archivedAt: 1_000,
    restorable: true,
    reason: "product",
    ...overrides,
  };
}

describe("buildHistoryRoundItems", () => {
  it("prefers product rounds over mirrored provider archives for the same archived turn", () => {
    const productRound = createRound({
      id: "round:ceo:1",
      title: "一致性底座方案",
      preview: "请 CTO 输出一致性底座方案",
      archivedAt: 1_710_000_000_000,
    });

    const items = buildHistoryRoundItems({
      productRounds: [productRound],
      providerRounds: [
        {
          id: "provider-1",
          title: "一致性底座方案",
          preview: "请 CTO 输出一致性底座方案",
          archivedAt: 1_710_000_000_100,
          fileName: "provider-1.jsonl.reset.2026-03-08T00-00-00.000Z",
          reason: "reset",
        },
      ],
    });

    expect(items).toHaveLength(1);
    expect(items[0]?.source).toBe("product");
  });

  it("keeps provider archives when product rounds do not cover them", () => {
    const items = buildHistoryRoundItems({
      productRounds: [
        createRound({
          id: "round:ceo:1",
          title: "第 2 章重写",
          preview: "写手和审校已经完成",
          archivedAt: 1_710_000_000_000,
        }),
      ],
      providerRounds: [
        {
          id: "provider-2",
          title: "一致性底座方案",
          preview: "请 CTO 输出一致性底座方案",
          archivedAt: 1_710_100_000_000,
          fileName: "provider-2.jsonl.reset.2026-03-08T01-00-00.000Z",
          reason: "reset",
        },
      ],
    });

    expect(items).toHaveLength(2);
    expect(items[0]?.source).toBe("provider");
    expect(items[1]?.source).toBe("product");
  });

  it("sanitizes product round titles and previews before rendering", () => {
    const items = buildHistoryRoundItems({
      productRounds: [
        createRound({
          title: "[Sun 2026-03-08 01:35 GMT+8] 一致性底座方案",
          preview:
            "I'm the CEO of Cyber Company. My core duties are orchestration. 【当前状态】请 CTO 输出规则层、模板层、校验层方案。",
        }),
      ],
      providerRounds: [],
    });

    expect(items[0]?.title).toBe("一致性底座方案");
    expect(items[0]?.preview).toBe("【当前状态】请 CTO 输出规则层、模板层、校验层方案。");
  });

  it("folds repeated provider mirror archives for the same round and keeps the latest one", () => {
    const items = buildHistoryRoundItems({
      productRounds: [],
      providerRounds: [
        {
          id: "provider-older",
          title: "[Sun 2026-03-08 01:35 GMT+8] 一致性方案",
          preview: "【当前状态】我是 CEO，正在整合方案。",
          archivedAt: 1_710_000_000_000,
          fileName: "provider-older.jsonl.reset.2026-03-08T00-00-00.000Z",
          reason: "reset",
        },
        {
          id: "provider-newer",
          title: "[Sun 2026-03-08 01:35 GMT+8] 一致性方案",
          preview: "【当前状态】我是 CEO，正在整合方案。",
          archivedAt: 1_710_000_100_000,
          fileName: "provider-newer.jsonl.reset.2026-03-08T00-01-00.000Z",
          reason: "reset",
        },
      ],
    });

    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe("provider-newer");
    expect(items[0]?.source).toBe("provider");
  });

  it("folds repeated provider mirrors even when they are archived far apart", () => {
    const items = buildHistoryRoundItems({
      productRounds: [],
      providerRounds: [
        {
          id: "provider-older",
          title: "[Sun 2026-03-08 01:35 GMT+8] 一致性方案",
          preview: "【当前状态】我是 CEO，正在整合方案。",
          archivedAt: 1_710_000_000_000,
          fileName: "provider-older.jsonl.reset.2026-03-08T00-00-00.000Z",
          reason: "reset",
        },
        {
          id: "provider-newer",
          title: "[Sun 2026-03-08 01:35 GMT+8] 一致性方案",
          preview: "【当前状态】我是 CEO，正在整合方案。",
          archivedAt: 1_710_360_000_000,
          fileName: "provider-newer.jsonl.reset.2026-03-08T01-00-00.000Z",
          reason: "reset",
        },
      ],
    });

    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe("provider-newer");
  });

  it("prefers the richer provider preview when mirror archives repeat the same round", () => {
    const items = buildHistoryRoundItems({
      productRounds: [],
      providerRounds: [
        {
          id: "provider-blank",
          title: "一致性方案",
          preview: "",
          archivedAt: 1_710_000_000_000,
          fileName: "provider-blank.jsonl.reset.2026-03-08T00-00-00.000Z",
          reason: "reset",
        },
        {
          id: "provider-rich",
          title: "一致性方案",
          preview: "请 CTO 输出规则层、模板层、校验层和渲染层方案。",
          archivedAt: 1_710_000_010_000,
          fileName: "provider-rich.jsonl.reset.2026-03-08T00-00-10.000Z",
          reason: "reset",
        },
      ],
    });

    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe("provider-rich");
    expect(items[0]?.preview).toContain("规则层");
  });

  it("folds repeated product rounds for the same semantic round and keeps the richer latest one", () => {
    const items = buildHistoryRoundItems({
      productRounds: [
        createRound({
          id: "round:older",
          workItemId: "topic:mission:1",
          title: "一致性底座方案",
          preview: "请 CTO 输出一致性底座方案",
          archivedAt: 1_710_000_000_000,
          restorable: false,
        }),
        createRound({
          id: "round:newer",
          workItemId: "topic:mission:1",
          title: "一致性底座方案",
          preview: "请 CTO 输出一致性底座方案",
          archivedAt: 1_710_000_010_000,
          restorable: true,
        }),
      ],
      providerRounds: [],
    });

    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe("round:newer");
    expect(items[0]?.source).toBe("product");
  });

  it("filters provider archives that only contain mirror noise", () => {
    const items = buildHistoryRoundItems({
      productRounds: [],
      providerRounds: [
        {
          id: "provider-noise",
          title: "镜像轮次",
          preview: "任务追踪已同步到顶部“本次需求执行 / 协作生命周期”，正文里不再重复展开。",
          archivedAt: 1_710_000_020_000,
          fileName: "provider-noise.jsonl.reset.2026-03-08T00-00-20.000Z",
          reason: "reset",
        },
      ],
    });

    expect(items).toHaveLength(0);
  });

  it("uses a provider-agnostic badge label for all archived rounds", () => {
    const productItem = buildHistoryRoundItems({
      productRounds: [createRound()],
      providerRounds: [],
    })[0];
    const providerItem = buildHistoryRoundItems({
      productRounds: [],
      providerRounds: [
        {
          id: "provider-archive",
          title: "一致性方案",
          preview: "请 CTO 输出规则层、模板层、校验层和渲染层方案。",
          archivedAt: 1_710_000_010_000,
          fileName: "provider-archive.jsonl.reset.2026-03-08T00-00-10.000Z",
          reason: "reset",
        },
      ],
    })[0];

    expect(productItem).toBeTruthy();
    expect(providerItem).toBeTruthy();
    expect(getHistoryRoundBadgeLabel(productItem!)).toBe("已归档");
    expect(getHistoryRoundBadgeLabel(providerItem!)).toBe("已归档");
  });
});
