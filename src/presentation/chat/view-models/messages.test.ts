import { describe, expect, it } from "vitest";
import { buildChatDisplayItems, findInlineRequirementDecisionAnchorId } from "./messages";
import type { ChatMessage } from "../../../application/gateway";
import type { DecisionTicketRecord } from "../../../domain/delegation/types";

describe("buildChatDisplayItems", () => {
  it("collapses plain toolResult role messages into a tool summary item", () => {
    const messages: ChatMessage[] = [
      {
        role: "toolResult",
        toolName: "write",
        text: "Successfully wrote 285 bytes to /tmp/TASK-BOARD.md",
        timestamp: 1_000,
      },
    ];

    expect(buildChatDisplayItems(messages)).toEqual([
      {
        kind: "tool",
        id: "1000:tool",
        title: "写入文件 已返回结果",
        detail: "Successfully wrote 285 bytes to /tmp/TASK-BOARD.md",
        tone: "sky",
        count: 1,
      },
    ]);
  });

  it("keeps regular assistant content visible while collapsing tool chatter", () => {
    const messages: ChatMessage[] = [
      {
        role: "assistant",
        text: "我现在就派发任务给 CTO 和 COO。",
        timestamp: 1_000,
      },
      {
        role: "toolResult",
        toolName: "company_dispatch",
        text: "{\"ok\":true,\"status\":\"sent\"}",
        timestamp: 1_100,
      },
    ];

    const items = buildChatDisplayItems(messages);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      kind: "message",
      displayTier: "main",
      narrativeRole: "executive_reply",
      message: expect.objectContaining({
        role: "assistant",
        text: "我现在就派发任务给 CTO 和 COO。",
      }),
    });
    expect(items[1]).toMatchObject({
      kind: "tool",
      title: "company dispatch 已返回结果",
      detail: "已返回结构化结果",
      tone: "sky",
    });
  });

  it("uses stable room message ids and avoids collisions for same-timestamp messages", () => {
    const items = buildChatDisplayItems([
      {
        role: "user",
        text: "请直接用我现有的账号评估登录方式",
        timestamp: 1_773_334_015_901,
        roomMessageId: "room-message:owner:1",
        roomSessionKey: "room:workitem:1",
      },
      {
        role: "assistant",
        text: "[company_report:acknowledged] 收到，我先评估登录方式。",
        timestamp: 1_773_334_015_901,
        roomMessageId: "room-message:ceo:1",
        roomAgentId: "co-ceo",
      },
      {
        role: "assistant",
        text: "[company_report:acknowledged] 收到，我先同步给 COO。",
        timestamp: 1_773_334_015_901,
        roomMessageId: "room-message:ceo:2",
        roomAgentId: "co-ceo",
      },
    ]);

    expect(items.map((item) => item.id)).toEqual([
      "room-message:owner:1:message",
      "room-message:ceo:1:report",
      "room-message:ceo:2:report",
    ]);
    expect(items.map((item) => ("displayTier" in item ? item.displayTier : null))).toEqual([
      "main",
      "status",
      "status",
    ]);
  });

  it("strips synthetic dispatch audience titles so owner-dispatch echoes collapse into one visible message", () => {
    const items = buildChatDisplayItems([
      {
        role: "user",
        text:
          "需求团队派单 · CEO\n回复 \"启动A\" - 让CTO开始开发\n回复 \"启动B\" - 让HR激活内容总监",
        timestamp: 2_000,
        roomMessageId: "room-message:dispatch-title",
        roomMessageSource: "owner_dispatch",
        roomSessionKey: "agent:nl-0845da-ceo:main",
      },
      {
        role: "user",
        text: "回复 \"启动A\" - 让CTO开始开发\n回复 \"启动B\" - 让HR激活内容总监",
        timestamp: 2_001,
        roomMessageId: "room-message:dispatch-plain",
        roomMessageSource: "owner_dispatch",
        roomSessionKey: "room:workitem:1",
      },
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: "message",
      displayTier: "main",
      narrativeRole: "user_prompt",
      message: expect.objectContaining({
        text: "回复 \"启动A\" - 让CTO开始开发\n回复 \"启动B\" - 让HR激活内容总监",
      }),
    });
  });

  it("adds a deterministic suffix when plain timestamp-based ids would collide", () => {
    const items = buildChatDisplayItems([
      {
        role: "assistant",
        text: "第一条同步",
        timestamp: 2_000,
      },
      {
        role: "assistant",
        text: "第二条同步",
        timestamp: 2_000,
      },
    ]);

    expect(items.map((item) => item.id)).toEqual(["2000:message", "2000:message:2"]);
  });

  it("renders explicit company reports as collaborator report cards", () => {
    const items = buildChatDisplayItems([
      {
        role: "user",
        text: "[company_report:answered] dispatch=dispatch:1\n技术评估已完成，技术完全可行，建议分三阶段实施。",
        timestamp: 2_000,
        provenance: {
          sourceActorId: "co-cto",
        },
      },
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: "report",
      displayTier: "main",
      narrativeRole: "member_update",
      report: expect.objectContaining({
        status: "answered",
        statusLabel: "已提交",
        reportType: "技术评估",
      }),
    });
  });

  it("does not misclassify user dispatch instructions as collaborator reports", () => {
    const items = buildChatDisplayItems([
      {
        role: "user",
        text: "全部启动 - 三管齐下并行推进 @CEO\n\n回执要求\n收到任务后，请先立即用 `[company_report:acknowledged] dispatch=dispatch:1` 回复一句短回执。",
        timestamp: 2_000,
        roomMessageSource: "owner_dispatch",
        roomAudienceAgentIds: ["co-ceo"],
      },
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: "message",
      displayTier: "main",
      message: expect.objectContaining({
        role: "user",
      }),
    });
  });

  it("hides owner-dispatch receipt instructions from the visible message body", () => {
    const items = buildChatDisplayItems([
      {
        role: "user",
        text:
          "全部启动 - 三管齐下并行推进 @CEO\n\n## 回执要求\n- 收到任务后，请先立即用 `[company_report:acknowledged] dispatch=dispatch:1` 回复一句短回执。",
        timestamp: 2_100,
        roomMessageSource: "owner_dispatch",
        roomAudienceAgentIds: ["co-ceo"],
      },
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: "message",
      displayTier: "main",
      message: expect.objectContaining({
        text: "全部启动 - 三管齐下并行推进 @CEO",
      }),
    });
  });

  it("filters synthetic owner-dispatch labels from the visible message list", () => {
    const items = buildChatDisplayItems([
      {
        role: "user",
        text: "派给 CEO",
        timestamp: 2_000,
        roomMessageSource: "owner_dispatch",
        roomAudienceAgentIds: ["co-ceo"],
      },
    ]);

    expect(items).toEqual([]);
  });

  it("drops messages that become empty after display sanitization", () => {
    const items = buildChatDisplayItems([
      {
        role: "user",
        text:
          "## 回执要求\n- 收到任务后，请先立即用 `[company_report:acknowledged] dispatch=dispatch:1` 回复一句短回执。",
        timestamp: 2_050,
        roomMessageSource: "owner_dispatch",
      },
      {
        role: "assistant",
        text:
          "[company_dispatch] companyId=c1 dispatchId=dispatch:1 fromActorId=ceo targetActorId=cto reportContract=use company_report with these exact ids reportStateGuide=acknowledged_only_if_still_working;answered_if_output_ready;blocked_if_owner_input_needed 请收到后回复 acknowledged 确认接单，完成后回复 answered 并提交结果。 dispatch: dispatch:topic:mission:10tzafe:1",
        timestamp: 2_051,
      },
    ]);

    expect(items).toEqual([]);
  });

  it("keeps full structured collaborator reports available for rendering", () => {
    const items = buildChatDisplayItems([
      {
        role: "assistant",
        text: "[company_report:answered] dispatch=dispatch:2\n## 当前状态确认\n1. MVP团队组建完成\n2. 技术架构已就绪\n3. 运营方案已就绪",
        timestamp: 2_500,
        provenance: {
          sourceActorId: "agent:ceo",
        },
      },
    ]);

    expect(items[0]).toMatchObject({
      kind: "report",
      displayTier: "main",
      detailContent: expect.stringContaining("## 当前状态确认"),
      report: expect.objectContaining({
        summary: expect.any(String),
        showFullContent: true,
      }),
    });
  });

  it("downgrades raw company_dispatch transport bodies into detail items", () => {
    const items = buildChatDisplayItems([
      {
        role: "assistant",
        text:
          "[company_dispatch] companyId=c1 dispatchId=dispatch:1 fromActorId=ceo targetActorId=cto reportContract=use company_report with these exact ids reportStateGuide=acknowledged_only_if_still_working;answered_if_output_ready;blocked_if_owner_input_needed CTO，请立即开始技术开发工作。 任务：启动A - 开始开发 请收到后回复 acknowledged 确认接单，完成后回复 answered 并提交结果。 dispatch: dispatch:topic:mission:10tzafe:1",
        timestamp: 2_300,
        roomAgentId: "co-cto",
        roomSenderLabel: "CTO",
      },
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: "message",
      displayTier: "detail",
      narrativeRole: "system_noise",
      message: expect.objectContaining({
        text: "CTO，请立即开始技术开发工作。",
      }),
      detailContent: expect.stringContaining("任务：启动A - 开始开发"),
    });
  });

  it("downgrades short collaborator acknowledgements into workflow status rows", () => {
    const items = buildChatDisplayItems([
      {
        role: "assistant",
        text: "收到！立即向 COO 传达老板的决策。",
        timestamp: 2_320,
        roomAgentId: "co-ceo",
      },
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: "report",
      displayTier: "status",
      narrativeRole: "workflow_status",
      message: expect.objectContaining({
        text: "收到！立即向 COO 传达老板的决策。",
      }),
    });
  });

  it("keeps substantive collaborator analysis in the main chat flow", () => {
    const items = buildChatDisplayItems([
      {
        role: "assistant",
        text: "初步看，番茄支持手机号、抖音账号和扫码登录。建议优先抖音账号登录，备选手机号登录。",
        timestamp: 2_330,
        roomAgentId: "co-coo",
      },
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: "message",
      displayTier: "main",
      narrativeRole: "member_update",
    });
  });

  it("strips workflow summary sections into expandable detail content", () => {
    const items = buildChatDisplayItems([
      {
        role: "assistant",
        text:
          "✅ 决策已传达给 COO\n\n已向 COO 派发任务，明确老板决策。\n\nDispatch ID: dispatch:1\n任务看板已更新，【启动C】进度调整为 60%。\n当前理解：老板已决策使用现有账号。\n建议下一步：等待 COO 确认接单。\n是否可推进：是 ✅",
        timestamp: 2_340,
      },
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: "message",
      displayTier: "main",
      message: expect.objectContaining({
        text: "✅ 决策已传达给 COO\n\n已向 COO 派发任务，明确老板决策。",
      }),
      detailContent: expect.stringContaining("Dispatch ID: dispatch:1"),
    });
  });

  it("downgrades executive bridge monologues into status rows", () => {
    const items = buildChatDisplayItems([
      {
        role: "assistant",
        text: "收到 COO 完成报告！让我更新任务看板并验证结果：",
        timestamp: 2_350,
      },
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: "message",
      displayTier: "status",
      narrativeRole: "workflow_status",
    });
  });

  it("anchors a structured requirement decision card to the matching assistant reply", () => {
    const items = buildChatDisplayItems([
      {
        role: "assistant",
        text: "先同步一下当前主线。",
        timestamp: 1_000,
      },
      {
        role: "assistant",
        text: "请选择接下来要启动的方案。",
        timestamp: 2_000,
        metadata: {
          control: {
            version: 1,
            decision: {
              key: "gate:launch-options",
              type: "requirement_gate",
              summary: "请选择下一步执行方案。",
              options: [
                { id: "a", label: "启动 A" },
                { id: "b", label: "启动 B" },
              ],
              requiresHuman: true,
              workItemId: "work:1",
              sourceConversationId: "agent:ceo:main",
            },
          },
        },
      },
    ]);

    const ticket: DecisionTicketRecord = {
      id: "decision:requirement:requirement_gate:work:1",
      companyId: "company-1",
      sourceType: "requirement",
      sourceId: "work:1",
      escalationId: null,
      aggregateId: null,
      workItemId: "work:1",
      sourceConversationId: "agent:ceo:main",
      decisionOwnerActorId: "agent:ceo",
      decisionType: "requirement_gate",
      summary: "请选择下一步执行方案。",
      options: [
        { id: "a", label: "启动 A" },
        { id: "b", label: "启动 B" },
      ],
      requiresHuman: true,
      status: "pending_human",
      resolution: null,
      resolutionOptionId: null,
      roomId: null,
      createdAt: 2_000,
      updatedAt: 2_000,
    };

    expect(
      findInlineRequirementDecisionAnchorId({
        displayItems: items,
        openDecisionTicket: ticket,
      }),
    ).toBe("2000:message");
  });

  it("falls back to the latest assistant reply for legacy pending decisions without a ticket", () => {
    const items = buildChatDisplayItems([
      {
        role: "assistant",
        text: "我已经收齐 HR、CTO、COO 的回执。",
        timestamp: 1_000,
      },
      {
        role: "assistant",
        text: "接下来需要你来做最终抉择。",
        timestamp: 2_000,
      },
    ]);

    expect(
      findInlineRequirementDecisionAnchorId({
        displayItems: items,
        openDecisionTicket: null,
        showLegacyPending: true,
      }),
    ).toBe("2000:message");
  });
});
