import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { PHASE_LABEL } from "../domain/constants";
import type { RuleViolation } from "../domain/types";

// ---------- 全局操作反馈 ----------

interface Toast {
  id: number;
  kind: "ok" | "err";
  text: string;
}

interface ToastApi {
  ok: (text: string) => void;
  err: (text: string) => void;
  violations: (vs: RuleViolation[]) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((kind: Toast["kind"], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    window.setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 4200);
  }, []);

  const api: ToastApi = {
    ok: (t) => push("ok", t),
    err: (t) => push("err", t),
    violations: (vs) => push("err", vs.map((v) => v.message).join("；")),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-wrap">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.kind === "ok" ? "✓ " : "⚠ "}
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("ToastProvider 缺失");
  return api;
}

// ---------- 状态徽标 ----------

const PHASE_CLASS: Record<string, string> = {
  draft: "badge-blue",
  rejected: "badge-red",
  filling: "badge-amber",
  rework: "badge-red",
  "awaiting-signoff": "badge-teal",
  signed: "badge-green",
  "voided-awaiting-signoff": "badge-purple",
  admitted: "badge-green",
  inspection: "badge-amber",
  expired: "badge-red",
  contaminated: "badge-red",
};

export function PhaseBadge({ phase }: { phase: string }) {
  return (
    <span className={`badge ${PHASE_CLASS[phase] ?? "badge-blue"}`}>
      {PHASE_LABEL[phase] ?? phase}
    </span>
  );
}

export function MiniButton({
  children,
  onClick,
  variant,
  disabled,
  title,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "danger" | "ghost";
  disabled?: boolean;
  title?: string;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`mini ${variant === "primary" ? "mini-primary" : variant === "danger" ? "mini-danger" : variant === "ghost" ? "mini-ghost" : ""}`}
    >
      {children}
    </button>
  );
}
