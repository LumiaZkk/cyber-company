import { buildDefaultOrgSettings, DEFAULT_WORKSPACE_POLICY } from "../../domain/org/autonomy-policy";
import type { Company, CompanyWorkspacePolicy } from "../../domain/org/types";

export type WorkspacePolicySummary = {
  deliveryLabel: string;
  mirrorLabel: string;
  executionLabel: string;
  mirrorEnabled: boolean;
  deliveryDescription: string;
  mirrorDescription: string;
  executionDescription: string;
};

export function resolveCompanyWorkspacePolicy(
  company: Company | null | undefined,
): Required<CompanyWorkspacePolicy> {
  const policy = buildDefaultOrgSettings(company?.orgSettings).workspacePolicy ?? DEFAULT_WORKSPACE_POLICY;
  return {
    deliverySource: policy.deliverySource ?? DEFAULT_WORKSPACE_POLICY.deliverySource,
    providerMirrorMode: policy.providerMirrorMode ?? DEFAULT_WORKSPACE_POLICY.providerMirrorMode,
    executorWriteTarget: policy.executorWriteTarget ?? DEFAULT_WORKSPACE_POLICY.executorWriteTarget,
  };
}

export function buildWorkspacePolicySummary(
  policy: Pick<Required<CompanyWorkspacePolicy>, "deliverySource" | "providerMirrorMode" | "executorWriteTarget">,
): WorkspacePolicySummary {
  const deliveryLabel = "产品产物库";
  const deliveryDescription = "正式交付只以产品产物库为主真相源，不把执行器工作区文件直接当成业务交付。";
  const mirrorEnabled = policy.providerMirrorMode !== "disabled";
  const mirrorLabel = mirrorEnabled ? "镜像补位开启" : "镜像补位关闭";
  const mirrorDescription = mirrorEnabled
    ? "只有当正式产物缺位时，才会从执行器工作区镜像补位，避免镜像文件反客为主。"
    : "完全关闭执行器工作区镜像补位，工作目录只读取正式产物。";
  const executionLabel =
    policy.executorWriteTarget === "delivery_artifacts" ? "只写交付区" : "先写执行器工作区";
  const executionDescription =
    policy.executorWriteTarget === "delivery_artifacts"
      ? "执行结果直接沉淀到交付区，不依赖执行器工作区继续承载中间文件。"
      : "执行过程中允许先写执行器工作区，再通过镜像或正式产物沉淀回交付区。";

  return {
    deliveryLabel,
    mirrorLabel,
    executionLabel,
    mirrorEnabled,
    deliveryDescription,
    mirrorDescription,
    executionDescription,
  };
}

export function shouldUseProviderWorkspaceMirror(input: {
  policy: Pick<Required<CompanyWorkspacePolicy>, "providerMirrorMode">;
  supportsAgentFiles: boolean;
  storageStrategy?: string | null;
}): boolean {
  return (
    input.policy.providerMirrorMode !== "disabled" &&
    input.supportsAgentFiles &&
    input.storageStrategy === "provider-files"
  );
}
