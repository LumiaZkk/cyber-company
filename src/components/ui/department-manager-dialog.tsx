import * as Dialog from "@radix-ui/react-dialog";
import { useMemo, useState } from "react";
import { Archive, CheckCircle2, Pencil, Plus, X } from "lucide-react";
import type { Department, EmployeeRef } from "../../features/company/types";
import { Button } from "./button";
import { Badge } from "./badge";

type DepartmentDraft = {
  id: string;
  name: string;
  leadAgentId: string;
  color: string;
  order: number;
  archived: boolean;
};

type DepartmentManagerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  departments: Department[];
  employees: EmployeeRef[];
  busy?: boolean;
  onSubmit: (departments: Department[]) => void | Promise<void>;
};

const COLOR_CHOICES: Array<{ id: string; label: string; className: string }> = [
  { id: "indigo", label: "Indigo", className: "bg-indigo-500" },
  { id: "emerald", label: "Emerald", className: "bg-emerald-500" },
  { id: "amber", label: "Amber", className: "bg-amber-500" },
  { id: "rose", label: "Rose", className: "bg-rose-500" },
  { id: "slate", label: "Slate", className: "bg-slate-500" },
];

function toDraft(dept: Department, index: number): DepartmentDraft {
  return {
    id: dept.id,
    name: dept.name,
    leadAgentId: dept.leadAgentId,
    color: dept.color ?? "indigo",
    order: typeof dept.order === "number" ? dept.order : index,
    archived: Boolean(dept.archived),
  };
}

function toDepartment(draft: DepartmentDraft): Department {
  return {
    id: draft.id,
    name: draft.name,
    leadAgentId: draft.leadAgentId,
    color: draft.color,
    order: draft.order,
    archived: draft.archived,
  };
}

function resolveEmployeeLabel(employee: EmployeeRef): string {
  const meta = employee.metaRole ? ` (${employee.metaRole})` : "";
  return `${employee.nickname}${meta} - ${employee.agentId}`;
}

export function DepartmentManagerDialog({
  open,
  onOpenChange,
  departments,
  employees,
  busy,
  onSubmit,
}: DepartmentManagerDialogProps) {
  const employeesById = useMemo(() => {
    return new Map(employees.map((employee) => [employee.agentId, employee]));
  }, [employees]);

  const initialDrafts = useMemo(() => {
    return (departments ?? []).map((dept, idx) => toDraft(dept, idx));
  }, [departments]);

  const [drafts, setDrafts] = useState<DepartmentDraft[]>(initialDrafts);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = useMemo(() => {
    return editingId ? drafts.find((dept) => dept.id === editingId) ?? null : null;
  }, [drafts, editingId]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setDrafts(initialDrafts);
      setEditingId(null);
    }
    onOpenChange(nextOpen);
  };

  const sortedDrafts = useMemo(() => {
    return [...drafts].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }, [drafts]);

  const issues = useMemo(() => {
    const out: string[] = [];
    for (const dept of drafts) {
      if (!dept.name.trim()) {
        out.push(`存在未命名部门：${dept.id}`);
      }
      if (!dept.leadAgentId.trim()) {
        out.push(`部门「${dept.name || dept.id}」缺少负责人`);
        continue;
      }
      if (!employeesById.has(dept.leadAgentId)) {
        out.push(`部门「${dept.name || dept.id}」负责人不存在：${dept.leadAgentId}`);
      }
    }
    return out;
  }, [drafts, employeesById]);

  const canSubmit = issues.length === 0;

  const createNew = () => {
    const id = crypto.randomUUID();
    const next: DepartmentDraft = {
      id,
      name: "",
      leadAgentId: "",
      color: "indigo",
      order: drafts.length,
      archived: false,
    };
    setDrafts((current) => [...current, next]);
    setEditingId(id);
  };

  const updateEditing = (patch: Partial<DepartmentDraft>) => {
    if (!editingId) {
      return;
    }
    setDrafts((current) =>
      current.map((dept) => (dept.id === editingId ? { ...dept, ...patch } : dept)),
    );
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[95] bg-black/45 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[96] w-[min(94vw,56rem)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b bg-slate-50 px-5 py-4">
            <div>
              <Dialog.Title className="text-lg font-bold text-slate-900">部门管理</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-slate-500">
                部门仅用于展示/分组与管理入口。每个部门必须指定负责人节点。
              </Dialog.Description>
            </div>
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={busy}>
              <X className="mr-2 h-4 w-4" /> 关闭
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-0">
            <div className="md:col-span-2 border-r bg-white">
              <div className="flex items-center justify-between px-5 py-4">
                <div className="text-sm font-semibold text-slate-800">部门列表</div>
                <Button size="sm" onClick={createNew} disabled={busy}>
                  <Plus className="mr-2 h-4 w-4" /> 新建部门
                </Button>
              </div>
              <div className="max-h-[460px] overflow-y-auto px-3 pb-4">
                {sortedDrafts.length === 0 ? (
                  <div className="px-2 py-10 text-center text-sm text-slate-500">
                    暂无部门。建议先创建部门，再把员工归入部门。
                  </div>
                ) : (
                  sortedDrafts.map((dept) => {
                    const lead = employeesById.get(dept.leadAgentId);
                    const isActive = editingId === dept.id;
                    const employeeCount = employees.filter((e) => e.departmentId === dept.id).length;
                    const color = COLOR_CHOICES.find((c) => c.id === dept.color) ?? COLOR_CHOICES[0];

                    return (
                      <button
                        key={dept.id}
                        className={`w-full text-left rounded-xl border px-4 py-3 mb-2 transition ${isActive ? "border-indigo-500 bg-indigo-50/50" : "border-slate-200 hover:bg-slate-50"}`}
                        onClick={() => setEditingId(dept.id)}
                        type="button"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <div className={`h-2.5 w-2.5 rounded-full ${color.className}`} />
                              <div className="font-semibold text-slate-900 truncate">
                                {dept.name.trim() ? dept.name : "(未命名部门)"}
                              </div>
                              {dept.archived ? (
                                <Badge variant="outline" className="text-[10px]">
                                  Archived
                                </Badge>
                              ) : null}
                            </div>
                            <div className="mt-1 text-xs text-slate-500 truncate">
                              负责人: {lead ? lead.nickname : dept.leadAgentId ? "(不存在)" : "(未设置)"} · {employeeCount} 人
                            </div>
                          </div>
                          <Pencil className="h-4 w-4 text-slate-400" />
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <div className="md:col-span-3 bg-white">
              <div className="px-5 py-4 border-b">
                <div className="text-sm font-semibold text-slate-800">部门配置</div>
                <div className="text-xs text-slate-500 mt-1">
                  修改将写入 company-config.json。负责人默认挂到 CEO（如负责人上级缺失）。
                </div>
              </div>

              {editing ? (
                <div className="p-5 space-y-4">
                  <label className="block">
                    <div className="mb-1 text-sm font-medium text-slate-700">部门名称</div>
                    <input
                      value={editing.name}
                      onChange={(e) => updateEditing({ name: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                      placeholder="例如：小说创作部"
                    />
                  </label>

                  <label className="block">
                    <div className="mb-1 text-sm font-medium text-slate-700">部门负责人 (必选)</div>
                    <select
                      value={editing.leadAgentId}
                      onChange={(e) => updateEditing({ leadAgentId: e.target.value })}
                      className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm bg-white outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                    >
                      <option value="">请选择负责人...</option>
                      {employees.map((employee) => (
                        <option key={employee.agentId} value={employee.agentId}>
                          {resolveEmployeeLabel(employee)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label className="block">
                      <div className="mb-1 text-sm font-medium text-slate-700">配色</div>
                      <select
                        value={editing.color}
                        onChange={(e) => updateEditing({ color: e.target.value })}
                        className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm bg-white outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                      >
                        {COLOR_CHOICES.map((choice) => (
                          <option key={choice.id} value={choice.id}>
                            {choice.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block">
                      <div className="mb-1 text-sm font-medium text-slate-700">排序</div>
                      <input
                        type="number"
                        value={String(editing.order)}
                        onChange={(e) => updateEditing({ order: Number(e.target.value) })}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                      />
                    </label>
                  </div>

                  <label className="flex items-center gap-3 text-sm select-none">
                    <input
                      type="checkbox"
                      checked={editing.archived}
                      onChange={(e) => updateEditing({ archived: e.target.checked })}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                    />
                    <span className="text-slate-700">归档该部门（不在默认选择列表展示）</span>
                  </label>

                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                    <div className="flex items-center gap-2 font-semibold text-slate-700">
                      <Archive className="h-4 w-4" /> 说明
                    </div>
                    <div className="mt-1 leading-relaxed">
                      负责人是部门的锚点节点。组织图会在汇报线中高亮部门边界，并以负责人作为该部门的
                      结构中心。
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center text-sm text-slate-500">
                  请选择左侧一个部门进行编辑。
                </div>
              )}

              <div className="border-t bg-slate-50 px-5 py-4">
                {issues.length > 0 ? (
                  <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    {issues.join("\n")}
                  </div>
                ) : null}
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                    取消
                  </Button>
                  <Button
                    onClick={() => void onSubmit(drafts.map(toDepartment))}
                    disabled={busy || !canSubmit}
                  >
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    {busy ? "保存中..." : "保存部门配置"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
