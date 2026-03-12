export type FocusActionButton = {
  id: string;
  label: string;
  description: string;
  kind: "message" | "navigate" | "recover" | "copy";
  tone: "primary" | "secondary" | "ghost";
  targetAgentId?: string;
  followupTargetAgentId?: string;
  followupTargetLabel?: string;
  preferResolvedSession?: boolean;
  href?: string;
  message?: string;
  confirmMessage?: string;
};

export type FocusActionWatch = {
  id: string;
  sessionKey: string;
  actionLabel: string;
  targetLabel: string;
  targetAgentId?: string;
  kind: "owner" | "handoff";
  startedAt: number;
  lastSeenTimestamp: number;
  hasReminder?: boolean;
};

export function dedupeFocusActions(actions: FocusActionButton[]): FocusActionButton[] {
  const byId = new Map<string, FocusActionButton>();
  actions.forEach((action) => {
    byId.set(action.id, action);
  });
  return [...byId.values()];
}
