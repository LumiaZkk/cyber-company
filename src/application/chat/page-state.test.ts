import { describe, expect, it } from "vitest";

import { buildChatPageState } from "./page-state";

function createInput(overrides: Partial<Parameters<typeof buildChatPageState>[0]> = {}) {
  return {
    isGroup: false,
    sessionKey: "agent:on-58c5a4-ceo:main",
    recentAgentSessionsLength: 1,
    historyRoundItemsLength: 0,
    archiveHistoryNotice: null,
    hasActiveCompany: true,
    connected: true,
    isPageVisible: true,
    isArchiveView: false,
    isSummaryOpen: false,
    actionWatchesLength: 0,
    isCeoSession: false,
    effectiveRequirementRoom: null,
    roomBoundWorkItem: null,
    persistedWorkItem: null,
    ...overrides,
  };
}

describe("buildChatPageState", () => {
  it("uses a 5 minute fallback sync interval for all chat surfaces", () => {
    expect(buildChatPageState(createInput()).companySyncIntervalMs).toBe(5 * 60 * 1000);
    expect(
      buildChatPageState(
        createInput({
          isGroup: true,
          isSummaryOpen: true,
          actionWatchesLength: 2,
          isCeoSession: true,
        }),
      ).companySyncIntervalMs,
    ).toBe(5 * 60 * 1000);
  });

  it("still disables company sync when the page should not run background recovery", () => {
    expect(
      buildChatPageState(
        createInput({
          connected: false,
        }),
      ).shouldRunCompanySync,
    ).toBe(false);
    expect(
      buildChatPageState(
        createInput({
          isArchiveView: true,
        }),
      ).shouldRunCompanySync,
    ).toBe(false);
  });
});
