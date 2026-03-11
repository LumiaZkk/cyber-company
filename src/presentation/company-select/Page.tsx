import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useGatewayStore } from "../../application/gateway";
import { useCompanyShellCommands, useCompanyShellQuery } from "../../application/company/shell";
import { ActionFormDialog } from "../../components/ui/action-form-dialog";
import { toast } from "../../components/system/toast-store";
import { Plus, ArrowRight, Loader, Trash2 } from "lucide-react";
import type { Company } from "../../domain/org/types";
import { isReservedSystemCompany } from "../../domain/org/system-company";

export function CompanySelectPresentationPage() {
  const navigate = useNavigate();
  const { config, loading: storeLoading } = useCompanyShellQuery();
  const { switchCompany, deleteCompany, loadConfig } = useCompanyShellCommands();
  const { connected } = useGatewayStore();
  const [initLoading, setInitLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Company | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  // 强制确保配置被加载
  useEffect(() => {
    async function init() {
      if (connected && !config) {
        await loadConfig();
      }
      setInitLoading(false);
    }
    init();
  }, [connected, config, loadConfig]);

  const isLoading = initLoading || (storeLoading && !deleteDialogOpen && !deleteSubmitting);
  const companies = config?.companies || [];

  const handleSelect = (id: string) => {
    switchCompany(id);
    navigate("/");
  };

  const handleDeleteRequest = (company: Company) => {
    if (isReservedSystemCompany(company)) {
      toast.info("默认公司已锁定", "这个系统公司用于承接 OpenClaw 的 main agent，当前不可删除。");
      return;
    }
    setDeleteTarget(company);
    setDeleteDialogOpen(true);
  };

  const handleDeleteSubmit = async () => {
    if (!deleteTarget) {
      return;
    }

    setDeleteSubmitting(true);
    try {
      await deleteCompany(deleteTarget.id);
      toast.success(
        "公司已删除",
        `已确认「${deleteTarget.name}」相关 agent 已从 OpenClaw 删除，并完成公司数据清理。`,
      );
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
      navigate("/select", { replace: true });
    } catch (error) {
      toast.error("删除失败", error instanceof Error ? error.message : String(error));
    } finally {
      setDeleteSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <Loader className="w-12 h-12 text-indigo-400 animate-spin mb-4" />
        <h2 className="text-slate-600 font-medium animate-pulse">正在加载可用公司...</h2>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center py-8 px-4 overflow-y-auto">
      <div className="max-w-5xl w-full relative z-10 flex-1">
        <div className="mb-5 space-y-1">
          <h1 className="text-xl font-semibold text-slate-900">选择要继续推进的公司</h1>
          <p className="text-sm text-slate-500">继续一个已有团队，或创建新的 AI 公司。</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {companies.map((c) => (
            <div
              key={c.id}
              className="group bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:border-indigo-600 hover:ring-4 hover:ring-indigo-50 transition-all text-left flex flex-col items-start"
            >
              <button
                type="button"
                onClick={() => handleSelect(c.id)}
                className="w-full text-left flex flex-1 flex-col items-start"
              >
                <div className="text-4xl mb-4">{c.icon || "🏢"}</div>
                <div className="mb-2 flex w-full items-center gap-2">
                  <h3 className="truncate text-xl font-bold text-slate-900">{c.name}</h3>
                  {isReservedSystemCompany(c) ? (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                      默认
                    </span>
                  ) : null}
                </div>
                <p className="text-sm text-slate-500 mb-4 flex-1 line-clamp-2">
                  {c.description || "暂无组织描述"}
                </p>
              </button>

              <div className="w-full flex items-center justify-between mt-auto pt-4 border-t border-slate-100">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded font-medium">
                    {c.employees?.length || 0} 名成员
                  </span>
                  {isReservedSystemCompany(c) ? (
                    <span className="text-xs text-indigo-600 bg-indigo-50 px-2 py-1 rounded font-medium">
                      映射 main
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  {isReservedSystemCompany(c) ? null : (
                    <button
                      type="button"
                      onClick={() => handleDeleteRequest(c)}
                      className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-medium text-rose-600 transition hover:bg-rose-50"
                    >
                      <Trash2 size={14} />
                      删除
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleSelect(c.id)}
                    className="inline-flex items-center gap-1 text-indigo-600 group-hover:translate-x-1 transition-transform"
                  >
                    进入
                    <ArrowRight size={18} />
                  </button>
                </div>
              </div>
            </div>
          ))}

          <button
            onClick={() => navigate("/create")}
            className="group bg-indigo-50/50 p-6 rounded-2xl border-2 border-dashed border-indigo-200 hover:border-indigo-600 hover:bg-indigo-50 transition-all text-left flex flex-col items-center justify-center min-h-[220px]"
          >
            <div className="bg-white text-indigo-600 w-14 h-14 rounded-full flex items-center justify-center mb-4 shadow-sm group-hover:scale-110 transition-transform">
              <Plus size={24} />
            </div>
            <h3 className="text-lg font-bold text-indigo-900 mb-1">新建公司</h3>
            <p className="text-sm text-indigo-600/70 text-center px-4">从 CEO 开始搭建一个新的 AI 团队</p>
          </button>
        </div>
      </div>

      <ActionFormDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open);
          if (!open) {
            setDeleteTarget(null);
          }
        }}
        title="删除公司"
        description={
          deleteTarget
            ? `删除后会移除「${deleteTarget.name}」的公司配置，并清理该公司独占员工的会话、归档、自动化和 agent 文件内容。请输入公司名确认。`
            : "请输入公司名确认删除。"
        }
        confirmLabel="删除公司"
        busy={deleteSubmitting}
        fields={[
          {
            name: "companyName",
            label: "输入公司名确认",
            placeholder: deleteTarget?.name ?? "",
            required: true,
            confirmationText: deleteTarget?.name ?? "",
          },
        ]}
        onSubmit={handleDeleteSubmit}
      />
    </div>
  );
}
