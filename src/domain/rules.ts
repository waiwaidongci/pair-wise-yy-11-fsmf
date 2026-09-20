import type {
  AppState,
  Cleanliness,
  FillRecord,
  GroupStatus,
  Signoff,
  Tank,
  TankStatus,
} from "./types";

/** 复测允差：氧 ±1%、氦 ±2%、静置压力 ±10bar */
export const TOLERANCES = { o2: 1, he: 2, bar: 10 } as const;
/** 检验有效期剩余多少天时给出临期提醒 */
export const INSPECTION_WARNING_DAYS = 30;

export function todayStr(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return todayStr(d);
}

export function isInspectionExpired(tank: Tank, today: string): boolean {
  return tank.inspectionUntil < today;
}

export function isOilContaminated(tank: Tank): boolean {
  return tank.cleanliness === "oil-contaminated";
}

/** 准入规则：检验过期或油脂污染的气瓶只能送检 */
export function admissionBlockers(tank: Tank, today: string): string[] {
  const blockers: string[] = [];
  if (isInspectionExpired(tank, today)) blockers.push("检验有效期已过");
  if (isOilContaminated(tank)) blockers.push("油脂污染");
  return blockers;
}

export function inspectionDaysLeft(tank: Tank, today: string): number {
  const ms = Date.parse(`${tank.inspectionUntil}T00:00:00`) - Date.parse(`${today}T00:00:00`);
  return Math.round(ms / 86400000);
}

/** 复测偏差：实测氧/氦含量与静置压力对照目标值，超限即返工 */
export function checkDeviations(
  tank: Tank,
  o2: number,
  he: number,
  settledBar: number
): string[] {
  const devs: string[] = [];
  const dO2 = Math.abs(o2 - tank.targetO2);
  const dHe = Math.abs(he - tank.targetHe);
  const dBar = Math.abs(settledBar - tank.targetBar);
  if (dO2 > TOLERANCES.o2) devs.push(`氧含量偏差 ${dO2.toFixed(1)}%（限 ±${TOLERANCES.o2}%）`);
  if (dHe > TOLERANCES.he) devs.push(`氦含量偏差 ${dHe.toFixed(1)}%（限 ±${TOLERANCES.he}%）`);
  if (dBar > TOLERANCES.bar)
    devs.push(`静置压力偏差 ${dBar.toFixed(0)}bar（限 ±${TOLERANCES.bar}bar）`);
  return devs;
}

export function lastFill(tank: Tank): FillRecord | undefined {
  return tank.fills[tank.fills.length - 1];
}

export function validSignoff(tank: Tank): Signoff | undefined {
  return tank.signoffs.find((s) => s.valid);
}

/**
 * 气瓶状态推导：
 * 有效签收优先（交付冻结）；其次准入拦截；再看充填/返工/复核进度。
 */
export function deriveTankStatus(tank: Tank, today: string): TankStatus {
  if (validSignoff(tank)) return "delivered";
  if (admissionBlockers(tank, today).length > 0) return "pending-inspection";
  const lf = lastFill(tank);
  if (!lf) return "queued";
  if (lf.deviations.length > 0) return "rework";
  if (tank.reviewRequired) return "pending-review";
  return "awaiting-signoff";
}

export function groupMembers(state: AppState, groupId: string): Tank[] {
  return state.tanks.filter((t) => t.groupId === groupId);
}

/** 瓶组状态推导：同组目标压力不一致 → 整组拒绝 */
export function deriveGroupStatus(members: Tank[], today: string): GroupStatus {
  if (members.length === 0) return "filling";
  const targets = new Set(members.map((m) => m.targetBar));
  if (targets.size > 1) return "rejected";
  const statuses = members.map((m) => deriveTankStatus(m, today));
  if (statuses.every((s) => s === "delivered")) return "delivered";
  if (statuses.some((s) => s === "rework" || s === "pending-review")) return "rework";
  if (statuses.every((s) => s === "awaiting-signoff" || s === "delivered")) return "ready";
  return "filling";
}

export interface Gate {
  ok: boolean;
  reason?: string;
}

export function canRecordFill(tank: Tank, members: Tank[] | null, today: string): Gate {
  const status = deriveTankStatus(tank, today);
  if (status === "pending-inspection")
    return { ok: false, reason: "检验过期或油脂污染，只能送检" };
  if (status === "delivered") return { ok: false, reason: "已签收交付，充填记录已冻结" };
  if (status === "pending-review") return { ok: false, reason: "返工充填待另一人复核" };
  if (tank.groupId && members && deriveGroupStatus(members, today) === "rejected") {
    return { ok: false, reason: "同组目标压力不一致，整组拒绝充填" };
  }
  return { ok: true };
}

/** 返工复核：复核人必须与返工充填操作员不是同一人 */
export function canReview(tank: Tank, reviewer: string, today: string): Gate {
  if (deriveTankStatus(tank, today) !== "pending-review")
    return { ok: false, reason: "当前不在待复核状态" };
  if (!reviewer.trim()) return { ok: false, reason: "请填写复核人" };
  const lf = lastFill(tank);
  if (lf && lf.by.trim() === reviewer.trim())
    return { ok: false, reason: "复核人须与返工充填操作员不同" };
  return { ok: true };
}

export function canSignoff(tank: Tank, today: string): Gate {
  if (deriveTankStatus(tank, today) !== "awaiting-signoff")
    return { ok: false, reason: "仅复测合格且未签收的气瓶可签收" };
  return { ok: true };
}

export const TANK_STATUS_LABEL: Record<TankStatus, string> = {
  "pending-inspection": "待送检",
  queued: "待充填",
  rework: "返工中",
  "pending-review": "待复核",
  "awaiting-signoff": "待签收",
  delivered: "已签收",
};

export const GROUP_STATUS_LABEL: Record<GroupStatus, string> = {
  rejected: "整组拒绝",
  filling: "充填中",
  rework: "返工处理中",
  ready: "待交付",
  delivered: "已交付冻结",
};

export const CLEANLINESS_LABEL: Record<Cleanliness, string> = {
  "oxygen-clean": "氧清洁",
  standard: "常规清洁",
  "oil-contaminated": "油脂污染",
};
