import type { CapabilityAuditEventRecord } from "../../domain/org/types";

export const CAPABILITY_AUDIT_ACTION_LABEL: Record<CapabilityAuditEventRecord["action"], string> = {
  created: "已登记",
  status_changed: "状态变更",
  smoke_test_succeeded: "验证通过",
  smoke_test_failed: "验证失败",
  run_succeeded: "运行成功",
  run_failed: "运行失败",
};

export const CAPABILITY_AUDIT_KIND_LABEL: Record<CapabilityAuditEventRecord["kind"], string> = {
  skill: "能力",
  request: "需求",
  issue: "问题",
  run: "运行",
};

export function buildCapabilityAuditTimeline(
  events: CapabilityAuditEventRecord[],
  labels?: {
    appLabelById?: Map<string, string>;
    skillLabelById?: Map<string, string>;
  },
) {
  return [...events]
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, 12)
    .map((event) => ({
      ...event,
      actionLabel: CAPABILITY_AUDIT_ACTION_LABEL[event.action],
      kindLabel: CAPABILITY_AUDIT_KIND_LABEL[event.kind],
      appLabel: event.appId ? labels?.appLabelById?.get(event.appId) ?? event.appId : null,
      skillLabel: event.skillId ? labels?.skillLabelById?.get(event.skillId) ?? event.skillId : null,
    }));
}
