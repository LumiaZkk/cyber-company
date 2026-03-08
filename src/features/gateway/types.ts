export interface GatewayModelChoice {
  id: string;
  name: string;
  provider: string;
  contextWindow?: number;
  reasoning?: boolean;
}

export interface GatewayModelsListParams {
  scope?: "allowed" | "catalog";
}

export interface GatewayAuthImportCodexCliResult {
  ok: true;
  profileId: string;
  provider: string;
  expiresAtMs: number;
  accountId?: string;
}

export interface GatewayAuthCodexOauthStartResult {
  authUrl: string;
  state: string;
  redirectUri: string;
  expiresAtMs: number;
}

export interface GatewayAuthCodexOauthCallbackResult {
  ok: true;
  profileId: string;
  provider: string;
  expiresAtMs: number;
  accountId?: string;
}

export interface GatewayAuthCodexOauthStatusResult {
  status: "pending" | "success" | "error";
  expiresAtMs: number;
  authUrl?: string;
  profileId?: string;
  provider?: string;
  accountId?: string;
  errorMessage?: string;
}
