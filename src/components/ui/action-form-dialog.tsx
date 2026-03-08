import * as Dialog from "@radix-ui/react-dialog";
import { useMemo, useState } from "react";

export type ActionFormField = {
  name: string;
  label: string;
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
  multiline?: boolean;
  type?: "text" | "password" | "checkbox";
  confirmationText?: string; // 防呆校验词
};

type ActionFormDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  fields: ActionFormField[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: Record<string, string>) => void | Promise<void>;
};

function resolveInitialValues(fields: ActionFormField[]): Record<string, string> {
  return fields.reduce<Record<string, string>>((result, field) => {
    result[field.name] = field.defaultValue ?? "";
    return result;
  }, {});
}

export function ActionFormDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "取消",
  busy = false,
  fields,
  onOpenChange,
  onSubmit,
}: ActionFormDialogProps) {
  const initialValues = useMemo(() => resolveInitialValues(fields), [fields]);
  const [values, setValues] = useState<Record<string, string>>(initialValues);

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setValues(resolveInitialValues(fields));
    }
    onOpenChange(nextOpen);
  };

  const canSubmit = fields.every((field) => {
    const val = values[field.name];

    // 如果配置了防呆确认词，必须精准匹配
    if (field.confirmationText) {
      return val === field.confirmationText;
    }

    if (!field.required) {
      return true;
    }

    if (field.type === "checkbox") {
      return val === "true";
    }
    return (val ?? "").trim().length > 0;
  });

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-black/35 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[91] w-[min(92vw,34rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
          <Dialog.Title className="text-lg font-bold text-slate-900">{title}</Dialog.Title>
          {description ? (
            <Dialog.Description className="mt-1 text-sm text-slate-500">
              {description}
            </Dialog.Description>
          ) : null}

          <form
            className="mt-5 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void onSubmit(values);
            }}
          >
            {fields.map((field) => (
              <label
                key={field.name}
                className={`block text-sm ${field.type === "checkbox" ? "flex items-center gap-3 cursor-pointer select-none py-1" : ""}`}
              >
                {field.type !== "checkbox" && (
                  <div className="mb-1 font-medium text-slate-700">{field.label}</div>
                )}

                {field.type === "checkbox" ? (
                  <>
                    <input
                      type="checkbox"
                      checked={values[field.name] === "true"}
                      onChange={(event) => {
                        setValues((current) => ({
                          ...current,
                          [field.name]: event.target.checked ? "true" : "false",
                        }));
                      }}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600 cursor-pointer"
                    />
                    <span className="font-medium text-slate-700">{field.label}</span>
                  </>
                ) : field.multiline ? (
                  <textarea
                    value={values[field.name] ?? ""}
                    onChange={(event) => {
                      setValues((current) => ({ ...current, [field.name]: event.target.value }));
                    }}
                    placeholder={field.placeholder}
                    rows={4}
                    className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  />
                ) : (
                  <input
                    type={field.type ?? "text"}
                    value={values[field.name] ?? ""}
                    onChange={(event) => {
                      setValues((current) => ({ ...current, [field.name]: event.target.value }));
                    }}
                    placeholder={field.placeholder}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  />
                )}
              </label>
            ))}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => onOpenChange(false)}
                disabled={busy}
              >
                {cancelLabel}
              </button>
              <button
                type="submit"
                disabled={busy || !canSubmit}
                className={`rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition 
                  ${busy || !canSubmit ? "opacity-50 cursor-not-allowed bg-slate-400" : "hover:bg-indigo-700"}`}
              >
                {busy ? "处理中..." : confirmLabel}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
