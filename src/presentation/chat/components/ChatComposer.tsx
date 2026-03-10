import { Paperclip, RefreshCcw, Send, Trash2 } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "../../../components/ui/button";
import { cn } from "../../../lib/utils";
import {
  createComposerMentionBoundaryRegex,
} from "../view-models/messages";
import type { RequirementRoomMentionCandidate } from "../../../application/delegation/room-routing";

export type ChatAttachment = {
  mimeType: string;
  dataUrl: string;
};

export type ChatComposerProps = {
  placeholder: string;
  sending: boolean;
  uploadingFile: boolean;
  attachments: ChatAttachment[];
  broadcastMode?: boolean;
  mentionCandidates?: RequirementRoomMentionCandidate[];
  prefill?: { id: string | number; text: string } | null;
  showBroadcastToggle?: boolean;
  onBroadcastModeChange?: (value: boolean) => void;
  onRemoveAttachment: (index: number) => void;
  onPickFile: () => void;
  onPasteImage: (file: File) => void;
  onSend: (draft: string) => Promise<boolean>;
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
  left: RequirementRoomMentionCandidate[],
  right: RequirementRoomMentionCandidate[],
) {
  if (left === right) {
    return true;
  }
  if (left.length !== right.length) {
    return false;
  }
  return left.every(
    (candidate, index) =>
      candidate.agentId === right[index]?.agentId &&
      candidate.label === right[index]?.label &&
      candidate.role === right[index]?.role,
  );
}

function isSamePrefill(
  left: { id: string | number; text: string } | null | undefined,
  right: { id: string | number; text: string } | null | undefined,
) {
  return left?.id === right?.id && left?.text === right?.text;
}

function areChatComposerPropsEqual(left: ChatComposerProps, right: ChatComposerProps) {
  return (
    left.placeholder === right.placeholder &&
    left.sending === right.sending &&
    left.uploadingFile === right.uploadingFile &&
    left.broadcastMode === right.broadcastMode &&
    left.showBroadcastToggle === right.showBroadcastToggle &&
    areChatAttachmentsEqual(left.attachments, right.attachments) &&
    areMentionCandidatesEqual(left.mentionCandidates ?? [], right.mentionCandidates ?? []) &&
    isSamePrefill(left.prefill, right.prefill) &&
    left.onBroadcastModeChange === right.onBroadcastModeChange &&
    left.onRemoveAttachment === right.onRemoveAttachment &&
    left.onPickFile === right.onPickFile &&
    left.onPasteImage === right.onPasteImage &&
    left.onSend === right.onSend
  );
}

export const ChatComposer = memo(function ChatComposer({
  placeholder,
  sending,
  uploadingFile,
  attachments,
  broadcastMode = false,
  mentionCandidates = [],
  prefill,
  showBroadcastToggle = false,
  onBroadcastModeChange,
  onRemoveAttachment,
  onPickFile,
  onPasteImage,
  onSend,
}: ChatComposerProps) {
  const [draft, setDraft] = useState("");
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [mentionSelectionIndex, setMentionSelectionIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const resizeFrameRef = useRef<number | null>(null);

  const scheduleTextareaResize = (target?: HTMLTextAreaElement | null) => {
    const nextTarget = target ?? textareaRef.current;
    if (!nextTarget) {
      return;
    }
    if (resizeFrameRef.current !== null) {
      window.cancelAnimationFrame(resizeFrameRef.current);
    }
    resizeFrameRef.current = window.requestAnimationFrame(() => {
      resizeFrameRef.current = null;
      nextTarget.style.height = "auto";
      nextTarget.style.height = `${Math.min(nextTarget.scrollHeight, 200)}px`;
    });
  };

  const resetDraft = () => {
    setDraft("");
    setMentionQuery(null);
    setMentionStart(null);
    setMentionSelectionIndex(0);
    if (textareaRef.current) {
      textareaRef.current.style.height = "44px";
    }
  };

  const filteredMentionCandidates = useMemo(() => {
    if (mentionQuery === null || mentionCandidates.length === 0) {
      return [];
    }

    const normalizedQuery = (mentionQuery ?? "").trim().toLowerCase();
    return mentionCandidates
      .filter((candidate) => {
        if (!normalizedQuery) {
          return true;
        }
        return [candidate.label, candidate.role, candidate.agentId].some((value) =>
          value.trim().toLowerCase().includes(normalizedQuery),
        );
      })
      .slice(0, 6);
  }, [mentionCandidates, mentionQuery]);

  const shortcutMentionCandidates = useMemo(
    () => mentionCandidates.slice(0, 4),
    [mentionCandidates],
  );

  const closeMentionPicker = () => {
    setMentionQuery(null);
    setMentionStart(null);
    setMentionSelectionIndex(0);
  };

  const updateMentionState = (value: string, cursor: number | null) => {
    if (!mentionCandidates.length) {
      closeMentionPicker();
      return;
    }

    const caret = typeof cursor === "number" ? cursor : value.length;
    const beforeCaret = value.slice(0, caret);
    const match = beforeCaret.match(createComposerMentionBoundaryRegex());
    if (!match || match.index == null) {
      closeMentionPicker();
      return;
    }

    const query = match[1] ?? "";
    const startIndex = match.index + match[0].lastIndexOf("@");
    setMentionQuery(query);
    setMentionStart(startIndex);
    setMentionSelectionIndex(0);
  };

  const commitMentionCandidate = (candidate: RequirementRoomMentionCandidate) => {
    if (!textareaRef.current) {
      return;
    }

    const target = textareaRef.current;
    const cursorEnd = target.selectionEnd ?? draft.length;
    const start = mentionStart ?? Math.max(0, cursorEnd - (mentionQuery?.length ?? 0) - 1);
    const inserted = `@${candidate.label} `;
    const nextDraft = `${draft.slice(0, start)}${inserted}${draft.slice(cursorEnd)}`;
    setDraft(nextDraft);
    closeMentionPicker();
    requestAnimationFrame(() => {
      if (!textareaRef.current) {
        return;
      }
      const nextCursor = start + inserted.length;
      textareaRef.current.focus();
      textareaRef.current.selectionStart = nextCursor;
      textareaRef.current.selectionEnd = nextCursor;
      scheduleTextareaResize(textareaRef.current);
    });
  };

  useEffect(() => {
    scheduleTextareaResize();
  }, [draft]);

  useEffect(() => {
    if (!prefill?.text) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      setDraft((previous) => (previous.trim() ? `${previous}\n\n${prefill.text}` : prefill.text));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [prefill?.id, prefill?.text]);

  useEffect(
    () => () => {
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current);
      }
    },
    [],
  );

  const handleSubmit = async () => {
    const ok = await onSend(draft);
    if (ok) {
      resetDraft();
    }
  };

  return (
    <>
      {attachments.length > 0 ? (
        <div className="mx-auto mb-2 flex max-w-4xl flex-wrap gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2">
          {attachments.map((attachment, index) => (
            <div
              key={`${attachment.mimeType}:${index}`}
              className="group relative h-16 w-16 overflow-hidden rounded-md border border-slate-200 shadow-sm"
            >
              <img
                src={attachment.dataUrl}
                alt="preview"
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                onClick={() => onRemoveAttachment(index)}
                className="absolute right-0.5 top-0.5 rounded-full bg-black/50 p-0.5 text-white opacity-0 transition-opacity hover:bg-black/70 group-hover:opacity-100"
                title="Remove attachment"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      ) : null}
      {shortcutMentionCandidates.length > 0 && mentionQuery === null ? (
        <div className="mx-auto mb-2 flex max-w-4xl flex-wrap items-center gap-2 px-1">
          <span className="text-[11px] text-slate-500">快速 @ 团队成员</span>
          {shortcutMentionCandidates.map((candidate) => (
            <button
              key={`shortcut:${candidate.agentId}`}
              type="button"
              className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 transition-colors hover:border-indigo-300 hover:bg-indigo-100"
              onMouseDown={(event) => {
                event.preventDefault();
                commitMentionCandidate(candidate);
              }}
            >
              <span>@{candidate.label}</span>
              <span className="text-[10px] text-indigo-500">{candidate.role}</span>
            </button>
          ))}
        </div>
      ) : null}
      <div className="relative mx-auto flex max-w-4xl items-end gap-2 rounded-xl border bg-slate-50 p-1 shadow-sm transition-shadow focus-within:ring-1 focus-within:ring-indigo-500">
        {showBroadcastToggle ? (
          <Button
            type="button"
            size="sm"
            variant={broadcastMode ? "default" : "ghost"}
            className={cn(
              "mb-1.5 ml-1 h-8 shrink-0 rounded-lg px-2 text-xs",
              broadcastMode
                ? "bg-amber-500 text-white hover:bg-amber-600"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-700",
            )}
            onClick={() => onBroadcastModeChange?.(!broadcastMode)}
            title={broadcastMode ? "当前会群发给所有成员" : "默认只发给当前 baton / 负责人"}
          >
            {broadcastMode ? "群发中" : "单派"}
          </Button>
        ) : null}
        <textarea
          ref={textareaRef}
          className="min-h-[44px] max-h-48 w-full resize-none border-0 bg-transparent p-3 text-sm focus:outline-none focus:ring-0"
          placeholder={placeholder}
          rows={1}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            updateMentionState(event.target.value, event.target.selectionStart);
          }}
          onKeyDown={(event) => {
            if (filteredMentionCandidates.length > 0) {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setMentionSelectionIndex((previous) =>
                  previous >= filteredMentionCandidates.length - 1 ? 0 : previous + 1,
                );
                return;
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setMentionSelectionIndex((previous) =>
                  previous <= 0 ? filteredMentionCandidates.length - 1 : previous - 1,
                );
                return;
              }
              if (event.key === "Enter" || event.key === "Tab") {
                event.preventDefault();
                const nextCandidate =
                  filteredMentionCandidates[
                    Math.min(mentionSelectionIndex, filteredMentionCandidates.length - 1)
                  ];
                if (nextCandidate) {
                  commitMentionCandidate(nextCandidate);
                }
                return;
              }
              if (event.key === "Escape") {
                closeMentionPicker();
                return;
              }
            }
            if (event.key !== "Enter") {
              return;
            }
            if (event.nativeEvent.isComposing) {
              return;
            }
            if (event.metaKey || event.ctrlKey) {
              event.preventDefault();
              void handleSubmit();
            }
          }}
          onClick={(event) =>
            updateMentionState(event.currentTarget.value, event.currentTarget.selectionStart)
          }
          onKeyUp={(event) =>
            updateMentionState(event.currentTarget.value, event.currentTarget.selectionStart)
          }
          onPaste={(event) => {
            const items = event.clipboardData?.items;
            if (!items) {
              return;
            }
            for (const item of items) {
              if (item.type.startsWith("image/")) {
                const file = item.getAsFile();
                if (file) {
                  event.preventDefault();
                  onPasteImage(file);
                  return;
                }
              }
            }
          }}
        />
        <div className="mb-0.5 mr-1 flex shrink-0 gap-1.5 border-r border-slate-200 px-1 pb-1.5 pr-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded text-slate-400 hover:bg-slate-100 hover:text-indigo-600"
            disabled={uploadingFile}
            onClick={onPickFile}
            title="附送参考文件至工作区"
          >
            {uploadingFile ? (
              <RefreshCcw className="h-4 w-4 animate-spin" />
            ) : (
              <Paperclip className="h-4 w-4" />
            )}
          </Button>
        </div>
        <Button
          size="icon"
          className="mb-1.5 mr-1.5 h-9 w-9 shrink-0 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
          disabled={sending || (!draft.trim() && attachments.length === 0)}
          onClick={() => void handleSubmit()}
          title="发送 (Cmd/Ctrl+Enter)"
        >
          <Send className="h-4 w-4" />
        </Button>
        {filteredMentionCandidates.length > 0 ? (
          <div className="absolute inset-x-3 bottom-[calc(100%+0.5rem)] z-20 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
            <div className="mb-1 px-2 text-[11px] text-slate-500">选择要 @ 的成员</div>
            <div className="space-y-1">
              {filteredMentionCandidates.map((candidate, index) => (
                <button
                  key={candidate.agentId}
                  type="button"
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-colors",
                    index === mentionSelectionIndex
                      ? "bg-indigo-50 text-indigo-700"
                      : "hover:bg-slate-50",
                  )}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    commitMentionCandidate(candidate);
                  }}
                >
                  <div>
                    <div className="text-sm font-medium">{candidate.label}</div>
                    <div className="text-[11px] text-slate-500">{candidate.role}</div>
                  </div>
                  <div className="text-[11px] text-slate-400">@{candidate.agentId}</div>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}, areChatComposerPropsEqual);
