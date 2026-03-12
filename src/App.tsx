import {
  Building2,
  Users,
  LayoutDashboard,
  BarChart,
  BookOpen,
  BookOpenCheck,
  Settings,
  CalendarClock,
  Menu,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { Suspense, lazy, useEffect, useRef, useState, type ReactNode } from "react";
import { Routes, Route, Link, useLocation, Navigate } from "react-router-dom";
import { ApprovalModalHost } from "./components/system/approval-modal-host";
import { CompanyAuthoritySyncHost } from "./components/system/company-authority-sync-host";
import { GatewayNotificationHost } from "./components/system/gateway-notification-host";
import { RequirementAggregateHost } from "./components/system/requirement-aggregate-host";
import { GatewayStatusBanner } from "./components/system/gateway-status-banner";
import { ToastHost } from "./components/ui/toast-host";
import {
  clearLiveChatSession,
  readLiveChatSession,
  upsertLiveChatSession,
} from "./application/chat/live-session-cache";
import { parseChatEventPayload } from "./application/delegation/chat-dispatch";
import { gateway } from "./application/gateway";
import { useCompanyShellCommands, useCompanyShellQuery } from "./application/company/shell";
import { useGatewayStore } from "./application/gateway";
import { peekCachedCompanyConfig } from "./infrastructure/company/persistence/persistence";
import { getCompanyWorkspaceApps } from "./application/company/workspace-apps";
import { OrgAutopilotHost } from "./presentation/org/OrgAutopilotHost";
import { extractTextFromMessage } from "./presentation/chat/view-models/messages";
import { toast } from "./components/system/toast-store";
import { resolveSessionActorId } from "./lib/sessions";
import { useCompanyRuntimeStore } from "./infrastructure/company/runtime/store";

const AutomationPage = lazy(() =>
  import("./pages/AutomationPage").then((module) => ({ default: module.AutomationPage })),
);
const BoardPage = lazy(() =>
  import("./pages/BoardPage").then((module) => ({ default: module.BoardPage })),
);
const ChatPage = lazy(() =>
  import("./pages/ChatPage").then((module) => ({ default: module.ChatPage })),
);
const CompanyCreate = lazy(() =>
  import("./pages/CompanyCreate").then((module) => ({ default: module.CompanyCreate })),
);
const CompanyLobby = lazy(() =>
  import("./pages/CompanyLobby").then((module) => ({ default: module.CompanyLobby })),
);
const CompanySelect = lazy(() =>
  import("./pages/CompanySelect").then((module) => ({ default: module.CompanySelect })),
);
const ConnectPage = lazy(() =>
  import("./pages/ConnectPage").then((module) => ({ default: module.ConnectPage })),
);
const CodexOAuthCallbackPage = lazy(() =>
  import("./pages/CodexOAuthCallbackPage").then((module) => ({
    default: module.CodexOAuthCallbackPage,
  })),
);
const CEOHomePage = lazy(() =>
  import("./pages/CEOHomePage").then((module) => ({ default: module.CEOHomePage })),
);
const DashboardPage = lazy(() =>
  import("./pages/DashboardPage").then((module) => ({ default: module.DashboardPage })),
);
const EmployeeList = lazy(() =>
  import("./pages/EmployeeList").then((module) => ({ default: module.EmployeeList })),
);
const EmployeeProfile = lazy(() =>
  import("./pages/EmployeeProfile").then((module) => ({ default: module.EmployeeProfile })),
);
const RequirementCenterPage = lazy(() =>
  import("./pages/RequirementCenterPage").then((module) => ({
    default: module.RequirementCenterPage,
  })),
);
const SettingsPage = lazy(() =>
  import("./pages/SettingsPage").then((module) => ({ default: module.SettingsPage })),
);
const WorkspacePage = lazy(() =>
  import("./pages/WorkspacePage").then((module) => ({ default: module.WorkspacePage })),
);

function CompanyBootstrapScreen() {
  return (
    <div className="flex h-full min-h-[320px] items-center justify-center p-8">
      <div className="rounded-2xl border bg-card px-6 py-5 text-center shadow-sm">
        <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
        <div className="text-sm font-medium">正在恢复公司上下文...</div>
        <div className="mt-1 text-xs text-muted-foreground">完成后会自动返回你上次所在的组织。</div>
      </div>
    </div>
  );
}

function RouteLoadingScreen() {
  return (
    <div className="flex h-full min-h-[320px] items-center justify-center p-8">
      <div className="rounded-2xl border bg-card px-6 py-5 text-center shadow-sm">
        <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
        <div className="text-sm font-medium">正在加载页面...</div>
        <div className="mt-1 text-xs text-muted-foreground">当前路由模块正在按需加载。</div>
      </div>
    </div>
  );
}

type QuickSwitchProps = {
  hasPrimaryRequirement: boolean;
};

function MainlineQuickSwitch({ hasPrimaryRequirement }: QuickSwitchProps) {
  const location = useLocation();
  const options = [{ name: "CEO 首页", path: "/" }];
  if (hasPrimaryRequirement) {
    options.push({ name: "需求中心", path: "/requirement" });
  }

  return (
    <div className="mr-2 flex items-center gap-1 rounded-full border bg-secondary/50 p-1 shadow-xs">
      <div className="px-2 flex items-center text-xs font-semibold text-muted-foreground">
        <Sparkles className="mr-1 h-3.5 w-3.5" />
        主线快切
      </div>
      {options.map((opt) => (
        <Link
          key={opt.path}
          to={opt.path}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
            location.pathname === opt.path
              ? "bg-background text-foreground shadow-sm ring-1 ring-border"
              : "text-muted-foreground hover:bg-black/5"
          }`}
        >
          {opt.name}
        </Link>
      ))}
    </div>
  );
}

export default function App() {
  const location = useLocation();
  const { loadConfig } = useCompanyShellCommands();
  const { loading, activeCompany, bootstrapPhase } = useCompanyShellQuery();
  const hasPrimaryRequirement = useCompanyRuntimeStore(
    (state) => Boolean(state.primaryRequirementId || state.activeRequirementAggregates.some((aggregate) => aggregate.primary)),
  );
  const {
    connected,
    phase,
    hasEverConnected,
    autoConnectInitialized,
    bootstrapAutoConnect,
    providerId,
    providers,
  } = useGatewayStore();
  const cachedBootstrapConfig = peekCachedCompanyConfig();
  const cachedBootstrapCompany =
    cachedBootstrapConfig
      ? (
          cachedBootstrapConfig.companies.find(
            (company) => company.id === cachedBootstrapConfig.activeCompanyId,
          ) ??
          cachedBootstrapConfig.companies[0] ??
          null
        )
      : null;
  const previousConnectedRef = useRef(connected);
  const hasSeenStableConnectionRef = useRef(connected);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const currentProvider = providers.find((provider) => provider.id === providerId);

  useEffect(() => {
    bootstrapAutoConnect();
  }, [bootstrapAutoConnect]);

  useEffect(() => {
    if (connected) {
      void loadConfig();
    }
  }, [connected, loadConfig]);

  useEffect(() => {
    if (!activeCompany || !connected) {
      return;
    }

    const companyAgentIds = new Set(activeCompany.employees.map((employee) => employee.agentId));
    const unsubscribe = gateway.subscribe("chat", (rawPayload) => {
      const payload = parseChatEventPayload(rawPayload);
      const sessionKey = payload?.sessionKey?.trim();
      if (!payload || !sessionKey) {
        return;
      }

      const actorId = resolveSessionActorId(sessionKey);
      if (!actorId || !companyAgentIds.has(actorId)) {
        return;
      }

      if (payload.state === "delta") {
        const deltaText = extractTextFromMessage(payload.message);
        if (!deltaText) {
          return;
        }

        const existing = readLiveChatSession(activeCompany.id, sessionKey);
        if (existing?.streamText && existing.streamText.length > deltaText.length) {
          return;
        }

        upsertLiveChatSession(activeCompany.id, sessionKey, {
          sessionKey,
          agentId: actorId,
          runId: payload.runId || existing?.runId || null,
          streamText: deltaText,
          isGenerating: true,
          startedAt: existing?.startedAt ?? Date.now(),
          updatedAt: Date.now(),
        });
        return;
      }

      if (payload.state === "final" || payload.state === "aborted" || payload.state === "error") {
        clearLiveChatSession(activeCompany.id, sessionKey);
      }
    });

    return () => unsubscribe();
  }, [activeCompany, connected]);

  useEffect(() => {
    // Avoid racing cached-config fallback against the initial auto-reconnect boot.
    if (
      !connected &&
      hasEverConnected &&
      autoConnectInitialized &&
      phase === "offline" &&
      !activeCompany &&
      !loading
    ) {
      void loadConfig();
    }
  }, [activeCompany, autoConnectInitialized, connected, hasEverConnected, loading, loadConfig, phase]);

  useEffect(() => {
    const previousConnected = previousConnectedRef.current;
    if (connected && !hasSeenStableConnectionRef.current) {
      hasSeenStableConnectionRef.current = true;
      previousConnectedRef.current = connected;
      return;
    }
    if (previousConnected && !connected) {
      toast.warning("Authority 连接已断开", "系统正在自动重连。你可以继续停留在当前页面。");
    } else if (!previousConnected && connected) {
      toast.success("Authority 已恢复连接", "本机权威源和执行能力已恢复。");
    }
    previousConnectedRef.current = connected;
  }, [connected]);

  if (
    !connected &&
    phase === "failed" &&
    location.pathname !== "/connect" &&
    location.pathname !== "/oauth/codex/callback"
  ) {
    return <Navigate to="/connect" replace />;
  }

  if (!connected && !hasEverConnected) {
    return (
      <>
        <ConnectPage />
        <ToastHost />
      </>
    );
  }

  const isFullScreenRoute = ["/select", "/create", "/connect", "/oauth/codex/callback"].includes(
    location.pathname,
  );
  let content: ReactNode;

  if (isFullScreenRoute) {
    content = (
      <div className="flex h-screen w-full bg-background text-foreground overflow-hidden">
        <main className="flex-1 flex flex-col h-full overflow-y-auto relative">
          <Suspense fallback={<RouteLoadingScreen />}>
            <Routes>
              <Route path="/select" element={<CompanySelect />} />
              <Route path="/connect" element={<ConnectPage />} />
              <Route path="/create" element={<CompanyCreate />} />
              <Route path="/oauth/codex/callback" element={<CodexOAuthCallbackPage />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    );
  } else {
    const companyBootstrapPending =
      !activeCompany &&
      (
        bootstrapPhase === "idle" ||
        bootstrapPhase === "restoring" ||
        loading ||
        (hasEverConnected && !autoConnectInitialized) ||
        phase === "connecting" ||
        phase === "reconnecting"
      );
    const currentCompany = activeCompany ?? cachedBootstrapCompany;
    const shouldUseSilentRestoreShell = companyBootstrapPending && Boolean(currentCompany);

    if (companyBootstrapPending && !shouldUseSilentRestoreShell) {
      content = <CompanyBootstrapScreen />;
    } else if (!activeCompany && !shouldUseSilentRestoreShell) {
      content = <Navigate to="/select" replace />;
    } else {
      const resolvedCompany = currentCompany!;
      const sidebarBg = "bg-muted/30";
      const textIconColor = "text-primary";
      const linkHover = "hover:bg-secondary/50 hover:text-foreground";
      const isRouteActive = (path: string) => {
        if (path === "/ops") {
          return location.pathname === "/ops" || location.pathname === "/lobby";
        }
        return location.pathname === path || location.pathname.startsWith(`${path}/`);
      };
      const navClass = (path: string) => {
        return `flex items-center rounded-xl px-3 py-2 text-sm font-medium ${
          isRouteActive(path)
            ? "bg-secondary text-secondary-foreground shadow-sm"
            : `text-muted-foreground ${linkHover}`
        }`;
      };
      const navGroupLabelClass =
        "px-3 pt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/80";
      const workspaceApps = getCompanyWorkspaceApps(resolvedCompany);
      const ceoEmployee =
        resolvedCompany.employees.find((employee) => employee.metaRole === "ceo") ?? null;
      const navGroups = [
        {
          label: "主线",
          items: [
            { path: "/", label: "CEO 首页", icon: Building2 },
            { path: "/requirement", label: "需求中心", icon: BookOpenCheck, primary: true },
          ],
        },
        {
          label: "执行",
          items: [
            { path: "/ops", label: "运营大厅", icon: ShieldAlert },
            { path: "/board", label: "工作看板", icon: LayoutDashboard },
            ...(workspaceApps.length > 0
              ? [{ path: "/workspace", label: "工作目录", icon: BookOpen }]
              : []),
          ],
        },
        {
          label: "组织",
          items: [
            { path: "/employees", label: "员工管理", icon: Users },
            { path: "/automation", label: "自动化", icon: CalendarClock },
          ],
        },
        {
          label: "系统",
          items: [
            { path: "/dashboard", label: "运营报表", icon: BarChart },
            { path: "/settings", label: "系统设置", icon: Settings },
          ],
        },
      ] as const;

      const connectionIndicatorClass = connected
        ? "bg-green-500"
        : phase === "reconnecting" || phase === "connecting"
          ? "bg-amber-500 animate-pulse"
          : phase === "failed"
            ? "bg-rose-500"
            : "bg-red-500";
      const connectionLabel = connected
        ? `已连接到${currentProvider?.label || "本机 authority"}`
        : phase === "reconnecting" || phase === "connecting"
          ? "连接中断，正在重连"
          : phase === "failed"
            ? "重连失败，请重新配置连接"
            : `${currentProvider?.label || "本机 authority"} 已离线`;

      content = (
        <div className="flex h-screen w-full bg-background text-foreground overflow-hidden">
          {isMobileMenuOpen && (
            <div
              className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 md:hidden"
              onClick={() => setIsMobileMenuOpen(false)}
            />
          )}
          <aside
            onClickCapture={() => setIsMobileMenuOpen(false)}
            className={`fixed inset-y-0 left-0 z-50 w-64 border-r flex flex-col transition-transform duration-300 md:relative md:translate-x-0 bg-background md:bg-transparent ${sidebarBg} ${
              isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
            }`}
          >
            <div className="h-14 flex items-center px-4 border-b border-inherit">
              <Building2 className={`mr-2 h-5 w-5 ${textIconColor}`} />
              <span className="font-semibold tracking-tight">赛博公司</span>
            </div>

            <nav className="flex-1 overflow-y-auto px-3 py-4">
              <div className="space-y-3">
                {navGroups.map((group) => (
                  <div key={group.label} className="space-y-1">
                    <div className={navGroupLabelClass}>{group.label}</div>
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.path}
                          to={item.path}
                          className={`${navClass(item.path)} ${
                            item.primary && !isRouteActive(item.path)
                              ? "border border-indigo-100 bg-indigo-50/60 text-indigo-800 hover:bg-indigo-100/80"
                              : ""
                          }`}
                        >
                          <Icon className="mr-3 h-4 w-4" />
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                ))}
              </div>
            </nav>

            {ceoEmployee && (
              <div className="px-3 py-4 border-t border-inherit">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-2">
                  默认沟通入口
                </div>
                <Link
                  to={`/chat/${ceoEmployee.agentId}`}
                  className={`block rounded-xl border px-3 py-3 transition-colors ${
                    isRouteActive(`/chat/${ceoEmployee.agentId}`)
                      ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <div className="text-sm font-semibold">直接联系 CEO</div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">
                    默认先由 CEO 吸收目标、判断组织和调度后台管理层。
                  </div>
                </Link>
                <div className="mt-3 px-2 text-[11px] leading-5 text-muted-foreground">
                  其他员工与管理层会话仍保留在员工页和完整聊天中，首页不再默认全部展开。
                </div>
              </div>
            )}

            <div className="p-4 border-t border-inherit space-y-2">
              <Link
                to="/select"
                className={`flex items-center text-sm font-medium ${isRouteActive("/select") ? "text-foreground bg-secondary/50" : `text-muted-foreground ${linkHover}`} py-2 px-1 rounded-md`}
              >
                <Building2 className="mr-3 h-4 w-4" />
                切换公司
              </Link>
            </div>
          </aside>

          <main className="flex-1 flex flex-col h-full overflow-hidden relative min-w-0">
            <header className="h-14 border-b border-inherit flex items-center justify-between px-4 md:px-6 shrink-0 z-20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
              <div className="flex items-center gap-2 md:gap-4">
                <button
                  type="button"
                  className="md:hidden h-8 w-8 -ml-2 inline-flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground"
                  onClick={() => setIsMobileMenuOpen(true)}
                >
                  <Menu className="w-5 h-5" />
                  <span className="sr-only">Toggle Sidebar</span>
                </button>
                <h1 className="text-base md:text-lg font-semibold truncate max-w-[150px] md:max-w-none">
                  {resolvedCompany.icon || "🏢"} {resolvedCompany.name || "加载中..."}
                </h1>
                <span className="text-sm hidden md:inline-block text-muted-foreground truncate">
                  {resolvedCompany.description || ""}
                </span>
              </div>
              <div className="flex items-center gap-4">
                <MainlineQuickSwitch hasPrimaryRequirement={hasPrimaryRequirement} />
                <div className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${connectionIndicatorClass}`} />
                  <span className="text-sm text-muted-foreground mr-2">{connectionLabel}</span>
                </div>
              </div>
            </header>

            <div className="flex-1 overflow-auto relative z-10">
              {shouldUseSilentRestoreShell ? (
                <div className="border-b bg-background/90 px-4 py-2 text-xs text-muted-foreground backdrop-blur supports-[backdrop-filter]:bg-background/70">
                  正在后台恢复最新状态，你可以继续停留在当前页面。
                </div>
              ) : null}
              <Suspense fallback={<RouteLoadingScreen />}>
                <Routes>
                  <Route path="/" element={<CEOHomePage />} />
                  <Route path="/ops" element={<CompanyLobby />} />
                  <Route path="/lobby" element={<Navigate to="/ops" replace />} />
                  <Route path="/chat/:agentId" element={<ChatPage />} />
                  <Route path="/employees" element={<EmployeeList />} />
                  <Route path="/employees/:id" element={<EmployeeProfile />} />
                  <Route path="/board" element={<BoardPage />} />
                  <Route path="/requirement" element={<RequirementCenterPage />} />
                  <Route path="/workspace" element={<WorkspacePage />} />
                  <Route path="/automation" element={<AutomationPage />} />
                  <Route path="/dashboard" element={<DashboardPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/oauth/codex/callback" element={<CodexOAuthCallbackPage />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
            </div>
          </main>
        </div>
      );
    }
  }

  return (
    <>
      <GatewayStatusBanner />
      <OrgAutopilotHost />
      {content}
      <ToastHost />
      <ApprovalModalHost />
      <CompanyAuthoritySyncHost />
      <GatewayNotificationHost />
      <RequirementAggregateHost />
    </>
  );
}
