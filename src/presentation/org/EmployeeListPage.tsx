import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  useOrgApp,
  useOrgDirectoryCommands,
  useOrgDirectoryQuery,
} from "../../application/org";
import {
  openDirectoryWorkspaceFile,
  saveDirectoryWorkspaceFile,
} from "../../application/org/page-commands";
import type { DirectoryEmployeeRow } from "../../application/org/directory-query";
import type { HireConfig } from "../../components/ui/immersive-hire-dialog";
import type { Department } from "../../domain/org/types";
import { toast } from "../../components/system/toast-store";
import {
  EmployeeDirectoryBody,
  EmployeeDirectoryDialogs,
  EmployeeDirectoryHeader,
  EmployeeDirectorySummaryCards,
  EmployeeFileEditorDialog,
  EmployeeOrgAdvisorCard,
} from "./components/EmployeeDirectorySections";

function EmployeeListContent() {
  const navigate = useNavigate();
  const { updateCompany } = useOrgApp();
  const {
    activeCompany,
    agentFiles,
    balancedEmployees,
    departments,
    employeeInsights,
    employeesData,
    fragileEmployees,
    insightByAgentId,
    manifest,
    orgAdvisor,
    orgIssueCount,
    overloadedEmployees,
    supportsAgentFiles,
  } = useOrgDirectoryQuery();
  const [hireDialogOpen, setHireDialogOpen] = useState(false);
  const [fireEmployeeDialogOpen, setFireEmployeeDialogOpen] = useState(false);
  const [fireEmployeeTarget, setFireEmployeeTarget] = useState<string | null>(null);

  const [updateProfileDialogOpen, setUpdateProfileDialogOpen] = useState(false);
  const [updateProfileTarget, setUpdateProfileTarget] = useState<string | null>(null);
  const [updateProfileInitial, setUpdateProfileInitial] = useState({ nickname: "", role: "" });
  const [updateRoleDialogOpen, setUpdateRoleDialogOpen] = useState(false);
  const [updateRoleTarget, setUpdateRoleTarget] = useState<string | null>(null);
  const [updateRoleInitial, setUpdateRoleInitial] = useState<{
    role: string;
    description: string;
  } | null>(null);

  const [editingFile, setEditingFile] = useState<{
    agentId: string;
    name: string;
    content: string;
    loaded: boolean;
    saving: boolean;
  } | null>(null);
  const [viewMode, setViewMode] = useState<"org" | "list">("org");
  const [departmentsDialogOpen, setDepartmentsDialogOpen] = useState(false);
  const [hrPlanDialogOpen, setHrPlanDialogOpen] = useState(false);
  const {
    applyHrPlan,
    applyRecommendation,
    canApplyHrPlan,
    departmentsSaving,
    fireEmployee,
    fixOrganization,
    fixingOrg,
    hireEmployee,
    hireSubmitting,
    hrPlanDialogState,
    hrPlanning,
    profileSubmitting,
    resetHrPlan,
    saveDepartments,
    startHrBootstrap,
    updateProfile,
    updateRole,
    updateRoleSubmitting,
    applyingHrPlan,
  } = useOrgDirectoryCommands({
    activeCompany,
    manifest,
    orgAdvisor: orgAdvisor ?? null,
    orgIssueCount,
    updateCompany,
  });

  const formatBytes = (bytes?: number) => {
    if (bytes === undefined) return "--";
    if (bytes === 0) {
      return "0 B";
    }
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const handleOpenFile = async (agentId: string, fileName: string) => {
    if (!supportsAgentFiles) {
      toast.info("当前后端不提供文件区", "请改从工作目录里的产品产物库查看或同步文件。");
      return;
    }
    setEditingFile({ agentId, name: fileName, content: "", loaded: false, saving: false });
    try {
      setEditingFile({
        agentId,
        name: fileName,
        content: await openDirectoryWorkspaceFile({ agentId, fileName, supportsAgentFiles }),
        loaded: true,
        saving: false,
      });
    } catch (e) {
      console.error(e);
      toast.error("读取失败", String(e));
      setEditingFile(null);
    }
  };

  const handleSaveFile = async () => {
    if (!editingFile) return;
    setEditingFile((prev) => (prev ? { ...prev, saving: true } : null));
    try {
      await saveDirectoryWorkspaceFile({
        agentId: editingFile.agentId,
        fileName: editingFile.name,
        content: editingFile.content,
      });
      toast.success("保存成功", "文件已更新并同步到网关。");
      setEditingFile(null);
    } catch (e) {
      console.error(e);
      toast.error("保存失败", String(e));
      setEditingFile((prev) => (prev ? { ...prev, saving: false } : null));
    }
  };

  const handleHireEmployee = async (config: HireConfig) => {
    const agentId = await hireEmployee(config);
    if (!agentId) {
      return;
    }
    setHireDialogOpen(false);
    navigate(`/chat/${agentId}`);
  };

  const handleUpdateRoleSubmit = async (values: Record<string, string>) => {
    const updated = await updateRole(
      updateRoleTarget,
      values.role ?? "",
      values.description ?? "",
    );
    if (updated) {
      setUpdateRoleDialogOpen(false);
    }
  };

  if (!activeCompany) {
    return <div className="p-8 text-center text-muted-foreground">未选择正在运营的公司组织</div>;
  }

  const handleHrBootstrapDepartments = async () => {
    setHrPlanDialogOpen(true);
    await startHrBootstrap();
  };

  const handleApplyHrPlan = async () => {
    try {
      const appliedPlan = await applyHrPlan();
      if (!appliedPlan) {
        return;
      }
      if (!appliedPlan.ok) {
        toast.error("无法解析 HR 方案", appliedPlan.error);
        return;
      }

      for (const warning of appliedPlan.warnings) {
        toast.info("组织校准", warning);
      }
      toast.success("HR 方案已应用", "部门与汇报线已落盘。 ");
      setHrPlanDialogOpen(false);
      resetHrPlan();
    } catch (error) {
      toast.error("应用失败", error instanceof Error ? error.message : String(error));
    }
  };

  const handleFixOrg = async () => {
    if (orgIssueCount === 0) {
      toast.info("无需修复", "未检测到孤儿节点或循环引用。");
      return;
    }

    try {
      const fixed = await fixOrganization();
      if (!fixed) {
        return;
      }
      for (const warning of fixed.normalized.warnings) {
        toast.info("组织校准", warning);
      }

      toast.success(
        "一键修复完成",
        `修复 ${fixed.normalized.stats.fixedManagers} 项 · 问题 ${fixed.normalized.stats.issuesBefore} -> ${fixed.issuesAfter}`,
      );
    } catch (err) {
      toast.error("修复失败", err instanceof Error ? err.message : String(err));
    }
  };

  const handleApplyOrgRecommendation = async (recommendationId: string) => {
    try {
      const normalized = await applyRecommendation(recommendationId);
      if (!normalized) {
        return;
      }
      for (const warning of normalized.warnings) {
        toast.info("组织校准", warning);
      }
      const recommendation = orgAdvisor?.recommendations.find((item) => item.id === recommendationId);
      toast.success("组织建议已应用", recommendation?.title ?? "组织建议");
    } catch (err) {
      toast.error("应用失败", err instanceof Error ? err.message : String(err));
    }
  };

  const handleUpdateProfile = async (values: Record<string, string>) => {
    if (!updateProfileTarget) return;
    const nickname = (values.nickname ?? "").trim();
    const role = (values.role ?? "").trim();
    const shouldSyncIdentityName = values.syncIdentityName === "true";

    if (!nickname) {
      toast.error("更新失败", "花名不能为空。 ");
      return;
    }

    try {
      const result = await updateProfile({
        agentId: updateProfileTarget,
        nickname,
        role,
        syncIdentityName: shouldSyncIdentityName,
      });
      if (!result) {
        return;
      }

      if (result.identitySyncError) {
        toast.warning("Identity Name 同步失败", result.identitySyncError);
      }

      toast.success("资料已保存", "员工的花名和描述已更新。");
      setUpdateProfileDialogOpen(false);
    } catch (e: unknown) {
      toast.error("更新失败", String(e));
    }
  };

  const updateProfileEmployee = updateProfileTarget
    ? (employeesData.find((emp) => emp.agentId === updateProfileTarget) ?? null)
    : null;

  const handleSaveDepartments = async (nextDepartments: Department[]) => {
    try {
      const normalized = await saveDepartments(nextDepartments);
      if (!normalized) {
        return;
      }
      for (const warning of normalized.warnings) {
        toast.info("部门校准", warning);
      }
      toast.success("部门配置已更新", "已写入公司注册表 (company-config.json)。");
      setDepartmentsDialogOpen(false);
    } catch (err) {
      toast.error("保存失败", err instanceof Error ? err.message : String(err));
    }
  };

  const handleFireEmployee = (agentId: string) => {
    setFireEmployeeTarget(agentId);
    setFireEmployeeDialogOpen(true);
  };

  const handleEditProfileEmployee = (employee: DirectoryEmployeeRow) => {
    setUpdateProfileTarget(employee.agentId);
    setUpdateProfileInitial({
      nickname: employee.nickname,
      role: employee.role || "",
    });
    setUpdateProfileDialogOpen(true);
  };

  const handleUpdateRoleEmployee = (employee: DirectoryEmployeeRow) => {
    setUpdateRoleTarget(employee.agentId);
    setUpdateRoleInitial({ role: employee.role || "", description: "" });
    setUpdateRoleDialogOpen(true);
  };

  const onFireEmployeeSubmit = async () => {
    if (!fireEmployeeTarget) return;
    try {
      await fireEmployee(fireEmployeeTarget);
      setTimeout(() => window.location.reload(), 1500);
    } catch (e: unknown) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-4 md:p-6 lg:p-8">
      <EmployeeDirectoryHeader
        viewMode={viewMode}
        setViewMode={setViewMode}
        hrPlanning={hrPlanning}
        fixingOrg={fixingOrg}
        orgIssueCount={orgIssueCount}
        onStartHrBootstrap={() => void handleHrBootstrapDepartments()}
        onFixOrganization={() => void handleFixOrg()}
        onOpenDepartments={() => setDepartmentsDialogOpen(true)}
        onOpenHire={() => setHireDialogOpen(true)}
      />

      <EmployeeDirectorySummaryCards
        overloadedEmployees={overloadedEmployees}
        fragileEmployees={fragileEmployees}
        balancedEmployees={balancedEmployees}
        employeeInsights={employeeInsights}
      />

      <EmployeeOrgAdvisorCard
        viewMode={viewMode}
        orgAdvisor={orgAdvisor ?? null}
        onApplyRecommendation={(recommendationId) =>
          void handleApplyOrgRecommendation(recommendationId)
        }
      />

      <EmployeeDirectoryBody
        viewMode={viewMode}
        employeesData={employeesData}
        departments={departments}
        insightByAgentId={insightByAgentId}
        agentFiles={agentFiles}
        onEditProfile={handleEditProfileEmployee}
        onUpdateRole={handleUpdateRoleEmployee}
        onFireEmployee={handleFireEmployee}
        onOpenFile={(agentId, fileName) => void handleOpenFile(agentId, fileName)}
        formatBytes={formatBytes}
      />

      {employeesData.length === 0 && (
        <div className="text-center py-20 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
          <h3 className="text-lg font-medium text-slate-600">当前没有可调遣的员工</h3>
          <p className="text-sm text-slate-400 mt-2">点击右上方招募新员工以丰富公司架构体。</p>
        </div>
      )}

      <EmployeeFileEditorDialog
        editingFile={editingFile}
        setEditingFile={setEditingFile}
        onSave={() => void handleSaveFile()}
      />

      <EmployeeDirectoryDialogs
        hireDialogOpen={hireDialogOpen}
        setHireDialogOpen={setHireDialogOpen}
        onHireEmployee={handleHireEmployee}
        hireSubmitting={hireSubmitting}
        updateProfileDialogOpen={updateProfileDialogOpen}
        setUpdateProfileDialogOpen={setUpdateProfileDialogOpen}
        updateProfileEmployee={updateProfileEmployee}
        updateProfileInitial={updateProfileInitial}
        profileSubmitting={profileSubmitting}
        onUpdateProfile={handleUpdateProfile}
        updateRoleDialogOpen={updateRoleDialogOpen}
        setUpdateRoleDialogOpen={setUpdateRoleDialogOpen}
        updateRoleInitial={updateRoleInitial}
        updateRoleSubmitting={updateRoleSubmitting}
        onUpdateRoleSubmit={handleUpdateRoleSubmit}
        fireEmployeeDialogOpen={fireEmployeeDialogOpen}
        setFireEmployeeDialogOpen={setFireEmployeeDialogOpen}
        onFireEmployeeSubmit={onFireEmployeeSubmit}
        departmentsDialogOpen={departmentsDialogOpen}
        setDepartmentsDialogOpen={setDepartmentsDialogOpen}
        departments={departments}
        employees={employeesData}
        departmentsSaving={departmentsSaving}
        onSaveDepartments={handleSaveDepartments}
        hrPlanDialogOpen={hrPlanDialogOpen}
        setHrPlanDialogOpen={setHrPlanDialogOpen}
        hrPlanDialogState={hrPlanDialogState}
        canApplyHrPlan={canApplyHrPlan}
        applyingHrPlan={applyingHrPlan}
        onApplyHrPlan={handleApplyHrPlan}
      />
    </div>
  );
}

export function EmployeeListPage() {
  return <EmployeeListContent />;
}
