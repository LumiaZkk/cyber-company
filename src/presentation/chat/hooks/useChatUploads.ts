import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import { syncTextReferenceFileToAgents } from "../../../application/artifact/chat-upload";
import type { ChatSendAttachment } from "../../../application/delegation/chat-send";
import { toast } from "../../../components/system/toast-store";

export function useChatUploads(input: {
  isGroup: boolean;
  groupMembers: string[];
  agentId: string | null;
  setComposerPrefill: Dispatch<SetStateAction<{ id: string | number; text: string } | null>>;
  setAttachments: Dispatch<SetStateAction<ChatSendAttachment[]>>;
}) {
  const [uploadingFile, setUploadingFile] = useState(false);

  const processTextFileUpload = useCallback(
    async (file: File) => {
      if (!file) {
        return;
      }
      if (file.size > 1024 * 1024 * 5) {
        toast.error("文件过大，请上传 5MB 以内的纯文本参考文件。");
        return;
      }

      setUploadingFile(true);
      try {
        const textContent = await file.text();
        const targetAgentIds = input.isGroup
          ? input.groupMembers.filter(Boolean)
          : input.agentId
            ? [input.agentId]
            : [];
        const uploadCount =
          targetAgentIds.length > 0
            ? await syncTextReferenceFileToAgents({
                fileName: file.name,
                textContent,
                agentIds: targetAgentIds,
              })
            : 0;

        if (uploadCount > 0) {
          toast.success(`文件 ${file.name} 已同步到 ${uploadCount} 个成员工作区。`);
          input.setComposerPrefill({
            id: Date.now(),
            text: `请参考我刚刚传到工作区里的 ${file.name} 文件`,
          });
        }
      } catch (error) {
        console.error(error);
        toast.error(`上传失败: ${String(error)}`);
      } finally {
        setUploadingFile(false);
      }
    },
    [input],
  );

  const processImageFile = useCallback(
    (file: File) => {
      if (file.size > 1024 * 1024 * 5) {
        toast.error("图片过大，请上传 5MB 以内的图片。");
        return;
      }

      setUploadingFile(true);
      const reader = new FileReader();
      reader.addEventListener("load", (event) => {
        const base64 = event.target?.result;
        if (typeof base64 === "string") {
          input.setAttachments((previous) => [
            ...previous,
            {
              mimeType: file.type,
              dataUrl: base64,
            },
          ]);
        }
        setUploadingFile(false);
      });
      reader.addEventListener("error", () => {
        toast.error("图片读取失败");
        setUploadingFile(false);
      });
      reader.readAsDataURL(file);
    },
    [input],
  );

  const handleFileSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        if (file.type.startsWith("image/")) {
          processImageFile(file);
        } else {
          void processTextFileUpload(file);
        }
      }
      event.target.value = "";
    },
    [processImageFile, processTextFileUpload],
  );

  return {
    uploadingFile,
    processTextFileUpload,
    processImageFile,
    handleFileSelect,
  };
}
