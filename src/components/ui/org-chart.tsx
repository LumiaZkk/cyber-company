import React, { useMemo } from 'react';
import { MoreVertical, MessageSquare, Play, Settings, UserCog } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Department } from '../../features/company/types';
import { Avatar, AvatarFallback } from './avatar';
import { Badge } from './badge';
import { Button } from './button';
import { Card, CardContent } from './card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './dropdown-menu';

export interface OrgEmployee {
  agentId: string;
  nickname: string;
  role: string;
  isMeta: boolean;
  metaRole?: string;
  reportsTo?: string;
  departmentId?: string;
  status: 'running' | 'idle' | 'stopped';
  realName?: string;
  skills?: string[];
  lastActiveAt?: number;
}

interface OrgNodeProps {
  employee: OrgEmployee;
  department?: { name: string; color?: string } | null;
  hideDepartmentBadge?: boolean;
  children?: React.ReactNode;
  onAction: (action: string, employee: OrgEmployee) => void;
  navigate: (path: string) => void;
}

interface OrgChartProps {
  employees: OrgEmployee[];
  departments?: Department[];
  onAction: (action: string, employee: OrgEmployee) => void;
}

type RenderNodeOptions = {
  scopeDepartmentId?: string;
  hideDepartmentBadge?: boolean;
  suppressDepartmentWrapper?: boolean;
};

function resolveDepartmentColorClass(color?: string): {
  dot: string;
  bg: string;
  border: string;
  text: string;
} {
  const normalized = String(color ?? '').trim().toLowerCase();
  if (normalized === 'green') {
    return {
      dot: 'bg-emerald-500',
      bg: 'bg-emerald-50/50',
      border: 'border-emerald-300',
      text: 'text-emerald-900',
    };
  }
  if (normalized === 'blue') {
    return {
      dot: 'bg-sky-500',
      bg: 'bg-sky-50/50',
      border: 'border-sky-300',
      text: 'text-sky-900',
    };
  }
  if (normalized === 'emerald') {
    return {
      dot: 'bg-emerald-500',
      bg: 'bg-emerald-50/50',
      border: 'border-emerald-300',
      text: 'text-emerald-900',
    };
  }
  if (normalized === 'amber') {
    return {
      dot: 'bg-amber-500',
      bg: 'bg-amber-50/55',
      border: 'border-amber-300',
      text: 'text-amber-900',
    };
  }
  if (normalized === 'rose') {
    return {
      dot: 'bg-rose-500',
      bg: 'bg-rose-50/55',
      border: 'border-rose-300',
      text: 'text-rose-900',
    };
  }
  if (normalized === 'slate') {
    return {
      dot: 'bg-slate-500',
      bg: 'bg-slate-50/55',
      border: 'border-slate-300',
      text: 'text-slate-900',
    };
  }
  return {
    dot: 'bg-indigo-500',
    bg: 'bg-indigo-50/55',
    border: 'border-indigo-300',
    text: 'text-indigo-900',
  };
}

function sortEmployeesForDisplay(list: OrgEmployee[], leadAgentId?: string) {
  return [...list].sort((left, right) => {
    if (left.agentId === leadAgentId) {
      return -1;
    }
    if (right.agentId === leadAgentId) {
      return 1;
    }
    if (left.isMeta !== right.isMeta) {
      return left.isMeta ? -1 : 1;
    }
    return left.nickname.localeCompare(right.nickname, 'zh-CN');
  });
}

const OrgNode: React.FC<OrgNodeProps> = ({
  employee,
  department,
  hideDepartmentBadge,
  children,
  onAction,
  navigate,
}) => {
  const isRunning = employee.status === 'running';
  const isStopped = employee.status === 'stopped';
  const deptColor = department ? resolveDepartmentColorClass(department.color) : null;
  const childCount = React.Children.count(children);

  return (
    <div className="flex flex-col items-center">
      <div className="relative z-10">
        <Card
          className={`w-64 shadow-sm transition-all hover:shadow-md border-t-4 ${
            isRunning ? 'border-t-blue-500' : isStopped ? 'border-t-slate-300' : 'border-t-green-500'
          } ${employee.isMeta ? 'bg-slate-50' : 'bg-white'}`}
        >
          <CardContent className="p-4 flex flex-col items-center text-center">
            <div className="absolute right-2 top-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="h-6 w-6 p-0 shrink-0 text-slate-400 hover:text-slate-600 rounded-full"
                  >
                    <span className="sr-only">Open menu</span>
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuLabel className="text-xs text-slate-500 font-normal">
                    员工操作
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onAction('editProfile', employee)}>
                    <UserCog className="w-4 h-4 mr-2 text-slate-500" />
                    编辑员工资料
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onAction('updateRole', employee)}>
                    <Settings className="w-4 h-4 mr-2 text-slate-500" />
                    调岗与设定
                  </DropdownMenuItem>
                  {!employee.isMeta && (
                    <DropdownMenuItem
                      className="text-red-600"
                      onClick={() => onAction('fire', employee)}
                    >
                      <Trash2Icon className="w-4 h-4 mr-2" />
                      执行解雇
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <Avatar className="h-12 w-12 mb-2 ring-2 ring-slate-100 ring-offset-1">
              <AvatarFallback
                className={
                  employee.isMeta
                    ? 'bg-indigo-100 text-indigo-700 font-bold'
                    : 'bg-slate-100 text-slate-600 font-medium'
                }
              >
                {employee.nickname.substring(0, 2)}
              </AvatarFallback>
            </Avatar>

            <div className="font-semibold text-sm text-slate-800">
              {employee.nickname}{' '}
              {employee.realName && (
                <span className="text-xs text-slate-400 font-normal">({employee.realName})</span>
              )}
            </div>
            <div className="text-xs text-slate-500 mt-0.5 line-clamp-1 h-4" title={employee.role}>
              {employee.role}
            </div>

            <div className="mt-3 flex items-center justify-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${
                  isRunning ? 'bg-blue-500 animate-pulse' : isStopped ? 'bg-slate-300' : 'bg-green-500'
                }`}
                title={employee.status}
              />
              <Badge
                variant="secondary"
                className="text-[10px] px-1.5 py-0 uppercase h-4 leading-none bg-slate-100/50"
              >
                {employee.isMeta ? 'Management' : 'Staff'}
              </Badge>
              {department && !hideDepartmentBadge ? (
                <Badge
                  variant="outline"
                  className={`text-[11px] px-2 py-0 h-5 leading-none bg-white/90 border ${
                    deptColor ? `${deptColor.text} ${deptColor.border}` : ''
                  }`}
                  title={department.name}
                >
                  <span
                    className={`mr-1.5 inline-block h-2.5 w-2.5 rounded-full ${
                      deptColor ? deptColor.dot : 'bg-slate-300'
                    }`}
                  />
                  {department.name}
                </Badge>
              ) : null}
            </div>

            <div className="w-full flex gap-1 mt-4 pt-4 border-t border-slate-100">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 h-7 text-xs bg-indigo-50/50 hover:bg-indigo-50 hover:text-indigo-700 text-indigo-600 border-indigo-100"
                onClick={() => navigate(`/chat/${employee.agentId}`)}
                disabled={isStopped}
              >
                <MessageSquare className="w-3 h-3 mr-1" />
                派音
              </Button>
              <Button variant="outline" size="sm" className="flex-1 h-7 text-xs" disabled={isStopped}>
                <Play className="w-3 h-3 mr-1" />
                挂载
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {childCount > 0 && (
        <div className="relative flex flex-col items-center pt-6">
          <div className="w-px h-6 bg-slate-300 absolute top-0 left-1/2 -ml-px" />
          <div className="flex gap-6 relative">
            {childCount > 1 && (
              <div className="absolute top-0 left-[calc(10rem+1.5rem)] right-[calc(10rem+1.5rem)] h-px bg-slate-300" />
            )}
            {React.Children.map(children, (child, index) => (
              <div key={index} className="relative pt-6">
                <div className="w-px h-6 bg-slate-300 absolute top-0 left-1/2 -ml-px" />
                {child}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export const OrgChart: React.FC<OrgChartProps> = ({ employees, departments, onAction }) => {
  const navigate = useNavigate();

  const tree = useMemo(() => {
    const employeesByAgentId = new Map(employees.map((employee) => [employee.agentId, employee]));
    const deptById = new Map(
      (Array.isArray(departments) ? departments : [])
        .filter((department) => !department.archived)
        .map((department) => [department.id, department] as const),
    );
    const deptByLead = new Map(
      (Array.isArray(departments) ? departments : [])
        .filter((department) => !department.archived)
        .map((department) => [department.leadAgentId, department] as const),
    );

    const renderForest = (params: {
      roots: OrgEmployee[];
      renderNode: (employee: OrgEmployee) => React.ReactNode;
      compact?: boolean;
    }) => (
      <div
        className={`w-full overflow-x-auto pb-8 pt-4 flex items-start ${
          params.compact ? 'justify-start min-h-0' : 'justify-center min-h-[500px]'
        }`}
      >
        {params.roots.length > 0 ? (
          <div className={`flex items-start ${params.compact ? 'gap-8' : 'gap-16'}`}>
            {params.roots.map((root) => params.renderNode(root))}
          </div>
        ) : (
          <div className="text-slate-400 text-center mt-20">
            无法构建组织架构图，请检查员工汇报层级数据。
          </div>
        )}
      </div>
    );

    const roots: OrgEmployee[] = [];
    const childrenMap = new Map<string, OrgEmployee[]>();

    employees.forEach((employee) => {
      const isRoot = !employee.reportsTo || !employeesByAgentId.has(employee.reportsTo);
      if (employee.metaRole === 'ceo' || isRoot) {
        roots.push(employee);
        return;
      }
      const parentId = employee.reportsTo!;
      const siblings = childrenMap.get(parentId) ?? [];
      siblings.push(employee);
      childrenMap.set(parentId, siblings);
    });

    const collapseDepartmentChildren = (childList: OrgEmployee[], scopeDepartmentId?: string) => {
      if (scopeDepartmentId) {
        return childList;
      }

      const visible: OrgEmployee[] = [];
      const seenDepartments = new Set<string>();

      for (const child of sortEmployeesForDisplay(childList)) {
        if (child.isMeta || !child.departmentId) {
          visible.push(child);
          continue;
        }

        const department = deptById.get(child.departmentId);
        if (!department) {
          visible.push(child);
          continue;
        }

        const sameDepartmentChildren = childList.filter(
          (candidate) => !candidate.isMeta && candidate.departmentId === child.departmentId,
        );
        const leadIsDirectChild = sameDepartmentChildren.some(
          (candidate) => candidate.agentId === department.leadAgentId,
        );

        if (sameDepartmentChildren.length <= 1 || !leadIsDirectChild) {
          visible.push(child);
          continue;
        }

        if (seenDepartments.has(child.departmentId)) {
          continue;
        }

        seenDepartments.add(child.departmentId);
        visible.push(
          sameDepartmentChildren.find((candidate) => candidate.agentId === department.leadAgentId) ?? child,
        );
      }

      return visible;
    };

    const resolveDepartmentMode = (department: Department, members: OrgEmployee[]) => {
      const lead = employeesByAgentId.get(department.leadAgentId);
      const nonLeadMembers = members.filter((member) => member.agentId !== department.leadAgentId);
      const viaLeadCount = nonLeadMembers.filter(
        (member) => member.reportsTo === department.leadAgentId,
      ).length;

      if (lead && nonLeadMembers.length > 0 && viaLeadCount === nonLeadMembers.length) {
        return {
          label: '负责人承接',
          badgeClass: 'border-emerald-300 bg-emerald-50 text-emerald-700',
          note: `负责人：${lead.nickname}`,
        };
      }

      if (viaLeadCount === 0) {
        return {
          label: 'CEO 直管',
          badgeClass: 'border-sky-300 bg-sky-50 text-sky-700',
          note: lead ? `协作锚点：${lead.nickname}` : `${members.length} 人小队`,
        };
      }

      return {
        label: '混合协作',
        badgeClass: 'border-amber-300 bg-amber-50 text-amber-700',
        note: lead ? `当前锚点：${lead.nickname}` : `${members.length} 名成员`,
      };
    };

    const renderNode = (employee: OrgEmployee, options: RenderNodeOptions = {}): React.ReactNode => {
      const currentChildren = collapseDepartmentChildren(
        (childrenMap.get(employee.agentId) ?? []).filter((child) => {
          if (!options.scopeDepartmentId) {
            return true;
          }
          return child.departmentId === options.scopeDepartmentId;
        }),
        options.scopeDepartmentId,
      );
      const department = employee.departmentId ? deptById.get(employee.departmentId) ?? null : null;
      const leadDepartment =
        !options.scopeDepartmentId && !options.suppressDepartmentWrapper
          ? (deptByLead.get(employee.agentId) ?? null)
          : null;

      const baseNode = (
        <OrgNode
          key={employee.agentId}
          employee={employee}
          department={department ? { name: department.name, color: department.color } : null}
          hideDepartmentBadge={options.hideDepartmentBadge}
          onAction={onAction}
          navigate={navigate}
        >
          {sortEmployeesForDisplay(currentChildren).map((child) =>
            renderNode(child, {
              scopeDepartmentId: options.scopeDepartmentId,
              hideDepartmentBadge: options.hideDepartmentBadge,
            }),
          )}
        </OrgNode>
      );

      if (leadDepartment && !employee.isMeta) {
        const departmentMembers = sortEmployeesForDisplay(
          employees.filter(
            (candidate) => !candidate.isMeta && candidate.departmentId === leadDepartment.id,
          ),
          leadDepartment.leadAgentId,
        );
        const memberIds = new Set(departmentMembers.map((member) => member.agentId));
        const departmentRoots = sortEmployeesForDisplay(
          departmentMembers.filter((member) => {
            if (member.agentId === leadDepartment.leadAgentId) {
              return true;
            }
            return !member.reportsTo || !memberIds.has(member.reportsTo);
          }),
          leadDepartment.leadAgentId,
        );
        const color = resolveDepartmentColorClass(leadDepartment.color);
        const mode = resolveDepartmentMode(leadDepartment, departmentMembers);

        return (
          <div
            key={`${employee.agentId}:dept`}
            className={`min-w-[20rem] rounded-[28px] border-4 border-dashed ${color.border} ${color.bg} px-5 py-4 shadow-sm`}
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 px-1">
              <div className="min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`h-3 w-3 rounded-full ${color.dot}`} />
                  <div className={`text-sm font-bold ${color.text} truncate`}>{leadDepartment.name}</div>
                </div>
                <div className="mt-1 text-xs leading-5 text-slate-600">{mode.note}</div>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={`text-[11px] bg-white/90 border ${mode.badgeClass}`}
                >
                  {mode.label}
                </Badge>
                <Badge
                  variant="outline"
                  className={`text-[11px] bg-white/90 border ${color.border} ${color.text}`}
                >
                  {departmentMembers.length} 人
                </Badge>
              </div>
            </div>
            <div className="rounded-2xl border border-white/80 bg-white/35 px-3 py-3">
              {renderForest({
                roots: departmentRoots.length > 0 ? departmentRoots : [employee],
                renderNode: (member) =>
                  renderNode(member, {
                    scopeDepartmentId: leadDepartment.id,
                    hideDepartmentBadge: true,
                    suppressDepartmentWrapper: true,
                  }),
                compact: true,
              })}
            </div>
          </div>
        );
      }

      return baseNode;
    };

    return renderForest({
      roots: sortEmployeesForDisplay(roots, roots.find((root) => root.metaRole === 'ceo')?.agentId),
      renderNode,
    });
  }, [departments, employees, navigate, onAction]);

  return tree;
};

const Trash2Icon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M3 6h18" />
    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
);
