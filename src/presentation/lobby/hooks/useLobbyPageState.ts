import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { HireConfig } from "../../../components/ui/immersive-hire-dialog";
import { toast } from "../../../components/system/toast-store";

type LobbyCommands = {
  buildBlueprintText: () => string;
  syncKnowledge: () => Promise<number>;
  hireEmployee: (config: HireConfig) => Promise<string | null>;
  updateRole: (
    agentId: string | null,
    role: string,
    description: string,
  ) => Promise<boolean | null>;
  fireEmployee: (agentId: string) => Promise<unknown>;
  assignQuickTask: (agentId: string, text: string) => Promise<boolean | null>;
  buildGroupChatRoute: (input: { memberIds: string[]; topic: string }) => Promise<string | null>;
  recoverCommunication: (options?: { silent?: boolean; force?: boolean }) => Promise<{
    requestsAdded: number;
    requestsUpdated: number;
    tasksRecovered: number;
    handoffsRecovered: number;
  } | null>;
};

export function useLobbyPageState(input: {
  commands: LobbyCommands;
  ceoAgentId: string | null;
}) {
  const navigate = useNavigate();
  const [hireDialogOpen, setHireDialogOpen] = useState(false);
  const [updateRoleDialogOpen, setUpdateRoleDialogOpen] = useState(false);
  const [updateRoleTarget, setUpdateRoleTarget] = useState<string | null>(null);
  const [updateRoleInitial, setUpdateRoleInitial] = useState({ role: "", description: "" });
  const [fireEmployeeDialogOpen, setFireEmployeeDialogOpen] = useState(false);
  const [fireEmployeeTarget, setFireEmployeeTarget] = useState<string | null>(null);
  const [groupChatDialogOpen, setGroupChatDialogOpen] = useState(false);
  const [quickTaskInput, setQuickTaskInput] = useState("");
  const [quickTaskTarget, setQuickTaskTarget] = useState("");

  const handleCopyBlueprint = async () => {
    try {
      await navigator.clipboard.writeText(input.commands.buildBlueprintText());
      toast.success("组织蓝图已复制", "可以在新建公司页选择“从蓝图复制”后直接粘贴。");
    } catch (error) {
      toast.error("复制失败", error instanceof Error ? error.message : String(error));
    }
  };

  const handleSyncKnowledge = async () => {
    try {
      const count = await input.commands.syncKnowledge();
      toast.success("共享知识已同步", `已写入 ${count} 条公司级知识内容。`);
    } catch (error) {
      toast.error("同步失败", error instanceof Error ? error.message : String(error));
    }
  };

  const handleRecoverCommunication = async (options?: { silent?: boolean; force?: boolean }) => {
    try {
      const summary = await input.commands.recoverCommunication(options);
      if (!options?.silent && summary) {
        toast.success(
          "请求闭环已同步",
          `新增 ${summary.requestsAdded}，更新 ${summary.requestsUpdated}，恢复任务 ${summary.tasksRecovered}，恢复交接 ${summary.handoffsRecovered}。`,
        );
      }
    } catch (error) {
      if (!options?.silent) {
        toast.error("恢复失败", error instanceof Error ? error.message : String(error));
      }
    }
  };

  const handleHireSubmit = async (config: HireConfig) => {
    const agentId = await input.commands.hireEmployee(config);
    if (!agentId) {
      return;
    }
    setHireDialogOpen(false);
    navigate(`/chat/${agentId}`);
  };

  const handleUpdateRoleSubmit = async (values: Record<string, string>) => {
    const updated = await input.commands.updateRole(
      updateRoleTarget,
      values.role ?? "",
      values.description ?? "",
    );
    if (updated) {
      setUpdateRoleDialogOpen(false);
    }
  };

  const handleFireEmployee = (agentId: string) => {
    setFireEmployeeTarget(agentId);
    setFireEmployeeDialogOpen(true);
  };

  const onFireEmployeeSubmit = async () => {
    if (!fireEmployeeTarget) {
      return;
    }
    try {
      await input.commands.fireEmployee(fireEmployeeTarget);
      setTimeout(() => window.location.reload(), 1500);
    } catch (error) {
      console.error(error);
    }
  };

  const handleQuickTaskSubmit = async () => {
    if (!quickTaskTarget || !quickTaskInput.trim()) {
      return;
    }
    try {
      const assigned = await input.commands.assignQuickTask(quickTaskTarget, quickTaskInput);
      if (!assigned) {
        return;
      }
      toast.success("指令派发成功", "任务已交给对应成员。");
      setQuickTaskInput("");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error("派发失败", message);
    }
  };

  const handleGroupChatSubmit = async (values: Record<string, string | boolean | undefined>) => {
    const topic = typeof values.topic === "string" ? values.topic.trim() : "";
    const members = Object.keys(values)
      .filter((key) => key.startsWith("member_") && values[key])
      .map((key) => key.replace("member_", ""));

    if (!topic || members.length < 2) {
      toast.warning("信息不全", "请至少选择2名跨部门与会者，并指定会议主题");
      return;
    }
    const route = await input.commands.buildGroupChatRoute({ memberIds: members, topic });
    if (!route) {
      toast.error("团队房间创建失败", "没有生成有效的需求团队房间。");
      return;
    }

    navigate(route);
    setGroupChatDialogOpen(false);
  };

  return {
    hireDialogOpen,
    setHireDialogOpen,
    updateRoleDialogOpen,
    setUpdateRoleDialogOpen,
    updateRoleTarget,
    setUpdateRoleTarget,
    updateRoleInitial,
    setUpdateRoleInitial,
    fireEmployeeDialogOpen,
    setFireEmployeeDialogOpen,
    fireEmployeeTarget,
    setFireEmployeeTarget,
    groupChatDialogOpen,
    setGroupChatDialogOpen,
    quickTaskInput,
    setQuickTaskInput,
    quickTaskTarget,
    setQuickTaskTarget,
    handleCopyBlueprint,
    handleSyncKnowledge,
    handleRecoverCommunication,
    handleHireSubmit,
    handleUpdateRoleSubmit,
    handleFireEmployee,
    onFireEmployeeSubmit,
    handleQuickTaskSubmit,
    handleGroupChatSubmit,
    openCeoChat: () => {
      if (input.ceoAgentId) {
        navigate(`/chat/${input.ceoAgentId}`);
      }
    },
  };
}
