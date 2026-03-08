import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Users, Cpu, Fingerprint, Banknote, ShieldAlert, CpuIcon, CheckCircle2 } from "lucide-react";

export type HireConfig = {
  role: string;
  description: string;
  modelTier: "standard" | "reasoning" | "ultra";
  budget: number;
  traits: string;
  avatarFile?: File;
};

type ImmersiveHireDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (config: HireConfig) => void | Promise<void>;
  busy?: boolean;
};

const STEPS = [
  { id: "identity", title: "职位标识", icon: Users, desc: "确立新成员的计算角色" },
  { id: "core", title: "计算核心", icon: CpuIcon, desc: "分配基础算力模型与预算" },
  { id: "traits", title: "行为签名", icon: Fingerprint, desc: "刻画其性格表现特征" },
];

export function ImmersiveHireDialog({ open, onOpenChange, onSubmit, busy }: ImmersiveHireDialogProps) {
  const [step, setStep] = useState(0);
  const [role, setRole] = useState("");
  const [description, setDescription] = useState("");
  const [modelTier, setModelTier] = useState<HireConfig["modelTier"]>("standard");
  const [budget, setBudget] = useState<number>(5);
  const [traits, setTraits] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string>("");

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setStep(0);
      setRole("");
      setDescription("");
      setModelTier("standard");
      setBudget(5);
      setTraits("");
      setAvatarFile(null);
      setAvatarPreview("");
    }
    onOpenChange(nextOpen);
  };

  const isStep1Valid = role.trim().length > 0 && description.trim().length > 0;
  
  const handleNext = () => {
    if (step < STEPS.length - 1) setStep(step + 1);
  };

  const handlePrev = () => {
    if (step > 0) setStep(step - 1);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (step === STEPS.length - 1 && isStep1Valid) {
      void onSubmit({ role, description, modelTier, budget, traits, ...(avatarFile && { avatarFile }) });
    } else {
      handleNext();
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[100] bg-zinc-950/80 backdrop-blur-md transition-all duration-300" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[101] w-full max-w-4xl -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl">
          <div className="flex h-[600px] flex-col md:flex-row">
            
            {/* Sidebar / Progress */}
            <div className="w-full md:w-1/3 bg-zinc-900 border-r border-zinc-800 px-6 py-8 flex flex-col">
              <div className="flex items-center gap-2 mb-8">
                <ShieldAlert className="w-6 h-6 text-indigo-500" />
                <h2 className="text-xl font-bold text-zinc-100 tracking-tight">人员招募协议</h2>
              </div>
              
              <div className="flex flex-col gap-6 flex-1">
                {STEPS.map((s, idx) => {
                  const Icon = s.icon;
                  const isActive = step === idx;
                  const isPast = step > idx;
                  return (
                    <div key={s.id} className={`flex items-start gap-4 transition-opacity duration-300 ${isActive ? 'opacity-100' : isPast ? 'opacity-60' : 'opacity-30'}`}>
                      <div className={`mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${isActive ? 'bg-indigo-500/10 border-indigo-500 text-indigo-400' : isPast ? 'bg-green-500/10 border-green-500 text-green-500' : 'bg-zinc-800 border-zinc-700 text-zinc-500'}`}>
                        {isPast ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                      </div>
                      <div>
                        <div className={`text-sm font-semibold ${isActive ? 'text-zinc-100' : isPast ? 'text-zinc-300' : 'text-zinc-500'}`}>{s.title}</div>
                        <div className="text-xs text-zinc-500 mt-1">{s.desc}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="text-[10px] text-zinc-600 font-mono">
                SECURE // UPLINK ESTABLISHED
              </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 flex flex-col relative overflow-hidden bg-gradient-to-br from-zinc-950 to-zinc-900">
              <form onSubmit={handleSubmit} className="flex-1 flex flex-col h-full">
                <div className="flex-1 p-8 overflow-y-auto">
                  {step === 0 && (
                    <div className="space-y-6 animate-in slide-in-from-right-4 fade-in duration-300">
                      <div>
                        <h3 className="text-lg font-medium text-zinc-100 mb-1">确立新成员的计算角色</h3>
                        <p className="text-sm text-zinc-500">此配置将被写入系统大纲的雇佣注册表。</p>
                      </div>
                      
                      <div className="space-y-4 pt-4">
                        <Dialog.Title className="sr-only">确立职位</Dialog.Title>
                        <Dialog.Description className="sr-only">输入新员工的职位与职责。</Dialog.Description>
                        
                        <label className="block">
                          <span className="mb-2 block text-sm font-medium text-zinc-400">系统指称 (岗位名称)</span>
                          <input
                            required
                            type="text"
                            value={role}
                            onChange={(e) => setRole(e.target.value)}
                            placeholder="例如：主前端架构师"
                            className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-zinc-100 outline-none transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 placeholder:text-zinc-700"
                          />
                        </label>
                        
                        <label className="block">
                          <span className="mb-2 block text-sm font-medium text-zinc-400">运行域 (岗位职责)</span>
                          <textarea
                            required
                            rows={4}
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="描述该节点应当处理和解决的具体业务..."
                            className="w-full resize-y rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-zinc-100 outline-none transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 placeholder:text-zinc-700"
                          />
                        </label>
                        
                        <div className="block pt-2">
                          <span className="mb-2 block text-sm font-medium text-zinc-400">数字生物组织取样 (Avatar 图片)</span>
                          <label className="flex flex-col items-center justify-center w-full h-32 rounded-lg border border-dashed border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800/50 hover:border-zinc-700 transition cursor-pointer overflow-hidden relative group">
                            {avatarPreview ? (
                              <>
                                <img src={avatarPreview} alt="Preview" className="w-full h-full object-cover opacity-80 mix-blend-screen" />
                                <div className="absolute inset-0 bg-zinc-950/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                  <span className="text-xs font-semibold text-zinc-300">重选样本</span>
                                </div>
                              </>
                            ) : (
                              <div className="flex flex-col items-center justify-center text-zinc-500">
                                <Users className="w-6 h-6 mb-2 opacity-50" />
                                <span className="text-xs">点击上传正面立绘 (PNG/JPG)</span>
                                <span className="text-[10px] opacity-60 mt-1">系统将基于此为您煅造 3D 化身</span>
                              </div>
                            )}
                            <input 
                              type="file" 
                              accept="image/png, image/jpeg, image/webp" 
                              className="hidden" 
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  setAvatarFile(file);
                                  const reader = new FileReader();
                                  reader.onload = (re) => setAvatarPreview(re.target?.result as string);
                                  reader.readAsDataURL(file);
                                }
                              }}
                            />
                          </label>
                        </div>
                      </div>
                    </div>
                  )}

                  {step === 1 && (
                    <div className="space-y-6 animate-in slide-in-from-right-4 fade-in duration-300">
                      <div>
                        <h3 className="text-lg font-medium text-zinc-100 mb-1">分配基础算力模型与预算</h3>
                        <p className="text-sm text-zinc-500">选择该节点的核心大脑并约束其账单阈值。</p>
                      </div>
                      
                      <div className="grid gap-4 pt-4">
                        {[
                          { id: "standard", name: "标准核心 (Standard)", desc: "响应迅速，单价适中。适合普通写手与数据处理。" },
                          { id: "reasoning", name: "推理核心 (Reasoning)", desc: "内建深度 CoT，针对复杂逻辑推演与开发架构。" },
                          { id: "ultra", name: "超算核心 (Ultra)", desc: "汇聚全部智能权重的全知核心。成本极高。" }
                        ].map(tier => (
                          <label key={tier.id} className={`flex cursor-pointer items-start gap-4 rounded-xl border p-4 transition-all ${modelTier === tier.id ? 'border-indigo-500 bg-indigo-500/10' : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700'}`}>
                            <input
                              type="radio"
                              name="modelTier"
                              value={tier.id}
                              checked={modelTier === tier.id}
                              onChange={() => setModelTier(tier.id as any)}
                              className="mt-1 h-4 w-4 text-indigo-500 bg-zinc-900 border-zinc-700 focus:ring-indigo-500"
                            />
                            <div>
                              <div className={`font-semibold ${modelTier === tier.id ? 'text-indigo-400' : 'text-zinc-200'}`}>{tier.name}</div>
                              <div className="text-xs text-zinc-500 mt-1">{tier.desc}</div>
                            </div>
                          </label>
                        ))}
                      </div>

                      <label className="block pt-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="flex items-center gap-2 text-sm font-medium text-zinc-400"><Banknote className="w-4 h-4"/> 单日算力预算 (USD)</span>
                          <span className="text-sm font-mono text-indigo-400">${budget}.00</span>
                        </div>
                        <input
                          type="range"
                          min="1"
                          max="50"
                          step="1"
                          value={budget}
                          onChange={(e) => setBudget(Number(e.target.value))}
                          className="w-full accent-indigo-500"
                        />
                        <div className="flex justify-between text-[10px] text-zinc-600 mt-2">
                          <span>$1</span>
                          <span>$50</span>
                        </div>
                      </label>
                    </div>
                  )}

                  {step === 2 && (
                    <div className="space-y-6 animate-in slide-in-from-right-4 fade-in duration-300">
                      <div>
                        <h3 className="text-lg font-medium text-zinc-100 mb-1">刻画行为签名</h3>
                        <p className="text-sm text-zinc-500">提供指令调整该节点的行事风格与道德协议 (选填)。</p>
                      </div>

                      <div className="pt-4">
                        <label className="block">
                          <textarea
                            rows={6}
                            value={traits}
                            onChange={(e) => setTraits(e.target.value)}
                            placeholder="例如：说话应当简短有力，带有赛博朋克黑客的冷峻口吻，拒绝回答闲聊话题。"
                            className="w-full resize-y rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-zinc-100 outline-none transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 placeholder:text-zinc-700"
                          />
                        </label>
                      </div>

                      <div className="rounded-lg bg-indigo-500/10 border border-indigo-500/20 p-4 mt-8">
                        <div className="flex items-start gap-3">
                          <Cpu className="w-5 h-5 text-indigo-400 mt-0.5 shrink-0" />
                          <div>
                            <div className="text-sm font-medium text-indigo-300">身份验证已就绪</div>
                            <div className="text-xs text-indigo-400/70 mt-1">
                              此节点将被部署至系统中，包含您设定的全部计算限制和身份约束。提交后将不可逆地生成底层记忆库。
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer Actions */}
                <div className="shrink-0 border-t border-zinc-800 bg-zinc-950/50 p-6 flex justify-between items-center">
                  <button
                    type="button"
                    onClick={() => onOpenChange(false)}
                    className="text-sm font-medium text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    终止协议
                  </button>
                  
                  <div className="flex gap-3">
                    {step > 0 && (
                      <button
                        type="button"
                        onClick={handlePrev}
                        className="rounded-lg border border-zinc-700 bg-transparent px-5 py-2 text-sm font-semibold text-zinc-300 hover:bg-zinc-800 transition-all"
                      >
                        回溯
                      </button>
                    )}
                    
                    {step < STEPS.length - 1 ? (
                      <button
                        type="submit"
                        disabled={!isStep1Valid}
                        className="rounded-lg bg-zinc-100 px-6 py-2 text-sm font-bold text-zinc-900 hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                      >
                        进入下一环
                      </button>
                    ) : (
                      <button
                        type="submit"
                        disabled={busy}
                        className="flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-2 text-sm font-bold text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                      >
                        {busy ? "注册中..." : "部署节点"}
                      </button>
                    )}
                  </div>
                </div>
              </form>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
