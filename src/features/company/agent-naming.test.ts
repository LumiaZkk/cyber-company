import { describe, expect, it } from "vitest";

import {
  allocateCompanyAgentNamespace,
  buildCompanyAgentSlug,
  buildCompanyRoleAgentName,
  collectExistingAgentHandles,
} from "./agent-naming";

describe("company agent naming", () => {
  it("translates common Chinese company terms into an English slug", () => {
    expect(buildCompanyAgentSlug("网络安全公司")).toBe("cyber-security-company");
    expect(buildCompanyAgentSlug("内容工厂")).toBe("content-factory");
    expect(buildCompanyAgentSlug("客服调度中心")).toBe("customer-service-dispatch-center");
  });

  it("keeps mixed ascii names while translating Chinese suffixes", () => {
    expect(buildCompanyAgentSlug("Alpha科技")).toBe("alpha-tech");
    expect(buildCompanyAgentSlug("AI内容工厂")).toBe("ai-content-factory");
  });

  it("falls back to a stable generic slug when no English token can be derived", () => {
    expect(buildCompanyAgentSlug("阿尔法")).toBe("company");
  });

  it("collects existing handles from both agent ids and display names", () => {
    const handles = collectExistingAgentHandles([
      { id: "network-security-co-ceo", name: "Network Security Co CEO" },
      { id: "content-factory-co-emp-0", identity: { name: "内容工厂员工" } },
    ]);

    expect(handles).toEqual(
      new Set([
        "network-security-co-ceo",
        "content-factory-co-emp-0",
        "content-factory",
      ]),
    );
  });

  it("allocates a new namespace when the translated company prefix already exists", () => {
    const namespace = allocateCompanyAgentNamespace("网络安全公司", [
      "cyber-security-company-co-ceo",
      "cyber-security-company-co-emp-0",
    ]);

    expect(namespace).toBe("cyber-security-company-co-2");
    expect(buildCompanyRoleAgentName(namespace, "CEO")).toBe("cyber-security-company-co-2-ceo");
  });

  it("avoids collisions for unknown Chinese names by incrementing the generic fallback", () => {
    const namespace = allocateCompanyAgentNamespace("阿尔法", [
      "company-co-ceo",
      "company-co-emp-0",
    ]);

    expect(namespace).toBe("company-co-2");
  });

  it("does not treat a numbered namespace as a collision for the base namespace", () => {
    const namespace = allocateCompanyAgentNamespace("阿尔法", [
      "company-co-2-ceo",
      "company-co-2-emp-0",
    ]);

    expect(namespace).toBe("company-co");
  });
});
