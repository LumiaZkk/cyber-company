import { useState } from "react";
import {
  useGatewaySettingsCommands,
  useGatewaySettingsQuery,
} from "../../application/gateway/settings";
import { toast } from "../../components/system/toast-store";
import {
  SettingsAdvancedSection,
  SettingsDoctorSection,
  SettingsDialogs,
  SettingsGatewayCompanySection,
  SettingsHeader,
  SettingsProvidersChannelsSection,
} from "./components/SettingsSections";

export function SettingsPresentationPage() {
  const query = useGatewaySettingsQuery();
  const {
    token,
    connected,
    companyConfig,
    activeCompany,
    status,
    channels,
    skills,
    configSnapshot,
    loading,
    error,
    companyCount,
    codexModels,
    orgAutopilotEnabled,
    providerConfigs,
    telegramConfig,
    doctorBaseline,
    executorStatus,
    executorConfig,
    refreshRuntime,
  } = query;
  const {
    switchCompany,
    loadConfig,
    reconnectGateway,
    disconnectGateway,
    handleImportCodexAuth,
    handleRefreshCodexModels,
    handleStartCodexOAuth,
    handleTelegramSubmit,
    onProviderKeySubmit,
    handleAddProviderSubmit,
    handleSyncModels,
    handleExecutorConfigSubmit,
    handleExecutorReconnect,
    handleToggleOrgAutopilot,
    handleUpdateCollaborationPolicy,
    telegramSaving,
    providerKeySaving,
    addProviderSaving,
    syncingProvider,
    codexAuthorizing,
    codexImporting,
    codexRefreshing,
    executorSaving,
    orgAutopilotSaving,
    collaborationPolicySaving,
  } = useGatewaySettingsCommands(query);

  const [telegramDialogOpen, setTelegramDialogOpen] = useState(false);
  const [executorDialogOpen, setExecutorDialogOpen] = useState(false);

  const [advancedOpen, setAdvancedOpen] = useState(false);

  const [providerKeyDialogOpen, setProviderKeyDialogOpen] = useState(false);
  const [providerKeyTarget, setProviderKeyTarget] = useState<string | null>(null);

  const [addProviderDialogOpen, setAddProviderDialogOpen] = useState(false);

  const runCommand = async (
    command: () => Promise<{ title: string; description: string } | null>,
    fallbackError: string,
  ) => {
    try {
      const result = await command();
      if (result) {
        toast.success(result.title, result.description);
      }
      return result;
    } catch (commandError) {
      toast.error(
        fallbackError,
        commandError instanceof Error ? commandError.message : String(commandError),
      );
      return null;
    }
  };

  const updateProviderKey = (provider: string) => {
    setProviderKeyTarget(provider);
    setProviderKeyDialogOpen(true);
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-4 md:p-6 lg:p-8 pb-20">
      <SettingsHeader
        connected={connected}
        loading={loading}
        refreshRuntime={refreshRuntime}
        runCommand={runCommand}
      />

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <SettingsDoctorSection doctorBaseline={doctorBaseline} />

      <SettingsGatewayCompanySection
        token={token}
        connected={connected}
        companyConfig={companyConfig}
        activeCompany={activeCompany}
        loading={loading}
        companyCount={companyCount}
        orgAutopilotEnabled={orgAutopilotEnabled}
        orgAutopilotSaving={orgAutopilotSaving}
        collaborationPolicySaving={collaborationPolicySaving}
        switchCompany={switchCompany}
        loadConfig={loadConfig}
        reconnectGateway={reconnectGateway}
        disconnectGateway={disconnectGateway}
        handleToggleOrgAutopilot={handleToggleOrgAutopilot}
        handleUpdateCollaborationPolicy={handleUpdateCollaborationPolicy}
        runCommand={runCommand}
      />

      <SettingsProvidersChannelsSection
        executorStatus={executorStatus}
        executorConfig={executorConfig}
        configSnapshot={configSnapshot}
        codexModels={codexModels}
        providerConfigs={providerConfigs}
        telegramConfig={telegramConfig}
        loading={loading}
        executorSaving={executorSaving}
        codexAuthorizing={codexAuthorizing}
        codexImporting={codexImporting}
        codexRefreshing={codexRefreshing}
        addProviderSaving={addProviderSaving}
        syncingProvider={syncingProvider}
        setExecutorDialogOpen={setExecutorDialogOpen}
        setAddProviderDialogOpen={setAddProviderDialogOpen}
        setTelegramDialogOpen={setTelegramDialogOpen}
        updateProviderKey={updateProviderKey}
        handleExecutorReconnect={handleExecutorReconnect}
        handleStartCodexOAuth={handleStartCodexOAuth}
        handleImportCodexAuth={handleImportCodexAuth}
        handleRefreshCodexModels={handleRefreshCodexModels}
        handleSyncModels={handleSyncModels}
        runCommand={runCommand}
      />

      <SettingsAdvancedSection
        advancedOpen={advancedOpen}
        setAdvancedOpen={setAdvancedOpen}
        status={status}
        channels={channels}
        skills={skills}
      />

      <SettingsDialogs
        executorDialogOpen={executorDialogOpen}
        setExecutorDialogOpen={setExecutorDialogOpen}
        executorConfig={executorConfig}
        telegramDialogOpen={telegramDialogOpen}
        setTelegramDialogOpen={setTelegramDialogOpen}
        providerKeyDialogOpen={providerKeyDialogOpen}
        setProviderKeyDialogOpen={setProviderKeyDialogOpen}
        providerKeyTarget={providerKeyTarget}
        setProviderKeyTarget={setProviderKeyTarget}
        addProviderDialogOpen={addProviderDialogOpen}
        setAddProviderDialogOpen={setAddProviderDialogOpen}
        executorSaving={executorSaving}
        telegramSaving={telegramSaving}
        providerKeySaving={providerKeySaving}
        addProviderSaving={addProviderSaving}
        handleExecutorConfigSubmit={handleExecutorConfigSubmit}
        handleTelegramSubmit={handleTelegramSubmit}
        onProviderKeySubmit={onProviderKeySubmit}
        handleAddProviderSubmit={handleAddProviderSubmit}
        runCommand={runCommand}
      />
    </div>
  );
}
