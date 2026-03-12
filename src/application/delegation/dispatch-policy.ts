export const DISPATCH_TRANSPORT_ACK_WINDOW_MS = 30_000;
export const DISPATCH_TRANSPORT_REQUEST_TIMEOUT_MS = 300_000;
export const DISPATCH_BUSINESS_ACK_REMINDER_MS = 5 * 60_000;
export const DISPATCH_BUSINESS_ACK_REMINDER_MINUTES = 5;

export function buildDelegationDispatchMessage(message: string, dispatchId: string): string {
  const trimmed = message.trim();
  return [
    trimmed,
    "",
    "## 回执要求",
    `- 收到任务后，请先立即用 \`[company_report:acknowledged] dispatch=${dispatchId}\` 回复一句短回执。`,
    `- 如果已经完成，可以直接用 \`[company_report:answered] dispatch=${dispatchId}\` 回结果，无需补 \`acknowledged\`。`,
    `- 如果执行受阻，请用 \`[company_report:blocked] dispatch=${dispatchId}\` 明确说明阻塞原因。`,
  ].join("\n");
}

export function isDeterministicDispatchFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return [
    /No active company selected/i,
    /Unknown company/i,
    /companyId/i,
    /当前公司上下文未就绪/i,
    /当前公司没有 .* 节点/i,
    /未找到 .* 节点/i,
    /device identity required/i,
    /OpenClaw 地址未配置/i,
    /not supported/i,
    /unknown method/i,
    /\b(?:401|403|404)\b/,
    /Unauthorized/i,
    /Forbidden/i,
    /Unknown route/i,
  ].some((pattern) => pattern.test(message));
}
