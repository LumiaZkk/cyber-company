import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Company } from "../../domain/org/types";
import {
  DISPATCH_TRANSPORT_ACK_WINDOW_MS,
} from "./dispatch-policy";
import { enqueueDelegationDispatch } from "./async-dispatch";
import { startTurnToCompanyActor } from "../gateway";
import {
  recordDispatchBlocked,
  recordDispatchEnqueued,
  recordDispatchSent,
  recordDispatchUnconfirmed,
} from "./closed-loop";

vi.mock("../gateway", () => ({
  startTurnToCompanyActor: vi.fn(),
}));

vi.mock("./closed-loop", () => ({
  recordDispatchBlocked: vi.fn(),
  recordDispatchEnqueued: vi.fn(),
  recordDispatchSent: vi.fn(),
  recordDispatchUnconfirmed: vi.fn(),
}));

function createCompany(): Company {
  return {
    id: "company-1",
    name: "Async Co",
    description: "Async dispatch test company",
    icon: "🏢",
    template: "blank",
    employees: [
      {
        agentId: "company-1-ceo",
        nickname: "CEO",
        role: "Chief Executive Officer",
        isMeta: true,
        metaRole: "ceo",
      },
      {
        agentId: "company-1-cto",
        nickname: "CTO",
        role: "Chief Technology Officer",
        isMeta: true,
        metaRole: "cto",
      },
    ],
    quickPrompts: [],
    createdAt: 1,
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return { promise, resolve, reject };
}

const mockedStartTurnToCompanyActor = vi.mocked(startTurnToCompanyActor);
const mockedRecordDispatchBlocked = vi.mocked(recordDispatchBlocked);
const mockedRecordDispatchEnqueued = vi.mocked(recordDispatchEnqueued);
const mockedRecordDispatchSent = vi.mocked(recordDispatchSent);
const mockedRecordDispatchUnconfirmed = vi.mocked(recordDispatchUnconfirmed);

describe("enqueueDelegationDispatch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockedStartTurnToCompanyActor.mockReset();
    mockedRecordDispatchBlocked.mockReset().mockResolvedValue(undefined as never);
    mockedRecordDispatchEnqueued.mockReset().mockResolvedValue(undefined as never);
    mockedRecordDispatchSent.mockReset().mockResolvedValue(undefined as never);
    mockedRecordDispatchUnconfirmed.mockReset().mockResolvedValue(undefined as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns immediately, marks unconfirmed after 30s, and still records sent when ack arrives later", async () => {
    const sendDeferred = createDeferred<{ runId: string; status: "started" | "in_flight" }>();
    mockedStartTurnToCompanyActor.mockResolvedValue({
      actorRef: { providerId: "openclaw", actorId: "company-1-cto" },
      conversationRef: { providerId: "openclaw", conversationId: "agent:company-1-cto:main", kind: "direct", actorId: "company-1-cto" },
      providerConversationRef: {
        providerId: "openclaw",
        conversationId: "agent:company-1-cto:main",
        actorId: "company-1-cto",
        nativeRoom: false,
      },
      send: sendDeferred.promise,
    });

    const result = await enqueueDelegationDispatch({
      backend: {} as never,
      manifest: { providers: [] } as never,
      company: createCompany(),
      actorId: "company-1-cto",
      dispatchId: "dispatch:test-1",
      workItemId: "work:test-1",
      title: "Test dispatch",
      message: "Please handle this task.",
      summary: "Please handle this task.",
      fromActorId: "company-1-ceo",
      targetActorIds: ["company-1-cto"],
    });

    expect(result.dispatch).toMatchObject({
      id: "dispatch:test-1",
      status: "pending",
      deliveryState: "pending",
    });
    expect(mockedRecordDispatchEnqueued).toHaveBeenCalledTimes(1);
    expect(mockedRecordDispatchSent).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(DISPATCH_TRANSPORT_ACK_WINDOW_MS);
    expect(mockedRecordDispatchUnconfirmed).toHaveBeenCalledTimes(1);
    expect(mockedRecordDispatchBlocked).not.toHaveBeenCalled();

    sendDeferred.resolve({ runId: "run-1", status: "started" });
    await Promise.resolve();
    await Promise.resolve();

    expect(mockedRecordDispatchSent).toHaveBeenCalledTimes(1);
    expect(mockedRecordDispatchSent).toHaveBeenCalledWith(
      expect.objectContaining({
        dispatchId: "dispatch:test-1",
        providerRunId: "run-1",
      }),
    );
  });

  it("records blocked only for deterministic transport failures", async () => {
    mockedStartTurnToCompanyActor.mockResolvedValue({
      actorRef: { providerId: "openclaw", actorId: "company-1-cto" },
      conversationRef: { providerId: "openclaw", conversationId: "agent:company-1-cto:main", kind: "direct", actorId: "company-1-cto" },
      providerConversationRef: {
        providerId: "openclaw",
        conversationId: "agent:company-1-cto:main",
        actorId: "company-1-cto",
        nativeRoom: false,
      },
      send: Promise.reject(new Error("Unauthorized")),
    });

    await enqueueDelegationDispatch({
      backend: {} as never,
      manifest: { providers: [] } as never,
      company: createCompany(),
      actorId: "company-1-cto",
      dispatchId: "dispatch:test-2",
      workItemId: "work:test-2",
      title: "Deterministic failure",
      message: "Please handle this task.",
      summary: "Please handle this task.",
      fromActorId: "company-1-ceo",
      targetActorIds: ["company-1-cto"],
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(mockedRecordDispatchBlocked).toHaveBeenCalledTimes(1);
    expect(mockedRecordDispatchUnconfirmed).not.toHaveBeenCalled();
  });
});
