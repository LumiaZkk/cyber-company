import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Plus, Sparkles, ChevronRight, CheckCircle2 } from "lucide-react";
import { parseCompanyBlueprint } from "../features/company/blueprint";
import { useCompanyStore } from "../features/company/store";
import { COMPANY_TEMPLATES } from "../features/company/templates";
import { gateway } from "../features/backend";
import { generateCeoSoul, generateHrSoul, generateCtoSoul, generateCooSoul } from "../features/employee/meta-agents";
import type { CyberCompanyConfig, Company, Department, EmployeeRef } from "../features/company/types";
import { getConfigOwnerAgentId, saveCompanyConfig, setConfigOwnerAgentId } from "../features/company/persistence";
import { toast } from "../features/ui/toast-store";

const BLUEPRINT_TEMPLATE_ID = "__blueprint__";
const META_DEPARTMENT_NAMES = new Set(["管理中枢", "人力资源部", "技术部", "运营部"]);

export function CompanyCreate() {
  const navigate = useNavigate();
  const { loadConfig, config } = useCompanyStore();
  const creationTotalSteps = 8;
  
  const [step, setStep] = useState(1);
  const [selectedTemplate, setSelectedTemplate] = useState(COMPANY_TEMPLATES[0].id);
  const [companyName, setCompanyName] = useState("");
  const [blueprintText, setBlueprintText] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [creationError, setCreationError] = useState<string | null>(null);
  const [creationProgress, setCreationProgress] = useState<{
    current: number;
    message: string;
    history: string[];
  }>({
    current: 0,
    message: "等待开始...",
    history: [],
  });

  const updateProgress = (current: number, message: string) => {
    setCreationProgress((state) => ({
      current,
      message,
      history: [...state.history, message],
    }));
  };

  const importedBlueprint = parseCompanyBlueprint(blueprintText);
  const isBlueprintTemplate = selectedTemplate === BLUEPRINT_TEMPLATE_ID;

  const resolveConfigOwnerAgentId = (currentConfig: CyberCompanyConfig | null, fallbackAgentId: string) => {
    const ownerFromStorage = getConfigOwnerAgentId();
    if (ownerFromStorage) {
      return ownerFromStorage;
    }

    if (currentConfig) {
      const activeCompany = currentConfig.companies.find((company) => company.id === currentConfig.activeCompanyId);
      const activeCompanyCeo = activeCompany?.employees.find((employee) => employee.metaRole === 'ceo')?.agentId;
      if (activeCompanyCeo) {
        return activeCompanyCeo;
      }
    }

    return fallbackAgentId;
  };

  const handleCreate = async () => {
    const blueprint = isBlueprintTemplate ? importedBlueprint : null;
    const finalCompanyName = (companyName || blueprint?.sourceCompanyName || "").trim();
    if (!finalCompanyName) {return;}
    if (isBlueprintTemplate && !blueprint) {
      setCreationError("蓝图解析失败，请粘贴有效的 cyber-company.blueprint.v1 JSON。");
      return;
    }
    setIsCreating(true);
    setCreationError(null);
    setCreationProgress({ current: 0, message: "等待开始...", history: [] });
    updateProgress(1, `正在创建公司「${finalCompanyName}」...`);
    
    try {
      const templateId = blueprint?.template || selectedTemplate;
      const template = COMPANY_TEMPLATES.find((t) => t.id === templateId);
      const safeNameId = finalCompanyName.toLowerCase().replace(/[^a-z0-9]/g, '-');
      const baseAgentName = `${safeNameId}-co`;
      const blueprintAgentIdMap = new Map<string, string>();
      const blueprintBindings: Array<{
        blueprintId: string;
        agentId: string;
        reportsToBlueprintId?: string;
        departmentName?: string;
      }> = [];

      updateProgress(2, `正在创建 CEO 角色：${baseAgentName}-ceo`);
      const ceoMeta = await gateway.createAgent(`${baseAgentName}-ceo`);
      await new Promise((resolve) => setTimeout(resolve, 600));
      
      updateProgress(3, "正在为 CEO 注入 SOUL 记忆...");
      await gateway.setAgentFile(ceoMeta.agentId, "SOUL.md", generateCeoSoul(finalCompanyName));

      updateProgress(4, "正在创建管理层角色（HR / CTO / COO）...");
      const hrMeta = await gateway.createAgent(`${baseAgentName}-hr`);
      await new Promise((resolve) => setTimeout(resolve, 600));
      await gateway.setAgentFile(hrMeta.agentId, "SOUL.md", generateHrSoul(finalCompanyName));
      
      const ctoMeta = await gateway.createAgent(`${baseAgentName}-cto`);
      await new Promise((resolve) => setTimeout(resolve, 600));
      await gateway.setAgentFile(ctoMeta.agentId, "SOUL.md", generateCtoSoul(finalCompanyName));

      const cooMeta = await gateway.createAgent(`${baseAgentName}-coo`);
      await new Promise((resolve) => setTimeout(resolve, 600));
      await gateway.setAgentFile(cooMeta.agentId, "SOUL.md", generateCooSoul(finalCompanyName));

      if (blueprint) {
        blueprintAgentIdMap.set("meta:ceo", ceoMeta.agentId);
        blueprintAgentIdMap.set("meta:hr", hrMeta.agentId);
        blueprintAgentIdMap.set("meta:cto", ctoMeta.agentId);
        blueprintAgentIdMap.set("meta:coo", cooMeta.agentId);
      }

      updateProgress(5, "正在根据模板招聘业务员工...");
      const metaDepartments: Department[] = [
        {
          id: crypto.randomUUID(),
          name: "管理中枢",
          leadAgentId: ceoMeta.agentId,
          color: "slate",
          order: 0,
        },
        {
          id: crypto.randomUUID(),
          name: "人力资源部",
          leadAgentId: hrMeta.agentId,
          color: "rose",
          order: 1,
        },
        {
          id: crypto.randomUUID(),
          name: "技术部",
          leadAgentId: ctoMeta.agentId,
          color: "indigo",
          order: 2,
        },
        {
          id: crypto.randomUUID(),
          name: "运营部",
          leadAgentId: cooMeta.agentId,
          color: "emerald",
          order: 3,
        },
      ];

      const deptByLead = new Map(metaDepartments.map((dept) => [dept.leadAgentId, dept.id] as const));

      const employeeRefs: EmployeeRef[] = [
        {
          agentId: ceoMeta.agentId,
          nickname: 'CEO',
          role: 'Chief Executive Officer',
          isMeta: true,
          metaRole: 'ceo',
          departmentId: deptByLead.get(ceoMeta.agentId),
        },
        {
          agentId: hrMeta.agentId,
          nickname: 'HR',
          role: 'Human Resources Director',
          isMeta: true,
          metaRole: 'hr',
          reportsTo: ceoMeta.agentId,
          departmentId: deptByLead.get(hrMeta.agentId),
        },
        {
          agentId: ctoMeta.agentId,
          nickname: 'CTO',
          role: 'Chief Technology Officer',
          isMeta: true,
          metaRole: 'cto',
          reportsTo: ceoMeta.agentId,
          departmentId: deptByLead.get(ctoMeta.agentId),
        },
        {
          agentId: cooMeta.agentId,
          nickname: 'COO',
          role: 'Chief Operating Officer',
          isMeta: true,
          metaRole: 'coo',
          reportsTo: ceoMeta.agentId,
          departmentId: deptByLead.get(cooMeta.agentId),
        },
      ];
      
      const reportsToMap: Record<string, string> = { 
        ceo: ceoMeta.agentId, 
        hr: hrMeta.agentId, 
        cto: ctoMeta.agentId, 
        coo: cooMeta.agentId 
      };

      if (blueprint) {
        const importedEmployees = blueprint.employees.filter((employee) => !employee.isMeta);
        for (let idx = 0; idx < importedEmployees.length; idx++) {
          const emp = importedEmployees[idx];
          const empSafeId = `${baseAgentName}-bp-${idx}`;
          updateProgress(5, `正在复制蓝图员工：${emp.nickname}（${emp.role}）`);

          const agentRef = await gateway.createAgent(empSafeId);
          await new Promise((resolve) => setTimeout(resolve, 600));
          await gateway.setAgentFile(
            agentRef.agentId,
            "SOUL.md",
            `# 你的身份\n你在 "${finalCompanyName}" 担任 ${emp.role}。大家叫你 ${emp.nickname}。\n\n## 职责\n你需要严格按照该公司的共享知识、交接约束和角色边界执行任务，并及时回填结构化交付物。`,
          );

          blueprintAgentIdMap.set(emp.blueprintId, agentRef.agentId);
          blueprintBindings.push({
            blueprintId: emp.blueprintId,
            agentId: agentRef.agentId,
            reportsToBlueprintId: emp.reportsToBlueprintId,
            departmentName: emp.departmentName,
          });

          employeeRefs.push({
            agentId: agentRef.agentId,
            nickname: emp.nickname,
            role: emp.role,
            isMeta: false,
          });
        }
      } else if (template && template.employees.length > 0) {
        for (let idx = 0; idx < template.employees.length; idx++) {
          const emp = template.employees[idx];
          const empSafeId = `${baseAgentName}-emp-${idx}`;
          updateProgress(5, `正在配置员工：${emp.nickname}（${emp.role}）`);
          
          const agentRef = await gateway.createAgent(empSafeId);
          await new Promise((resolve) => setTimeout(resolve, 600));
          await gateway.setAgentFile(
            agentRef.agentId, 
            "SOUL.md", 
            `# 你的身份\n你在 "${finalCompanyName}" 担任 ${emp.role}。大家叫你 ${emp.nickname}。\n\n## 职责\n${emp.soul}\n\n你的顶头上司是公司的 CEO。`
          );
          
          employeeRefs.push({
            agentId: agentRef.agentId,
            nickname: emp.nickname,
            role: emp.role,
            isMeta: false,
            reportsTo: emp.reportsToRole ? reportsToMap[emp.reportsToRole] : ceoMeta.agentId,
            departmentId: deptByLead.get(
              emp.reportsToRole ? reportsToMap[emp.reportsToRole] : ceoMeta.agentId,
            ),
          });
        }
      }

      let finalDepartments = metaDepartments;
      if (blueprint) {
        const existingDepartmentNames = new Set(metaDepartments.map((department) => department.name));
        const importedDepartments = blueprint.departments
          .filter((department) => !META_DEPARTMENT_NAMES.has(department.name))
          .filter((department) => !existingDepartmentNames.has(department.name))
          .map((department, index) => ({
            id: crypto.randomUUID(),
            name: department.name,
            leadAgentId:
              (department.leadBlueprintId
                ? blueprintAgentIdMap.get(department.leadBlueprintId)
                : undefined) ?? cooMeta.agentId,
            color: department.color,
            order: department.order ?? metaDepartments.length + index,
          }));

        finalDepartments = [...metaDepartments, ...importedDepartments];
        const deptIdByName = new Map(finalDepartments.map((department) => [department.name, department.id]));

        for (let idx = 0; idx < employeeRefs.length; idx++) {
          const binding = blueprintBindings.find((item) => item.agentId === employeeRefs[idx].agentId);
          if (!binding) {
            continue;
          }
          employeeRefs[idx] = {
            ...employeeRefs[idx],
            reportsTo:
              (binding.reportsToBlueprintId
                ? blueprintAgentIdMap.get(binding.reportsToBlueprintId)
                : undefined) ?? ceoMeta.agentId,
            departmentId: binding.departmentName
              ? deptIdByName.get(binding.departmentName) ?? employeeRefs[idx].departmentId
              : employeeRefs[idx].departmentId,
          };
        }
      }

      updateProgress(6, "正在同步默认技能基线...");
      const skillSync = await gateway.alignAgentSkillsToDefaults(
        employeeRefs.map((employee) => employee.agentId),
      );

      const skillMessage = skillSync.updated > 0
        ? `已完成 ${skillSync.updated} 名员工的技能同步。`
        : "技能基线已是最新，无需额外同步。";
      updateProgress(6, skillMessage);

      updateProgress(7, "正在写入公司配置与组织注册表...");
      const quickPrompts = blueprint
        ? blueprint.quickPrompts
            .map((prompt) => ({
              label: prompt.label,
              icon: prompt.icon,
              prompt: prompt.prompt,
              targetAgentId:
                (prompt.targetBlueprintId
                  ? blueprintAgentIdMap.get(prompt.targetBlueprintId)
                  : undefined) ?? ceoMeta.agentId,
            }))
            .filter((prompt) => prompt.label.trim().length > 0 && prompt.prompt.trim().length > 0)
        : [];
      const newCompany: Company = {
        id: crypto.randomUUID(),
        name: finalCompanyName,
        description: blueprint?.description || template?.description || "",
        icon: blueprint?.icon || template?.icon || "🏢",
        template: templateId,
        orgSettings: {
          autoCalibrate: true,
        },
        departments: finalDepartments,
        employees: employeeRefs,
        quickPrompts,
        knowledgeItems: blueprint?.knowledgeItems ?? [],
        createdAt: Date.now()
      };

      const newConfig: CyberCompanyConfig = config ? {
        ...config,
        companies: [...config.companies, newCompany],
        activeCompanyId: newCompany.id
      } : {
        version: 1,
        companies: [newCompany],
        activeCompanyId: newCompany.id,
        preferences: { theme: 'classic', locale: 'zh-CN' }
      };

      const ownerAgentId = resolveConfigOwnerAgentId(config, ceoMeta.agentId);
      setConfigOwnerAgentId(ownerAgentId);

      const saved = await saveCompanyConfig(newConfig);
      if (!saved) {
        throw new Error("Failed to persist company configuration");
      }

      if (blueprint && blueprint.automations.length > 0) {
        updateProgress(8, "正在复制蓝图中的自动化班次...");
        const results = await Promise.allSettled(
          blueprint.automations.map((automation) => {
            const agentId =
              (automation.targetBlueprintId
                ? blueprintAgentIdMap.get(automation.targetBlueprintId)
                : undefined) ?? ceoMeta.agentId;
            if (!agentId) {
              return Promise.resolve();
            }

            return gateway.addCron({
              name: automation.name,
              agentId,
              enabled: true,
              sessionTarget: "main",
              wakeMode: "now",
              schedule: automation.expr
                ? { kind: "cron", expr: automation.expr }
                : { kind: "every", everyMs: automation.everyMs ?? 3600000 },
              payload: {
                kind: "agentTurn",
                message: automation.task,
              },
            });
          }),
        );

        const successCount = results.filter((result) => result.status === "fulfilled").length;
        if (successCount > 0) {
          updateProgress(8, `已复制 ${successCount} 条自动化班次。`);
        }
      }

      updateProgress(8, "正在刷新本地配置并准备进入总部大厅...");
      await loadConfig();
      setIsCreating(false);
      toast.success("公司创建完成", `「${finalCompanyName}」已上线。`);
        
      setTimeout(() => {
        navigate("/");
      }, 1500);

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setCreationError(message);
      toast.error("公司创建失败", message);
      setIsCreating(false);
    }
  };

  const progressPercent = Math.round((creationProgress.current / creationTotalSteps) * 100);

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8 flex flex-col items-center">
      <div className="max-w-3xl w-full">
        <div className="mb-5 space-y-1">
           <h1 className="text-xl font-semibold text-slate-900">创建新公司</h1>
           <p className="text-sm text-slate-500">先选模板，再起名称，最后创建团队。</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="border-b border-slate-100 bg-slate-50 px-5 py-3 text-sm text-slate-500">
            当前步骤：{step === 1 ? "选模板" : step === 2 ? "起名称" : "创建团队"}
          </div>

          <div className="p-8">
            {step === 1 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  选择一个起步模板 <Sparkles className="text-amber-500" size={20}/>
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {COMPANY_TEMPLATES.map(t => (
                    <button
                      key={t.id}
                      onClick={() => setSelectedTemplate(t.id)}
                      className={`text-left p-5 rounded-xl border-2 transition-all ${selectedTemplate === t.id ? 'border-indigo-600 bg-indigo-50/30 ring-4 ring-indigo-50 shadow-sm' : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'}`}
                    >
                      <div className="text-3xl mb-3">{t.icon}</div>
                      <h3 className="font-bold text-slate-900 mb-1">{t.name}</h3>
                      <p className="text-sm text-slate-500 leading-relaxed mb-4">{t.description}</p>
                      
                      <div className="flex flex-wrap gap-2">
                         {t.employees.slice(0, 3).map((e, i) => (
                           <span key={i} className={`text-xs px-2 py-1 rounded-md font-medium ${selectedTemplate === t.id ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>{e.nickname} · {e.role}</span>
                         ))}
                         {t.employees.length === 0 && <span className="text-xs bg-slate-100 text-slate-400 px-2 py-1 rounded-md">仅初始化管理层</span>}
                      </div>
                    </button>
                  ))}
                  <button
                    onClick={() => setSelectedTemplate(BLUEPRINT_TEMPLATE_ID)}
                    className={`text-left p-5 rounded-xl border-2 transition-all ${isBlueprintTemplate ? 'border-indigo-600 bg-indigo-50/30 ring-4 ring-indigo-50 shadow-sm' : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'}`}
                  >
                    <div className="text-3xl mb-3">📦</div>
                    <h3 className="font-bold text-slate-900 mb-1">从蓝图复制</h3>
                    <p className="text-sm text-slate-500 leading-relaxed mb-4">
                      粘贴已导出的公司蓝图，连同组织、知识层和自动化一起复制。
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <span className={`text-xs px-2 py-1 rounded-md font-medium ${isBlueprintTemplate ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>
                        导入 blueprint.v1
                      </span>
                      {importedBlueprint ? (
                        <span className="text-xs px-2 py-1 rounded-md font-medium bg-emerald-100 text-emerald-700">
                          已识别 {importedBlueprint.sourceCompanyName}
                        </span>
                      ) : null}
                    </div>
                  </button>
                </div>
                {isBlueprintTemplate && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-sm font-semibold text-slate-900">粘贴公司蓝图</div>
                    <div className="mt-1 text-xs leading-5 text-slate-500">
                      支持直接粘贴公司蓝图 JSON，或带 ```json 代码块的内容。
                    </div>
                    <textarea
                      value={blueprintText}
                      onChange={(event) => setBlueprintText(event.target.value)}
                      rows={8}
                      placeholder='{"kind":"cyber-company.blueprint.v1", ...}'
                      className="mt-3 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-3 font-mono text-xs outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                    />
                    <div className={`mt-2 text-xs ${importedBlueprint ? "text-emerald-600" : blueprintText.trim().length > 0 ? "text-rose-600" : "text-slate-400"}`}>
                      {importedBlueprint
                        ? `蓝图已识别：${importedBlueprint.sourceCompanyName} · ${importedBlueprint.employees.length} 名成员 · ${importedBlueprint.automations.length} 条自动化`
                        : blueprintText.trim().length > 0
                          ? "当前内容还不是有效的 cyber-company.blueprint.v1"
                          : "还没有粘贴蓝图"}
                    </div>
                  </div>
                )}
                <div className="pt-6 border-t border-slate-100 flex justify-end">
                  <button
                    onClick={() => setStep(2)}
                    disabled={isBlueprintTemplate && !importedBlueprint}
                    className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-8 py-3 rounded-xl font-bold transition-colors shadow-sm inline-flex items-center gap-2"
                  >
                    下一步 <ChevronRight size={18} />
                  </button>
                </div>
              </div>
            )}

            {step === 2 && (
               <div className="space-y-6 animate-in fade-in slide-in-from-right-8 duration-500 max-w-lg mx-auto py-8">
                 <h2 className="text-2xl font-bold text-center">给你的公司起个名字</h2>
                 <p className="text-slate-500 text-center text-sm">
                   {isBlueprintTemplate
                     ? "留空则默认沿用蓝图里的公司名，你也可以在复制前改成新的组织名。"
                     : "这个名字会显示在公司列表和默认工作区里。"}
                 </p>
                 
                 <div className="pt-6">
                   <div className="flex items-center border-2 border-slate-200 rounded-xl overflow-hidden focus-within:border-indigo-600 focus-within:ring-4 focus-within:ring-indigo-100 transition-all">
                     <span className="pl-4 pr-3 text-slate-400 bg-slate-50 h-full py-4 border-r border-slate-200">
                       <Building2 size={24} />
                     </span>
                     <input 
                       autoFocus
                       type="text" 
                       value={companyName}
                       onChange={e => setCompanyName(e.target.value)}
                       placeholder={isBlueprintTemplate ? (importedBlueprint?.sourceCompanyName || "例如：复制后的新组织名称") : "例如：小说工作室 / 客服自动化团队"}
                       className="flex-1 px-4 py-4 outline-none text-lg font-bold text-slate-800 placeholder:font-normal placeholder:text-slate-300 bg-transparent"
                     />
                   </div>
                 </div>

                 <div className="pt-10 flex gap-3">
                   <button onClick={() => setStep(1)} className="px-6 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100 transition-colors">
                     返回
                   </button>
                    <button 
                      disabled={((companyName.trim().length < 2) && !(isBlueprintTemplate && importedBlueprint?.sourceCompanyName)) || isCreating} 
                      onClick={() => { setStep(3); void handleCreate(); }} 
                     className="flex-1 bg-indigo-600 disabled:bg-slate-300 disabled:cursor-not-allowed hover:bg-indigo-700 text-white px-8 py-3 rounded-xl font-bold transition-colors shadow-sm inline-flex justify-center items-center gap-2"
                   >
                     创建并进入 <Plus size={18} />
                   </button>
                 </div>
               </div>
            )}

            {step === 3 && (
               <div className="py-8 animate-in fade-in zoom-in duration-500">
                  <div className="text-center mb-10">
                     <div className="inline-block relative">
                       <div className="absolute inset-0 bg-indigo-500/20 blur-xl rounded-full"></div>
                       <Sparkles className={`w-12 h-12 text-indigo-600 relative z-10 ${isCreating ? 'animate-pulse' : ''}`} />
                     </div>
                     <h2 className="text-2xl font-bold mt-4">{isCreating ? '正在创建团队...' : '团队已准备好'}</h2>
                     <p className="text-slate-500 mt-2">请保持当前页面打开，这通常只需要几十秒。</p>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-6">
                    <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
                      <span>部署进度</span>
                      <span>{Math.min(creationProgress.current, creationTotalSteps)} / {creationTotalSteps}</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-200">
                      <div className="h-2 rounded-full bg-indigo-600 transition-all duration-300" style={{ width: `${progressPercent}%` }} />
                    </div>
                    <div className="mt-3 text-sm text-slate-700">{creationProgress.message}</div>

                    <div className="mt-4 max-h-44 space-y-2 overflow-auto rounded-lg border border-slate-200 bg-white p-3 text-sm">
                      {creationProgress.history.length === 0 ? (
                        <div className="text-slate-400">等待部署任务开始...</div>
                      ) : (
                        creationProgress.history.map((item, idx) => (
                          <div key={`${item}-${idx}`} className="flex items-start gap-2 text-slate-600">
                            <CheckCircle2 size={14} className="mt-0.5 text-emerald-500" />
                            <span>{item}</span>
                          </div>
                        ))
                      )}
                    </div>

                    {creationError ? (
                      <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                        创建失败：{creationError}
                      </div>
                    ) : null}

                    {!isCreating && !creationError && creationProgress.current >= creationTotalSteps ? (
                      <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
                        已完成部署，正在跳转到总部大厅。
                      </div>
                    ) : null}
                  </div>
                </div>
             )}
          </div>
        </div>
      </div>
    </div>
  );
}
