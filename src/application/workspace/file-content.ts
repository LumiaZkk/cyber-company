import { useEffect, useState } from "react";
import { useArtifactApp } from "../artifact";
import { gateway } from "../gateway";
import type { WorkspaceFileRow } from "./index";

export function useWorkspaceFileContent(input: {
  activeCompanyId: string | null;
  activeWorkspaceWorkItemId: string | null;
  selectedFile: WorkspaceFileRow | null;
  shouldSyncProviderWorkspace: boolean;
}) {
  const { upsertArtifactRecord } = useArtifactApp();
  const [selectedFileContent, setSelectedFileContent] = useState("");
  const [loadingFileKey, setLoadingFileKey] = useState<string | null>(null);

  useEffect(() => {
    if (!input.selectedFile || !input.activeCompanyId) {
      setSelectedFileContent("");
      return;
    }

    const selectedFile = input.selectedFile;
    const artifactContent = selectedFile.content?.trim() ?? "";
    const previewText = selectedFile.previewText?.trim() ?? "";
    if (artifactContent.length > 0) {
      setSelectedFileContent(artifactContent);
      return;
    }
    if (!input.shouldSyncProviderWorkspace || !selectedFile.agentId || !selectedFile.name) {
      setSelectedFileContent(previewText);
      return;
    }

    let cancelled = false;
    const loadSelectedFile = async () => {
      if (previewText.length > 0) {
        setSelectedFileContent(previewText);
      } else {
        setSelectedFileContent("");
      }
      setLoadingFileKey(selectedFile.key);
      try {
        const result = await gateway.getAgentFile(selectedFile.agentId, selectedFile.name);
        if (!cancelled) {
          const content = result.file?.content ?? "";
          setSelectedFileContent(content);
          upsertArtifactRecord({
            id:
              selectedFile.artifactId ??
              `workspace:${input.activeCompanyId}:${selectedFile.agentId}:${result.file?.path ?? selectedFile.name}`,
            workItemId: input.activeWorkspaceWorkItemId,
            title: selectedFile.name,
            kind: selectedFile.kind,
            status: "ready",
            ownerActorId: selectedFile.agentId,
            providerId: gateway.providerId,
            sourceActorId: selectedFile.agentId,
            sourceName: selectedFile.name,
            sourcePath: result.file?.path ?? selectedFile.path,
            summary: selectedFile.previewText ?? undefined,
            content,
            createdAt: selectedFile.updatedAtMs ?? Date.now(),
            updatedAt: result.file?.updatedAtMs ?? Date.now(),
          });
        }
      } finally {
        if (!cancelled) {
          setLoadingFileKey(null);
        }
      }
    };

    void loadSelectedFile();
    return () => {
      cancelled = true;
    };
  }, [
    input.activeCompanyId,
    input.activeWorkspaceWorkItemId,
    input.selectedFile,
    input.shouldSyncProviderWorkspace,
    upsertArtifactRecord,
  ]);

  return {
    loadingFileKey,
    selectedFileContent,
  };
}
