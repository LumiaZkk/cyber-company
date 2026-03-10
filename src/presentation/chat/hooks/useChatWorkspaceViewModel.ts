import {
  useConversationWorkspaceApp,
  useConversationWorkspaceChatPageQuery,
} from "../../../application/mission";

export function useChatWorkspaceViewModel() {
  return {
    ...useConversationWorkspaceChatPageQuery(),
    ...useConversationWorkspaceApp(),
  };
}
