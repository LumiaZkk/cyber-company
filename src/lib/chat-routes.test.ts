import { describe, expect, it } from "vitest";

import {
  appendCompanyScopeToChatRoute,
  buildCompanyChatRoute,
  findCompaniesByAgentId,
  resolveConversationPresentation,
} from "./chat-routes";
import type { CyberCompanyConfig } from "../features/company/types";

function createConfig(): CyberCompanyConfig {
  return {
    version: 1,
    activeCompanyId: "live",
    preferences: { theme: "classic", locale: "zh-CN" },
    companies: [
      {
        id: "live",
        name: "Live 公司",
        description: "",
        icon: "🏢",
        template: "blank",
        employees: [
          { agentId: "live-ceo", nickname: "CEO", role: "CEO", isMeta: true, metaRole: "ceo" },
          { agentId: "shared-cto", nickname: "CTO", role: "CTO", isMeta: true, metaRole: "cto" },
        ],
        quickPrompts: [],
        createdAt: 1,
      },
      {
        id: "novel",
        name: "小说公司",
        description: "",
        icon: "📚",
        template: "novel",
        employees: [
          { agentId: "novel-ceo", nickname: "CEO", role: "CEO", isMeta: true, metaRole: "ceo" },
          { agentId: "shared-cto", nickname: "总工", role: "CTO", isMeta: true, metaRole: "cto" },
        ],
        quickPrompts: [],
        createdAt: 2,
      },
    ],
  };
}

describe("chat routing helpers", () => {
  it("builds company-scoped chat routes", () => {
    expect(buildCompanyChatRoute("live-ceo", "live")).toBe("/chat/live-ceo?cid=live");
    expect(appendCompanyScopeToChatRoute("/chat/room%3Aabc?m=a,b", "live")).toBe(
      "/chat/room%3Aabc?m=a%2Cb&cid=live",
    );
  });

  it("finds all companies that reuse the same agent id", () => {
    expect(findCompaniesByAgentId(createConfig(), "shared-cto").map((company) => company.id)).toEqual([
      "live",
      "novel",
    ]);
  });

  it("keeps company scope in conversation presentation routes", () => {
    const presentation = resolveConversationPresentation({
      actorId: "live-ceo",
      companyId: "live",
      employees: [{ agentId: "live-ceo", nickname: "CEO", role: "CEO" }],
    });

    expect(presentation.route).toBe("/chat/live-ceo?cid=live");
  });
});
