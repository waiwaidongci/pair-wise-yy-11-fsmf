import type { CylinderSnapshot, GroupSnapshot } from "./types";

export interface Stats {
  queueCount: number; // 待充填（draft + voided-awaiting-signoff）
  fillingCount: number; // 充填中 + 返工待复核
  blockedCount: number; // 不可准入气瓶（过期 / 污染 / 送检中）
  warnCount: number; // 30 天内临期
  avgO2: number | null; // 最近有效充填的平均实测氧含量
  signedCount: number; // 累计签收单（含已失效，历史保留）
  activeSignoffCount: number; // 当前有效签收单
  rejectedCount: number; // 整组拒绝次数
  reworkCount: number; // 返工次数
}

import { hydroStatus } from "./rules";

export function computeStats(
  cylinders: CylinderSnapshot[],
  groups: GroupSnapshot[],
  now: Date = new Date()
): Stats {
  let blocked = 0;
  let warn = 0;
  for (const c of cylinders) {
    if (!c.admitted) blocked++;
    else if (hydroStatus(c.hydroValidUntil, now).warn) warn++;
  }

  const fills = groups
    .map((g) => g.latestFill)
    .filter((f): f is NonNullable<GroupSnapshot["latestFill"]> => !!f);
  const avgO2 =
    fills.length > 0
      ? fills.reduce((s, f) => s + f.measuredO2, 0) / fills.length
      : null;

  return {
    queueCount: groups.filter(
      (g) => g.phase === "draft" || g.phase === "voided-awaiting-signoff"
    ).length,
    fillingCount: groups.filter(
      (g) => g.phase === "filling" || g.phase === "rework"
    ).length,
    blockedCount: blocked,
    warnCount: warn,
    avgO2,
    signedCount: groups.reduce((s, g) => s + g.signoffHistory.length, 0),
    activeSignoffCount: groups.filter(
      (g) => g.phase === "signed"
    ).length,
    rejectedCount: groups.filter((g) => !!g.rejectReason).length,
    reworkCount: groups.filter((g) => (g.reworkReasons?.length ?? 0) > 0).length,
  };
}
