import { beforeEach, describe, expect, it } from "vitest";
import { useCompanyStore } from "./store";
import type { Company, RequirementRoomRecord } from "./types";

function createCompany(): Company {
  return {
    id: "company-1",
    name: "小说创作工作室",
    description: "测试公司",
    icon: "🦞",
    template: "novel",
    employees: [
      { agentId: "co-ceo", nickname: "CEO", role: "Chief Executive Officer", isMeta: true, metaRole: "ceo" },
      { agentId: "co-cto", nickname: "CTO", role: "Chief Technology Officer", isMeta: true, metaRole: "cto" },
      { agentId: "co-emp-1", nickname: "写手", role: "主笔写手", isMeta: false },
    ],
    quickPrompts: [],
    createdAt: 1,
  };
}

function createRoom(overrides: Partial<RequirementRoomRecord> = {}): RequirementRoomRecord {
  return {
    id: "workitem:mission-consistency-foundation",
    companyId: "company-1",
    workItemId: "mission:consistency-foundation",
    sessionKey: "room:workitem:mission-consistency-foundation",
    title: "一致性底座与内部审阅系统执行方案",
    topicKey: "mission:consistency-foundation",
    memberIds: ["co-ceo", "co-cto", "co-emp-1"],
    memberActorIds: ["co-ceo", "co-cto", "co-emp-1"],
    ownerAgentId: "co-ceo",
    ownerActorId: "co-ceo",
    status: "active",
    transcript: [
      {
        id: "room:user:1",
        role: "user",
        text: "@CTO 请输出一致性方案",
        timestamp: 1000,
        targetActorIds: ["co-cto"],
        audienceAgentIds: ["co-cto"],
        visibility: "public",
        source: "user",
      },
    ],
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

describe("useCompanyStore upsertRoomRecord", () => {
  beforeEach(() => {
    const storage = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
        removeItem: (key: string) => {
          storage.delete(key);
        },
      },
      configurable: true,
      writable: true,
    });

    useCompanyStore.setState({
      config: null,
      activeCompany: createCompany(),
      activeRoomRecords: [],
      activeMissionRecords: [],
      activeWorkItems: [],
      activeRoundRecords: [],
      activeArtifacts: [],
      activeDispatches: [],
      activeRoomBindings: [],
      loading: false,
      error: null,
      bootstrapPhase: "ready",
    });
  });

  it("does not trigger a store update when the room is semantically unchanged", () => {
    const room = createRoom();
    useCompanyStore.getState().upsertRoomRecord(room);

    let updates = 0;
    const unsubscribe = useCompanyStore.subscribe(() => {
      updates += 1;
    });

    useCompanyStore.getState().upsertRoomRecord({
      ...room,
      memberIds: ["co-emp-1", "co-ceo", "co-cto"],
      memberActorIds: ["co-emp-1", "co-ceo", "co-cto"],
    });

    unsubscribe();
    expect(updates).toBe(0);
  });

  it("updates the store when the room transcript changes", () => {
    const room = createRoom();
    useCompanyStore.getState().upsertRoomRecord(room);

    let updates = 0;
    const unsubscribe = useCompanyStore.subscribe(() => {
      updates += 1;
    });

    useCompanyStore.getState().upsertRoomRecord({
      ...room,
      transcript: [
        ...room.transcript,
        {
          id: "room:assistant:2",
          role: "assistant",
          text: "已收到，会输出一致性技术方案。",
          timestamp: 2000,
          senderAgentId: "co-cto",
          visibility: "public",
          source: "member_reply",
        },
      ],
      updatedAt: 2000,
    });

    unsubscribe();
    expect(updates).toBe(1);
    expect(useCompanyStore.getState().activeRoomRecords[0]?.transcript).toHaveLength(2);
  });

  it("does not update the store when only timestamps change but room semantics stay the same", () => {
    const room = createRoom();
    useCompanyStore.getState().upsertRoomRecord(room);

    let updates = 0;
    const unsubscribe = useCompanyStore.subscribe(() => {
      updates += 1;
    });

    useCompanyStore.getState().upsertRoomRecord({
      ...room,
      updatedAt: 9999,
      transcript: room.transcript.map((message) => ({ ...message })),
    });

    unsubscribe();
    expect(updates).toBe(0);
    expect(useCompanyStore.getState().activeRoomRecords[0]?.updatedAt).toBe(1000);
  });

  it("merges semantically identical strategic rooms with different runtime ids into one canonical room", () => {
    useCompanyStore.getState().upsertRoomRecord(
      createRoom({
        id: "room:legacy-consistency-1",
        sessionKey: "room:legacy-consistency-1",
        workItemId: "topic:mission:consistency-foundation",
      }),
    );

    useCompanyStore.getState().upsertRoomRecord(
      createRoom({
        id: "room:legacy-consistency-2",
        sessionKey: "room:legacy-consistency-2",
        workItemId: "topic:mission:consistency-foundation",
        transcript: [
          {
            id: "room:assistant:2",
            role: "assistant",
            text: "CTO：一致性底座方案已提交。",
            timestamp: 2000,
            senderAgentId: "co-cto",
            visibility: "public",
            source: "member_reply",
          },
        ],
        updatedAt: 2000,
      }),
    );

    const rooms = useCompanyStore.getState().activeRoomRecords;
    expect(rooms).toHaveLength(1);
    expect(rooms[0]?.id).toBe("workitem:topic:mission:consistency-foundation");
    expect(rooms[0]?.transcript).toHaveLength(2);
  });
});
