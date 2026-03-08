import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCompanyStore } from "../features/company/store";
import { useGatewayStore } from "../features/gateway/store";
import { Plus, ArrowRight, Loader } from "lucide-react";

export function CompanySelect() {
  const navigate = useNavigate();
  const { config, loading: storeLoading, switchCompany, loadConfig } = useCompanyStore();
  const { connected } = useGatewayStore();
  const [initLoading, setInitLoading] = useState(true);

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

  const isLoading = storeLoading || initLoading;
  const companies = config?.companies || [];

  const handleSelect = (id: string) => {
    switchCompany(id);
    navigate("/");
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
            <button
              key={c.id}
              onClick={() => handleSelect(c.id)}
              className="group bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:border-indigo-600 hover:ring-4 hover:ring-indigo-50 transition-all text-left flex flex-col items-start"
            >
              <div className="text-4xl mb-4">{c.icon || "🏢"}</div>
              <h3 className="text-xl font-bold text-slate-900 mb-2 truncate w-full">{c.name}</h3>
              <p className="text-sm text-slate-500 mb-4 flex-1 line-clamp-2">{c.description || "暂无组织描述"}</p>
              
              <div className="w-full flex items-center justify-between mt-auto pt-4 border-t border-slate-100">
                <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded font-medium">
                  {c.employees?.length || 0} 名成员
                </span>
                <span className="text-indigo-600 group-hover:translate-x-1 transition-transform">
                  <ArrowRight size={18} />
                </span>
              </div>
            </button>
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
    </div>
  );
}
