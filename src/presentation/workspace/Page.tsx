import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  buildWorkspaceWorkbenchRequest,
  pickDefaultWorkspaceFile,
  useWorkspaceFileContent,
  useWorkspaceViewModel,
  type WorkspaceWorkbenchTool,
} from "../../application/workspace";
import { toast } from "../../components/system/toast-store";
import { usePageVisibility } from "../../lib/use-page-visibility";
import { Card, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { WorkspacePageContent } from "./components/WorkspacePageContent";

export function WorkspacePresentationPage() {
  const navigate = useNavigate();
  const isPageVisible = usePageVisibility();
  const prefillSequenceRef = useRef(0);
  const {
    activeCompany,
    activeWorkspaceWorkItem,
    agentLabelById,
    anchors,
    artifactBackedWorkspaceCount,
    canonFiles,
    chapterFiles,
    ctoEmployee,
    loadingIndex,
    mirroredOnlyWorkspaceCount,
    refreshIndex,
    reviewFiles,
    shouldSyncProviderWorkspace,
    supplementaryFiles,
    toolingFiles,
    workspaceApps,
    workspaceFiles,
  } = useWorkspaceViewModel({ isPageVisible });
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [selectedFileKey, setSelectedFileKey] = useState<string | null>(null);

  const selectedApp =
    (selectedAppId ? workspaceApps.find((app) => app.id === selectedAppId) : null) ?? workspaceApps[0];
  const selectedFile =
    (selectedFileKey ? workspaceFiles.find((file) => file.key === selectedFileKey) : null) ??
    pickDefaultWorkspaceFile(workspaceFiles);
  const { loadingFileKey, selectedFileContent } = useWorkspaceFileContent({
    activeCompanyId: activeCompany?.id ?? null,
    activeWorkspaceWorkItemId: activeWorkspaceWorkItem?.id ?? null,
    selectedFile,
    shouldSyncProviderWorkspace,
  });

  if (!activeCompany) {
    return <div className="p-8 text-center text-muted-foreground">未选择正在运营的公司组织</div>;
  }

  if (workspaceApps.length === 0) {
    return (
      <div className="p-8">
        <Card className="mx-auto max-w-2xl">
          <CardHeader>
            <CardTitle>当前公司还没有专属工作目录</CardTitle>
            <CardDescription>
              这家公司暂时没有启用公司级 workspace 应用。后续可以按公司类型继续扩展。
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const openCtoWorkbench = (tool: WorkspaceWorkbenchTool) => {
    if (!ctoEmployee) {
      toast.error("当前公司没有 CTO 节点", "至少需要一个 CTO 节点来承接公司级工具需求。");
      return;
    }

    const request = buildWorkspaceWorkbenchRequest(activeCompany, tool);
    prefillSequenceRef.current += 1;
    navigate(`/chat/${encodeURIComponent(ctoEmployee.agentId)}`, {
      state: {
        prefillText: request.prompt,
        prefillId: `${tool}:${prefillSequenceRef.current}`,
      },
    });
  };

  return (
    <WorkspacePageContent
      activeCompanyName={activeCompany.name}
      workspaceApps={workspaceApps}
      selectedApp={selectedApp}
      selectedFile={selectedFile}
      selectedFileKey={selectedFileKey}
      selectedFileContent={selectedFileContent}
      loadingFileKey={loadingFileKey}
      activeWorkspaceWorkItem={
        activeWorkspaceWorkItem
          ? {
              id: activeWorkspaceWorkItem.id,
              title: activeWorkspaceWorkItem.title,
              displayOwnerLabel: activeWorkspaceWorkItem.displayOwnerLabel,
              ownerLabel: activeWorkspaceWorkItem.ownerLabel,
              displayStage: activeWorkspaceWorkItem.displayStage,
              stageLabel: activeWorkspaceWorkItem.stageLabel,
              displayNextAction: activeWorkspaceWorkItem.displayNextAction,
              nextAction: activeWorkspaceWorkItem.nextAction,
            }
          : null
      }
      artifactBackedWorkspaceCount={artifactBackedWorkspaceCount}
      mirroredOnlyWorkspaceCount={mirroredOnlyWorkspaceCount}
      shouldSyncProviderWorkspace={shouldSyncProviderWorkspace}
      chapterFiles={chapterFiles}
      canonFiles={canonFiles}
      reviewFiles={reviewFiles}
      toolingFiles={toolingFiles}
      supplementaryFiles={supplementaryFiles}
      workspaceFiles={workspaceFiles}
      anchors={anchors}
      ctoLabel={ctoEmployee ? agentLabelById.get(ctoEmployee.agentId) ?? ctoEmployee.agentId : null}
      loadingIndex={loadingIndex}
      onRefreshIndex={refreshIndex}
      onSelectApp={setSelectedAppId}
      onSelectFile={setSelectedFileKey}
      onOpenCtoWorkbench={openCtoWorkbench}
      onOpenFileChat={(nextAgentId) => navigate(`/chat/${encodeURIComponent(nextAgentId)}`)}
      onOpenCtoChat={() => {
        if (ctoEmployee) {
          navigate(`/chat/${encodeURIComponent(ctoEmployee.agentId)}`);
        }
      }}
    />
  );
}
