"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { severityCardStyle, Severity } from "@/lib/ui/statusColors";

export type ToastVariant = "info" | "success" | "error";

const VARIANT_TO_SEVERITY: Record<ToastVariant, Severity> = {
  info: "neutral",
  success: "success",
  error: "critical",
};

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
  action?: ToastAction;
}

interface ShowToastOptions {
  variant?: ToastVariant;
  durationMs?: number;
  action?: ToastAction;
}

interface ToastContextValue {
  showToast: (message: string, variantOrOptions?: ToastVariant | ShowToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const showToast = useCallback((message: string, variantOrOptions?: ToastVariant | ShowToastOptions) => {
    const options: ShowToastOptions =
      typeof variantOrOptions === "string" ? { variant: variantOrOptions } : variantOrOptions ?? {};
    const { variant = "info", durationMs = 4000, action } = options;

    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, message, variant, action }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, durationMs);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className="pointer-events-auto flex min-w-[240px] max-w-sm items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg"
            style={severityCardStyle(VARIANT_TO_SEVERITY[toast.variant])}
          >
            <span>{toast.message}</span>
            {toast.action && (
              <button
                onClick={() => {
                  toast.action?.onClick();
                  setToasts((prev) => prev.filter((t) => t.id !== toast.id));
                }}
                className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold underline underline-offset-2 hover:opacity-70"
              >
                {toast.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}
