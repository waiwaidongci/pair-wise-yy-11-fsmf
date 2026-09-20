import { useState, type ReactNode } from "react";
import { GROUP_STATUS_LABEL, TANK_STATUS_LABEL } from "../domain/rules";
import type { GroupStatus, TankStatus } from "../domain/types";

const TANK_TONE: Record<TankStatus, string> = {
  "pending-inspection": "red",
  queued: "blue",
  rework: "amber",
  "pending-review": "purple",
  "awaiting-signoff": "teal",
  delivered: "green",
};

const GROUP_TONE: Record<GroupStatus, string> = {
  rejected: "red",
  filling: "blue",
  rework: "amber",
  ready: "teal",
  delivered: "green",
};

export function TankBadge({ status }: { status: TankStatus }) {
  return <span className={`badge ${TANK_TONE[status]}`}>{TANK_STATUS_LABEL[status]}</span>;
}

export function GroupBadge({ status }: { status: GroupStatus }) {
  return <span className={`badge ${GROUP_TONE[status]}`}>{GROUP_STATUS_LABEL[status]}</span>;
}

export type Notice = { kind: "ok" | "err"; text: string } | null;

export function useNotice() {
  const [notice, setNotice] = useState<Notice>(null);
  const show = (r: { ok: boolean; error?: string }, okText: string) =>
    setNotice(r.ok ? { kind: "ok", text: okText } : { kind: "err", text: r.error ?? "操作失败" });
  return { notice, show };
}

export function NoticeView({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return <p className={`notice ${notice.kind}`}>{notice.text}</p>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Empty({ text }: { text: string }) {
  return <p className="empty">{text}</p>;
}

export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString("zh-CN", { hour12: false });
}
