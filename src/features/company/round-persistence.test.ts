import { describe, expect, it } from "vitest";
import { sanitizeRoundRecords } from "./round-persistence";
import type { RoundRecord } from "./types";

function createRound(overrides: Partial<RoundRecord> = {}): RoundRecord {
  return {
    id: "round:ceo:1",
    companyId: "novel-studio-001",
    title: "CEO 历史轮次",
    preview: "上一轮摘要",
    sourceActorId: null,
    sourceActorLabel: "CEO",
    sourceSessionKey: "agent:co-ceo:main",
    sourceConversationId: null,
    messages: [],
    archivedAt: 1_000,
    restorable: true,
    ...overrides,
  };
}

describe("sanitizeRoundRecords", () => {
  it("derives sourceActorId from legacy session fields during migration so old archives remain attributable", () => {
    const [round] = sanitizeRoundRecords([
      createRound({
        sourceActorId: null,
        sourceSessionKey: "agent:co-cto:main",
      }),
    ]);

    expect(round?.sourceActorId).toBe("co-cto");
  });

  it("folds semantic duplicates that only differ by archive timestamp", () => {
    const rounds = sanitizeRoundRecords([
      createRound({
        id: "round:ceo:old",
        title: "一致性底座方案",
        preview: "请 CTO 输出一致性底座方案",
        archivedAt: 1_710_000_000_000,
      }),
      createRound({
        id: "round:ceo:new",
        title: "一致性底座方案",
        preview: "请 CTO 输出一致性底座方案",
        archivedAt: 1_710_000_000_900,
      }),
    ]);

    expect(rounds).toHaveLength(1);
    expect(rounds[0]?.id).toBe("round:ceo:new");
  });

  it("keeps distinct rounds when the visible transcript differs even if title and preview match", () => {
    const rounds = sanitizeRoundRecords([
      createRound({
        id: "round:ceo:old",
        title: "一致性底座方案",
        preview: "请 CTO 输出一致性底座方案",
        archivedAt: 1_710_000_000_000,
        messages: [
          { role: "user", text: "第一轮需求", timestamp: 1_710_000_000_000 },
          { role: "assistant", text: "第一轮回复", timestamp: 1_710_000_000_100 },
        ],
      }),
      createRound({
        id: "round:ceo:new",
        title: "一致性底座方案",
        preview: "请 CTO 输出一致性底座方案",
        archivedAt: 1_710_100_000_000,
        messages: [
          { role: "user", text: "第二轮需求", timestamp: 1_710_100_000_000 },
          { role: "assistant", text: "第二轮回复", timestamp: 1_710_100_000_100 },
        ],
      }),
    ]);

    expect(rounds).toHaveLength(2);
    expect(rounds.map((round) => round.id)).toEqual(["round:ceo:new", "round:ceo:old"]);
  });

  it("drops system and mirror-noise snapshots when sanitizing product rounds", () => {
    const [round] = sanitizeRoundRecords([
      createRound({
        messages: [
          { role: "system", text: "SESSIONS_LIST", timestamp: 1000 },
          {
            role: "assistant",
            text: "任务追踪已同步到顶部“本次需求执行 / 协作生命周期”，正文里不再重复展开。",
            timestamp: 1100,
          },
          { role: "assistant", text: "【当前状态】请 CTO 输出一致性技术方案。", timestamp: 1200 },
        ],
      }),
    ]);

    expect(round?.messages).toEqual([
      { role: "assistant", text: "【当前状态】请 CTO 输出一致性技术方案。", timestamp: 1200 },
    ]);
  });

  it("normalizes drifted strategic round workItem ids into one stable title-backed scope", () => {
    const [round] = sanitizeRoundRecords([
      createRound({
        id: "round:ceo:drifted",
        title: "一致性底座与内部审阅系统执行方案",
        workItemId: "topic:mission:4p27it",
        roomId: "workitem:topic:mission:4p27it",
      }),
    ]);

    expect(round?.workItemId).toMatch(/^topic:mission:/);
    expect(round?.roomId).toMatch(/^workitem:topic:mission:/);
    expect(round?.roomId).not.toBe("workitem:topic:mission:4p27it");
  });
});
