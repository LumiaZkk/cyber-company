import type { ChatMessage } from "../../../application/gateway";
import type { CollaboratorReportCardVM } from "./message-reports";

export type ChatBlock = {
  type?: string;
  text?: string;
  name?: string;
  tool_use_id?: string;
  thinking?: string;
  source?: unknown;
};

export type ChatDisplayItem =
  | {
      kind: "message";
      id: string;
      message: ChatMessage;
    }
  | {
      kind: "report";
      id: string;
      message: ChatMessage;
      report: CollaboratorReportCardVM;
    }
  | {
      kind: "tool";
      id: string;
      title: string;
      detail: string;
      tone: "slate" | "sky";
      count: number;
    };

export const CHAT_UI_MESSAGE_LIMIT = 120;
