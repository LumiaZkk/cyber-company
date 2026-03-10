import {
  memo,
  useCallback,
  useMemo,
  type ChangeEventHandler,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import type { RequirementRoomMentionCandidate } from "../../../application/delegation/room-routing";
import { ChatComposer, type ChatAttachment } from "./ChatComposer";

type ChatComposerFooterProps = {
  isArchiveView: boolean;
  isGenerating: boolean;
  fileInputRef: RefObject<HTMLInputElement | null>;
  handleFileSelect: ChangeEventHandler<HTMLInputElement>;
  placeholder: string;
  sending: boolean;
  uploadingFile: boolean;
  attachments: ChatAttachment[];
  roomBroadcastMode: boolean;
  requirementRoomMentionCandidates?: RequirementRoomMentionCandidate[];
  composerPrefill?: { id: string | number; text: string } | null;
  routeComposerPrefill?: { id: string | number; text: string } | null;
  setRoomBroadcastMode: (value: boolean) => void;
  setAttachments: Dispatch<SetStateAction<ChatAttachment[]>>;
  processImageFile: (file: File) => Promise<void> | void;
  handleSend: (draft: string) => Promise<boolean>;
};

function areChatAttachmentsEqual(left: ChatAttachment[], right: ChatAttachment[]) {
  if (left === right) {
    return true;
  }
  if (left.length !== right.length) {
    return false;
  }
  return left.every(
    (attachment, index) =>
      attachment.mimeType === right[index]?.mimeType &&
      attachment.dataUrl === right[index]?.dataUrl,
  );
}

function areMentionCandidatesEqual(
  left: RequirementRoomMentionCandidate[] | undefined,
  right: RequirementRoomMentionCandidate[] | undefined,
) {
  const leftList = left ?? [];
  const rightList = right ?? [];
  if (leftList === rightList) {
    return true;
  }
  if (leftList.length !== rightList.length) {
    return false;
  }
  return leftList.every(
    (candidate, index) =>
      candidate.agentId === rightList[index]?.agentId &&
      candidate.label === rightList[index]?.label &&
      candidate.role === rightList[index]?.role,
  );
}

function isSamePrefill(
  left: { id: string | number; text: string } | null | undefined,
  right: { id: string | number; text: string } | null | undefined,
) {
  return left?.id === right?.id && left?.text === right?.text;
}

function areChatComposerFooterPropsEqual(
  left: ChatComposerFooterProps,
  right: ChatComposerFooterProps,
) {
  return (
    left.isArchiveView === right.isArchiveView &&
    left.isGenerating === right.isGenerating &&
    left.fileInputRef === right.fileInputRef &&
    left.handleFileSelect === right.handleFileSelect &&
    left.placeholder === right.placeholder &&
    left.sending === right.sending &&
    left.uploadingFile === right.uploadingFile &&
    areChatAttachmentsEqual(left.attachments, right.attachments) &&
    left.roomBroadcastMode === right.roomBroadcastMode &&
    areMentionCandidatesEqual(
      left.requirementRoomMentionCandidates,
      right.requirementRoomMentionCandidates,
    ) &&
    isSamePrefill(left.composerPrefill, right.composerPrefill) &&
    isSamePrefill(left.routeComposerPrefill, right.routeComposerPrefill) &&
    left.setRoomBroadcastMode === right.setRoomBroadcastMode &&
    left.setAttachments === right.setAttachments &&
    left.processImageFile === right.processImageFile &&
    left.handleSend === right.handleSend
  );
}

const GeneratingBadge = memo(function GeneratingBadge() {
  return (
    <div className="absolute -top-10 left-4 z-20 flex -translate-y-2 items-center gap-2 rounded-t-xl rounded-r-xl border border-slate-200/60 bg-white/90 px-4 py-2 pb-1 text-xs shadow-sm backdrop-blur">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-75"></span>
        <span className="relative inline-flex h-2 w-2 rounded-full bg-indigo-500"></span>
      </span>
      <span>正在生成中...</span>
    </div>
  );
});

export const ChatComposerFooter = memo(function ChatComposerFooter(input: ChatComposerFooterProps) {
  const {
    isArchiveView,
    isGenerating,
    fileInputRef,
    handleFileSelect,
    placeholder,
    sending,
    uploadingFile,
    attachments,
    roomBroadcastMode,
    requirementRoomMentionCandidates,
    composerPrefill: localComposerPrefill,
    routeComposerPrefill,
    setRoomBroadcastMode,
    setAttachments,
    processImageFile,
    handleSend,
  } = input;

  const handleRemoveAttachment = useCallback(
    (index: number) => {
      setAttachments((arr) => arr.filter((_, i) => i !== index));
    },
    [setAttachments],
  );

  const handlePickFile = useCallback(() => {
    fileInputRef.current?.click();
  }, [fileInputRef]);

  const mergedComposerPrefill = useMemo(
    () => composerPrefillOrRoute(localComposerPrefill, routeComposerPrefill),
    [localComposerPrefill, routeComposerPrefill],
  );

  if (isArchiveView) {
    return null;
  }

  return (
    <footer className="relative shrink-0 border-t bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:p-4">
      {isGenerating ? <GeneratingBadge /> : null}
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        onChange={handleFileSelect}
        accept=".txt,.md,.json,.js,.ts,.csv,.yaml,.yml,.log,image/*"
      />
      <ChatComposer
        placeholder={placeholder}
        sending={sending}
        uploadingFile={uploadingFile}
        attachments={attachments}
        broadcastMode={roomBroadcastMode}
        mentionCandidates={requirementRoomMentionCandidates}
        prefill={mergedComposerPrefill}
        showBroadcastToggle={Boolean(requirementRoomMentionCandidates)}
        onBroadcastModeChange={setRoomBroadcastMode}
        onRemoveAttachment={handleRemoveAttachment}
        onPickFile={handlePickFile}
        onPasteImage={processImageFile}
        onSend={handleSend}
      />
    </footer>
  );
}, areChatComposerFooterPropsEqual);

function composerPrefillOrRoute(
  composerPrefill: { id: string | number; text: string } | null | undefined,
  routeComposerPrefill: { id: string | number; text: string } | null | undefined,
) {
  return composerPrefill ?? routeComposerPrefill ?? null;
}
