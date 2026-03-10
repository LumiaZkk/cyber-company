import { create } from "zustand";

export type ToastTone = "success" | "error" | "warning" | "info" | "approval";

export type ToastItem = {
  id: string;
  tone: ToastTone;
  title: string;
  description?: string;
  durationMs: number;
};

type ToastInput = {
  tone?: ToastTone;
  title: string;
  description?: string;
  durationMs?: number;
};

type ToastStoreState = {
  items: ToastItem[];
  push: (input: ToastInput) => string;
  dismiss: (id: string) => void;
  clear: () => void;
};

const DEFAULT_DURATION_MS = 4000;
const MAX_TOASTS = 5;

export const useToastStore = create<ToastStoreState>((set) => ({
  items: [],
  push: (input) => {
    const id = crypto.randomUUID();
    const nextItem: ToastItem = {
      id,
      tone: input.tone ?? "info",
      title: input.title,
      description: input.description,
      durationMs: Math.max(800, input.durationMs ?? DEFAULT_DURATION_MS),
    };
    set((state) => ({
      items: [nextItem, ...state.items].slice(0, MAX_TOASTS),
    }));
    return id;
  },
  dismiss: (id) => {
    set((state) => ({
      items: state.items.filter((item) => item.id !== id),
    }));
  },
  clear: () => {
    set({ items: [] });
  },
}));

function pushToast(input: ToastInput): string {
  return useToastStore.getState().push(input);
}

export const toast = {
  success(title: string, description?: string) {
    return pushToast({ tone: "success", title, description });
  },
  error(title: string, description?: string) {
    return pushToast({ tone: "error", title, description, durationMs: 6000 });
  },
  warning(title: string, description?: string) {
    return pushToast({ tone: "warning", title, description, durationMs: 5000 });
  },
  info(title: string, description?: string) {
    return pushToast({ tone: "info", title, description });
  },
  approval(title: string, description?: string) {
    return pushToast({ tone: "approval", title, description, durationMs: 7000 });
  },
};
