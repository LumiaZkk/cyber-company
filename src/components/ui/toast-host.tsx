import { useEffect } from "react";
import { useToastStore, type ToastTone } from "../system/toast-store";

const toneClassMap: Record<ToastTone, string> = {
  success: "border-emerald-300 bg-emerald-50 text-emerald-800",
  error: "border-red-300 bg-red-50 text-red-800",
  warning: "border-amber-300 bg-amber-50 text-amber-800",
  info: "border-blue-300 bg-blue-50 text-blue-800",
  approval: "border-violet-300 bg-violet-50 text-violet-800",
};

const toneLabelMap: Record<ToastTone, string> = {
  success: "✅",
  error: "❌",
  warning: "⚠️",
  info: "💬",
  approval: "🛡️",
};

export function ToastHost() {
  const items = useToastStore((state) => state.items);
  const dismiss = useToastStore((state) => state.dismiss);

  useEffect(() => {
    const timers = items.map((item) =>
      window.setTimeout(() => {
        dismiss(item.id);
      }, item.durationMs),
    );

    return () => {
      for (const timer of timers) {
        window.clearTimeout(timer);
      }
    };
  }, [items, dismiss]);

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed right-4 top-[5.5rem] z-[80] flex w-[min(92vw,22rem)] flex-col gap-2">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => dismiss(item.id)}
          style={{ animation: `toast-lifecycle ${item.durationMs}ms ease-in-out forwards` }}
          className={`pointer-events-auto w-full rounded-xl border px-3 py-3 text-left shadow-sm transition hover:shadow-md ${toneClassMap[item.tone]}`}
        >
          <div className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0">{toneLabelMap[item.tone]}</span>
            <div className="min-w-0">
              <div className="text-sm font-semibold leading-5">{item.title}</div>
              {item.description ? <div className="mt-1 text-xs opacity-90">{item.description}</div> : null}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
