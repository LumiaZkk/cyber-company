import {
  Building2,
  Users,
  LayoutDashboard,
  BarChart,
  BookOpen,
  Settings,
  Palette,
  CalendarClock,
  Menu,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Routes, Route, Link, useLocation, Navigate } from "react-router-dom";
import { ApprovalModalHost } from "./components/system/approval-modal-host";
import { GatewayNotificationHost } from "./components/system/gateway-notification-host";
import { GatewayStatusBanner } from "./components/system/gateway-status-banner";
import { ToastHost } from "./components/ui/toast-host";
import { peekCachedCompanyConfig } from "./features/company/persistence";
import { useCompanyStore } from "./features/company/store";
import type { Company } from "./features/company/types";
import { getCompanyWorkspaceApps } from "./features/company/workspace-apps";
import { useGatewayStore } from "./features/gateway/store";
import { OrgAutopilot } from "./features/org/org-autopilot";
import { toast } from "./features/ui/toast-store";
import { AutomationPage } from "./pages/AutomationPage";
import { BoardPage } from "./pages/BoardPage";
import { ChatPage } from "./pages/ChatPage";
import { CompanyCreate } from "./pages/CompanyCreate";
import { CompanyLobby } from "./pages/CompanyLobby";
import { CompanySelect } from "./pages/CompanySelect";
import { ConnectPage } from "./pages/ConnectPage";
import { CodexOAuthCallbackPage } from "./pages/CodexOAuthCallbackPage";
import { CEOHomePage } from "./pages/CEOHomePage";
import { DashboardPage } from "./pages/DashboardPage";
import { EmployeeList } from "./pages/EmployeeList";
import { EmployeeProfile } from "./pages/EmployeeProfile";
import { SettingsPage } from "./pages/SettingsPage";
import { WorkspacePage } from "./pages/WorkspacePage";

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

function ThemeSwitcher() {
  const location = useLocation();
  const options = [
    { name: "CEO 首页", path: "/" },
    { name: "运营大厅", path: "/ops" },
  ];

  return (
    <div className="flex items-center gap-1 bg-secondary/50 rounded-full p-1 border shadow-xs mr-2">
      <div className="px-2 flex items-center text-xs font-semibold text-muted-foreground">
        <Palette className="w-3.5 h-3.5 mr-1" />
        切换风格
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
  const {
    connected,
    phase,
    hasEverConnected,
    autoConnectInitialized,
    bootstrapAutoConnect,
  } = useGatewayStore();
  const { loading, loadConfig, activeCompany, bootstrapPhase } = useCompanyStore();
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
  const lastStableCompanyRef = useRef<Company | null>(activeCompany ?? cachedBootstrapCompany);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    bootstrapAutoConnect();
  }, [bootstrapAutoConnect]);

  useEffect(() => {
    if (connected) {
      void loadConfig();
    }
  }, [connected, loadConfig]);

  useEffect(() => {
    if (activeCompany) {
      lastStableCompanyRef.current = activeCompany;
    }
  }, [activeCompany]);

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
      toast.warning("Gateway 连接已断开", "系统正在自动重连。你可以继续停留在当前页面。");
    } else if (!previousConnected && connected) {
      toast.success("Gateway 已恢复连接", "实时操作能力已恢复。");
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
          <Routes>
            <Route path="/select" element={<CompanySelect />} />
            <Route path="/connect" element={<ConnectPage />} />
            <Route path="/create" element={<CompanyCreate />} />
            <Route path="/oauth/codex/callback" element={<CodexOAuthCallbackPage />} />
          </Routes>
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
    const currentCompany = activeCompany ?? lastStableCompanyRef.current;
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
        return `flex items-center px-3 py-2 text-sm font-medium rounded-md ${
          isRouteActive(path)
            ? "bg-secondary text-secondary-foreground"
            : `text-muted-foreground ${linkHover}`
        }`;
      };
      const workspaceApps = getCompanyWorkspaceApps(resolvedCompany);
      const ceoEmployee =
        resolvedCompany.employees.find((employee) => employee.metaRole === "ceo") ?? null;

      const connectionIndicatorClass = connected
        ? "bg-green-500"
        : phase === "reconnecting" || phase === "connecting"
          ? "bg-amber-500 animate-pulse"
          : phase === "failed"
            ? "bg-rose-500"
            : "bg-red-500";
      const connectionLabel = connected
        ? "已连接到 Gateway"
        : phase === "reconnecting" || phase === "connecting"
          ? "连接中断，正在重连"
          : phase === "failed"
            ? "重连失败，请重新配置连接"
            : "Gateway 已离线";

      content = (
        <div className="flex h-screen w-full bg-background text-foreground overflow-hidden">
          {isMobileMenuOpen && (
            <div
              className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 md:hidden"
              onClick={() => setIsMobileMenuOpen(false)}
            />
          )}
          <aside
            className={`fixed inset-y-0 left-0 z-50 w-64 border-r flex flex-col transition-transform duration-300 md:relative md:translate-x-0 bg-background md:bg-transparent ${sidebarBg} ${
              isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
            }`}
          >
            <div className="h-14 flex items-center px-4 border-b border-inherit">
              <Building2 className={`mr-2 h-5 w-5 ${textIconColor}`} />
              <span className="font-semibold tracking-tight">赛博公司</span>
            </div>

            <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-2">
              <Link to="/" className={navClass("/")}>
                <Building2 className="mr-3 h-4 w-4" />
                CEO 首页
              </Link>
              <Link to="/ops" className={navClass("/ops")}>
                <Building2 className="mr-3 h-4 w-4" />
                运营大厅
              </Link>
              <Link to="/employees" className={navClass("/employees")}>
                <Users className="mr-3 h-4 w-4" />
                员工管理
              </Link>
              <Link to="/board" className={navClass("/board")}>
                <LayoutDashboard className="mr-3 h-4 w-4" />
                工作看板
              </Link>
              {workspaceApps.length > 0 && (
                <Link to="/workspace" className={navClass("/workspace")}>
                  <BookOpen className="mr-3 h-4 w-4" />
                  工作目录
                </Link>
              )}
              <Link to="/automation" className={navClass("/automation")}>
                <CalendarClock className="mr-3 h-4 w-4" />
                自动化
              </Link>
              <Link to="/dashboard" className={navClass("/dashboard")}>
                <BarChart className="mr-3 h-4 w-4" />
                运营报表
              </Link>
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
              <Link
                to="/settings"
                className={`flex items-center text-sm font-medium ${isRouteActive("/settings") ? "text-foreground bg-secondary/50" : `text-muted-foreground ${linkHover}`} py-2 px-1 rounded-md`}
              >
                <Settings className="mr-3 h-4 w-4" />
                系统设置
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
                <ThemeSwitcher />
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
              <Routes>
                <Route path="/" element={<CEOHomePage />} />
                <Route path="/ops" element={<CompanyLobby />} />
                <Route path="/lobby" element={<Navigate to="/ops" replace />} />
                <Route path="/chat/:agentId" element={<ChatPage />} />
                <Route path="/employees" element={<EmployeeList />} />
                <Route path="/employees/:id" element={<EmployeeProfile />} />
                <Route path="/board" element={<BoardPage />} />
                <Route path="/workspace" element={<WorkspacePage />} />
                <Route path="/automation" element={<AutomationPage />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/oauth/codex/callback" element={<CodexOAuthCallbackPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </div>
          </main>
        </div>
      );
    }
  }

  return (
    <>
      <GatewayStatusBanner />
      <OrgAutopilot />
      {content}
      <ToastHost />
      <ApprovalModalHost />
      <GatewayNotificationHost />
    </>
  );
}
