import { describe, expect, it } from "vitest";
import type { Company } from "../company/types";
import { buildStableStrategicTopicKey } from "./work-item";
import {
  buildRequirementExecutionOverview,
  createRequirementMessageSnapshots,
  type RequirementSessionSnapshot,
} from "./requirement-overview";

describe("requirement overview snapshots", () => {
  it("keeps only the latest bounded snapshot messages", () => {
    const snapshots = createRequirementMessageSnapshots(
      Array.from({ length: 20 }, (_, index) => ({
        role: index % 2 === 0 ? "user" : "assistant",
        text: `message-${index + 1}`,
        timestamp: index + 1,
      })),
      { limit: 12 },
    );

    expect(snapshots).toHaveLength(12);
    expect(snapshots[0]?.text).toBe("message-9");
    expect(snapshots.at(-1)?.text).toBe("message-20");
  });

  it("compacts oversized message text but preserves both head and tail context", () => {
    const oversized =
      `HEAD:${"A".repeat(1_600)}\n` +
      `MIDDLE:${"B".repeat(900)}\n` +
      `TAIL:/Users/zkk/openclaw/workspaces/co-emp-1/ch02_clean.md`;

    const [snapshot] = createRequirementMessageSnapshots(
      [
        {
          role: "assistant",
          text: oversized,
          timestamp: 1,
        },
      ],
      { limit: 1 },
    );

    expect(snapshot?.text).toContain("HEAD:");
    expect(snapshot?.text).toContain("TAIL:/Users/zkk/openclaw/workspaces/co-emp-1/ch02_clean.md");
    expect(snapshot?.text).toContain("[...已折叠过长内容...]");
    expect(snapshot?.text.length).toBeLessThan(2_100);
  });
});

describe("requirement execution overview", () => {
  const company: Company = {
    id: "novel",
    name: "小说创作工作室",
    description: "test",
    icon: "🦞",
    template: "novel",
    employees: [
      { agentId: "co-ceo", nickname: "CEO", role: "首席执行官", isMeta: true, metaRole: "ceo" },
      { agentId: "co-cto", nickname: "CTO", role: "首席技术官", isMeta: true, metaRole: "cto" },
      { agentId: "co-coo", nickname: "COO", role: "首席运营官", isMeta: true, metaRole: "coo" },
    ],
    quickPrompts: [],
    tasks: [],
    handoffs: [],
    requests: [],
    createdAt: 1,
  };

  it("prefers the latest ceo tracked delegation mission for non-chapter strategic demands", () => {
    const snapshots: RequirementSessionSnapshot[] = [
      {
        agentId: "co-ceo",
        sessionKey: "agent:co-ceo:main",
        updatedAt: 300,
        messages: createRequirementMessageSnapshots(
          [
            {
              role: "user",
              text: "是不是应该让CTO出一份一致性的技术实现方案，还有作为小说公司，是不是应该实现一套小说阅读的系统，在页面上直接可以查看",
              timestamp: 100,
            },
            {
              role: "assistant",
              text:
                "【当前状态】建议立刻这么干。\n\n## 📋 任务追踪\n- [/] 1. 输出一致性技术实现方案 → @CTO\n- [/] 2. 评估小说阅读系统的闭环价值 → @COO\n- [ ] 3. CEO 审核整合并交付老板",
              timestamp: 120,
            },
          ],
        ),
      },
      {
        agentId: "co-cto",
        sessionKey: "agent:co-cto:main",
        updatedAt: 320,
        messages: createRequirementMessageSnapshots(
          [
            { role: "user", text: "请输出一致性技术实现方案。", timestamp: 130 },
            { role: "assistant", text: "极简结论：应该先做规则层、状态机、渲染协议和验收机制。", timestamp: 200 },
          ],
        ),
      },
      {
        agentId: "co-coo",
        sessionKey: "agent:co-coo:main",
        updatedAt: 340,
        messages: createRequirementMessageSnapshots(
          [
            { role: "user", text: "请评估小说阅读系统应否纳入产品闭环。", timestamp: 132 },
            { role: "assistant", text: "建议先做内部审阅版，连续阅读、批注、版本对比优先。", timestamp: 210 },
          ],
        ),
      },
    ];

    const overview = buildRequirementExecutionOverview({
      company,
      sessionSnapshots: snapshots,
      now: 400,
    });

    expect(overview?.currentOwnerAgentId).toBe("co-ceo");
    expect(overview?.headline).toBe("当前卡点在 CEO");
    expect(overview?.currentStage).toContain("整合团队方案");
    expect(overview?.summary).toContain("CTO、COO 已回传");
    expect(overview?.participants.some((participant) => participant.agentId === "co-cto" && participant.statusLabel === "已回复")).toBe(true);
    expect(overview?.participants.some((participant) => participant.agentId === "co-coo" && participant.statusLabel === "已回复")).toBe(true);
    expect(overview?.participants.find((participant) => participant.agentId === "co-cto")?.stage).not.toContain("发布冻结待命");
  });

  it("normalizes team-building and quality-improvement tracker missions into one stable bootstrap title", () => {
    const snapshots: RequirementSessionSnapshot[] = [
      {
        agentId: "co-ceo",
        sessionKey: "agent:co-ceo:main",
        updatedAt: 500,
        messages: createRequirementMessageSnapshots(
          [
            {
              role: "assistant",
              text:
                "老板，**网文质量提升专项**已正式启动。\n\n## 📋 任务追踪\n- [x] 1. 招聘与组织架构优化 → @HR\n- [/] 2. 工具能力建设 → @CTO\n- [/] 3. 流程优化与数据追踪 → @COO\n- [x] 4. 创作质量标准制定 → @主编\n- [ ] 5. 审校流程优化 → @审校",
              timestamp: 200,
            },
          ],
        ),
      },
      {
        agentId: "co-hr",
        sessionKey: "agent:co-hr:main",
        updatedAt: 520,
        messages: createRequirementMessageSnapshots(
          [{ role: "assistant", text: "招聘JD与兼任方案已交付。", timestamp: 260 }],
        ),
      },
      {
        agentId: "co-cto",
        sessionKey: "agent:co-cto:main",
        updatedAt: 530,
        messages: createRequirementMessageSnapshots(
          [{ role: "assistant", text: "一致性检查工具与模板开发进行中。", timestamp: 280 }],
        ),
      },
    ];

    const overview = buildRequirementExecutionOverview({
      company,
      sessionSnapshots: snapshots,
      now: 600,
    });

    expect(overview?.title).toBe("从头开始搭建 AI 小说创作团队");
    expect(overview?.topicKey).toMatch(/^mission:/);
  });

  it("can rebuild a strategic ceo tracker from preferred mission hints even when the user ask already fell out of the snapshot window", () => {
    const snapshots: RequirementSessionSnapshot[] = [
      {
        agentId: "co-ceo",
        sessionKey: "agent:co-ceo:main",
        updatedAt: 300,
        messages: createRequirementMessageSnapshots(
          [
            {
              role: "assistant",
              text:
                "【当前状态】我已经继续处理。\n\n## 📋 任务追踪\n[/] 1. 输出一致性技术实现方案 → @CTO\n[/] 2. 评估小说阅读系统的闭环价值 → @COO\n[/] 3. CEO 审核整合并交付老板 → @CEO",
              timestamp: 120,
            },
          ],
        ),
      },
      {
        agentId: "co-cto",
        sessionKey: "agent:co-cto:main",
        updatedAt: 320,
        messages: createRequirementMessageSnapshots(
          [
            { role: "user", text: "请输出一致性技术实现方案。", timestamp: 130 },
            { role: "assistant", text: "规则层、模板层、校验层、渲染层、验收层。", timestamp: 200 },
          ],
        ),
      },
      {
        agentId: "co-coo",
        sessionKey: "agent:co-coo:main",
        updatedAt: 340,
        messages: createRequirementMessageSnapshots(
          [
            { role: "user", text: "请评估小说阅读系统应否纳入产品闭环。", timestamp: 132 },
            { role: "assistant", text: "建议先做内部审阅版。", timestamp: 210 },
          ],
        ),
      },
    ];

    const overview = buildRequirementExecutionOverview({
      company,
      preferredTopicKey: "mission:jvmpny",
      preferredTopicText:
        "是不是应该让CTO出一份一致性的技术实现方案，还有作为小说公司，是不是应该实现一套小说阅读的系统，在页面上直接可以查看",
      preferredTopicTimestamp: 100,
      sessionSnapshots: snapshots,
      now: 400,
    });

    expect(overview?.topicKey.startsWith("mission:")).toBe(true);
    expect(overview?.currentOwnerAgentId).toBe("co-ceo");
    expect(overview?.currentStage).toContain("整合团队方案");
    expect(overview?.summary).toContain("CTO、COO 已回传");
  });

  it("lets a stronger team-bootstrap tracker replace an older preferred mission topic", () => {
    const snapshots: RequirementSessionSnapshot[] = [
      {
        agentId: "co-ceo",
        sessionKey: "agent:co-ceo:main",
        updatedAt: 500,
        messages: createRequirementMessageSnapshots(
          [
            {
              role: "assistant",
              text:
                "老板，**网文质量提升专项**已正式启动。\n\n## 📋 任务追踪\n- [x] 1. 招聘与组织架构优化 → @HR\n- [/] 2. 工具能力建设 → @CTO\n- [/] 3. 流程优化与数据追踪 → @COO\n- [x] 4. 创作质量标准制定 → @主编\n- [ ] 5. 审校流程优化 → @审校",
              timestamp: 200,
            },
          ],
        ),
      },
    ];

    const overview = buildRequirementExecutionOverview({
      company,
      preferredTopicKey: "mission:consistency-platform",
      preferredTopicText:
        "是不是应该让CTO出一份一致性的技术实现方案，还有作为小说公司，是不是应该实现一套小说阅读的系统，在页面上直接可以查看",
      preferredTopicTimestamp: 100,
      sessionSnapshots: snapshots,
      now: 600,
    });

    expect(overview?.title).toBe("从头开始搭建 AI 小说创作团队");
    expect(overview?.topicKey).toBe(
      buildStableStrategicTopicKey({
        title: "从头开始搭建 AI 小说创作团队",
      }),
    );
  });

  it("rejects malformed overview candidates that only contain generic titles or metadata fragments", () => {
    const snapshots: RequirementSessionSnapshot[] = [
      {
        agentId: "co-ceo",
        sessionKey: "agent:co-ceo:main",
        updatedAt: 300,
        messages: createRequirementMessageSnapshots(
          [
            {
              role: "user",
              text: "帮我看一下 growth-plan.md",
              timestamp: 100,
            },
            {
              role: "assistant",
              text:
                "## 📋 任务追踪\n[/] 1. { → @CTO\n[/] 2. \"count\": 20, → @COO\n[/] 3. CEO 收口 → @CEO",
              timestamp: 120,
            },
          ],
        ),
      },
    ];

    const overview = buildRequirementExecutionOverview({
      company,
      preferredTopicKey: "mission:test",
      preferredTopicText: "当前需求",
      preferredTopicTimestamp: 100,
      sessionSnapshots: snapshots,
      now: 400,
    });

    expect(overview).toBeNull();
  });
});
