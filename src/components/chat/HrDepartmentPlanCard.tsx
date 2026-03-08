import { Building2, Users, Network, ArrowRight } from "lucide-react";
import React, { useMemo } from "react";
import { useCompanyStore } from "../../features/company/store";
import type { HrDepartmentPlanV1 } from "../../lib/hr-dept-plan";
import { Badge } from "../ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";

interface HrDepartmentPlanCardProps {
  plan: HrDepartmentPlanV1;
}

export const HrDepartmentPlanCard: React.FC<HrDepartmentPlanCardProps> = ({ plan }) => {
  const { activeCompany } = useCompanyStore();

  const empMap = useMemo(() => {
    const map = new Map<string, { name: string; role: string; meta: string }>();
    if (!activeCompany) {
      return map;
    }
    activeCompany.employees.forEach((emp) => {
      map.set(emp.agentId, {
        name: emp.nickname,
        role: emp.role || "未分配职业",
        meta: emp.metaRole || "",
      });
    });
    return map;
  }, [activeCompany]);

  // 从当前提案以及现有系统中合并一个部门词典以供查询关联关系
  const deptMap = useMemo(() => {
    const map = new Map<string, string>();
    if (activeCompany && Array.isArray(activeCompany.departments)) {
      activeCompany.departments.forEach((d) => map.set(d.id, d.name));
    }
    if (plan.departments) {
      plan.departments.forEach((d) => map.set(d.id, d.name));
    }
    return map;
  }, [activeCompany, plan.departments]);

  const resolveEmpName = (id: string) => {
    const info = empMap.get(id);
    if (!info) {
      return id;
    }
    if (info.meta) {
      return `${info.name} (${info.meta})`;
    }
    return info.name;
  };

  const resolveDeptName = (id: string) => {
    return deptMap.get(id) || id;
  };

  return (
    <Card className="w-full max-w-2xl my-4 overflow-hidden shadow-sm border-indigo-100">
      <CardHeader className="bg-gradient-to-r from-indigo-50/50 to-white pb-4 border-b">
        <div className="flex items-center gap-2">
          <div className="p-2 shrink-0 bg-indigo-100 text-indigo-700 rounded-lg">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              组织架构规划变动单
              <Badge
                variant="outline"
                className="text-[10px] bg-white text-indigo-700 border-indigo-200"
              >
                HR 提案
              </Badge>
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              企业节点:{" "}
              <code className="bg-slate-100 px-1 rounded text-slate-500">{plan.companyId}</code>
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x">
          {/* 部门规划区 */}
          {plan.departments && plan.departments.length > 0 && (
            <div className="flex-1 p-5 bg-white">
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4 flex items-center">
                <Network className="w-4 h-4 mr-1.5" /> 设立建制部门 ({plan.departments.length})
              </h4>
              <div className="space-y-3">
                {plan.departments.map((dept, i) => (
                  <div
                    key={i}
                    className="flex justify-between items-center p-3 rounded-lg border bg-slate-50/50 hover:bg-slate-50 transition-colors"
                  >
                    <div>
                      <div className="font-medium text-sm text-slate-900 flex items-center gap-2">
                        {dept.name}
                        {dept.color && (
                          <span
                            className={`w-2.5 h-2.5 rounded-full bg-${dept.color}-500`}
                            title={`颜色标识: ${dept.color}`}
                          />
                        )}
                      </div>
                      <div
                        className="text-xs text-slate-500 mt-1 truncate max-w-[160px]"
                        title={`ID: ${dept.id}`}
                      >
                        编制代号: {dept.id}
                      </div>
                    </div>
                    <div className="text-right flex flex-col items-end">
                      <span className="text-[10px] text-slate-400 mb-1">主管任命 (ID)</span>
                      <Badge
                        variant="secondary"
                        className="font-mono text-[10px] bg-indigo-50 text-indigo-700"
                      >
                        {resolveEmpName(dept.leadAgentId)}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 人事调配区 */}
          {plan.employees && plan.employees.length > 0 && (
            <div className="flex-1 p-5 bg-slate-50">
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4 flex items-center">
                <Users className="w-4 h-4 mr-1.5" /> 节点人事派遣 ({plan.employees.length})
              </h4>
              <div className="space-y-3">
                {plan.employees.map((emp, i) => (
                  <div
                    key={i}
                    className="flex flex-col p-3 rounded-lg border bg-white shadow-sm border-slate-100"
                  >
                    <div className="font-medium text-sm mb-2 flex items-center">
                      员工节点
                      <Badge
                        variant="outline"
                        className="text-[10px] ml-2 bg-slate-50 text-slate-700 border-slate-200"
                      >
                        {resolveEmpName(emp.agentId)}
                      </Badge>
                    </div>
                    {emp.departmentId || emp.reportsTo ? (
                      <div className="grid gap-2 text-xs">
                        {emp.departmentId && (
                          <div className="flex items-center text-slate-600">
                            <span className="w-16 text-slate-400 shrink-0">划拨部门</span>
                            <ArrowRight className="w-3 h-3 mx-1 text-slate-300" />
                            <span className="font-semibold text-slate-700">
                              {resolveDeptName(emp.departmentId)}
                            </span>
                          </div>
                        )}
                        {emp.reportsTo && (
                          <div className="flex items-center text-slate-600">
                            <span className="w-16 text-slate-400 shrink-0">直线汇报</span>
                            <ArrowRight className="w-3 h-3 mx-1 text-slate-300" />
                            <span className="font-semibold text-slate-700">
                              {resolveEmpName(emp.reportsTo)}
                            </span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-xs text-slate-400 italic">属性未变更</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 附加指令区 */}
        {plan.notes && plan.notes.length > 0 && (
          <div className="bg-amber-50/50 p-4 border-t border-amber-100/50">
            <h5 className="text-[11px] font-semibold text-amber-800 uppercase tracking-wider mb-2">
              执行备注 (Notes)
            </h5>
            <ul className="text-xs text-amber-700/80 space-y-1 list-disc list-inside">
              {plan.notes.map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
