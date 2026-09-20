import type { Store } from "./store";
import type { CylinderEvent, GroupEvent } from "./types";

// 演示数据：以事件形式写入，与真实操作走同一条追加路径

function isoDays(offsetDays: number, hour = 9): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

function isoHoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

interface SeedCylinder {
  id: string;
  events: CylinderEvent[];
}

interface SeedGroup {
  id: string;
  events: GroupEvent[];
}

const cylinders: SeedCylinder[] = [
  {
    id: "TANK-204",
    events: [
      {
        type: "cylinder-registered",
        at: isoDays(-120),
        id: "TANK-204",
        volumeL: 12,
        material: "12L 铝瓶",
        hydroValidUntil: isoDays(200).slice(0, 10),
        cleanliness: "B",
      },
    ],
  },
  {
    id: "TANK-219",
    events: [
      {
        type: "cylinder-registered",
        at: isoDays(-200),
        id: "TANK-219",
        volumeL: 11,
        material: "11L 钢瓶",
        hydroValidUntil: isoDays(120).slice(0, 10),
        cleanliness: "A",
      },
    ],
  },
  {
    id: "TANK-231",
    events: [
      {
        type: "cylinder-registered",
        at: isoDays(-300),
        id: "TANK-231",
        volumeL: 24,
        material: "双瓶组 2×12L",
        hydroValidUntil: isoDays(12).slice(0, 10),
        cleanliness: "A",
      },
    ],
  },
  {
    id: "TANK-188",
    events: [
      {
        type: "cylinder-registered",
        at: isoDays(-400, 10),
        id: "TANK-188",
        volumeL: 12,
        material: "12L 钢瓶",
        hydroValidUntil: isoDays(-5).slice(0, 10),
        cleanliness: "B",
      },
      {
        type: "cylinder-sent-for-inspection",
        at: isoDays(-2, 14),
        id: "TANK-188",
        reason: "hydro-expired",
        operator: "周倩",
      },
    ],
  },
  {
    id: "TANK-177",
    events: [
      {
        type: "cylinder-registered",
        at: isoDays(-250),
        id: "TANK-177",
        volumeL: 8,
        material: "8L 铝瓶",
        hydroValidUntil: isoDays(160).slice(0, 10),
        cleanliness: "C",
      },
    ],
  },
];

const groups: SeedGroup[] = [
  {
    // 已签收 → 补录气源批次 → 待重新签收（演示冻结闭环失效重算）
    id: "GRP-1001",
    events: [
      {
        type: "group-created",
        at: isoDays(-2, 8),
        groupId: "GRP-1001",
        cylinderIds: ["TANK-219"],
        targetBar: 200,
        targetO2: 32,
        targetHe: 0,
        method: "高氧充填",
        residualBar: { "TANK-219": 40 },
        operator: "李航",
      },
      { type: "fill-started", at: isoDays(-2, 9), groupId: "GRP-1001", operator: "李航" },
      {
        type: "fill-recorded",
        at: isoDays(-2, 10),
        groupId: "GRP-1001",
        measuredO2: 32.4,
        measuredHe: 0,
        settleBar: 198,
        operator: "李航",
      },
      {
        type: "delivered-signed",
        at: isoDays(-1, 15),
        groupId: "GRP-1001",
        receiver: "陈教练",
        operator: "李航",
      },
      {
        type: "delivery-voided",
        at: isoHoursAgo(5),
        groupId: "GRP-1001",
        reason: "source-batch-backfilled",
        sourceBatch: "AIR-B20260919-07",
        operator: "周倩",
      },
    ],
  },
  {
    // 返工待复核：实测偏差超限
    id: "GRP-1002",
    events: [
      {
        type: "group-created",
        at: isoHoursAgo(26),
        groupId: "GRP-1002",
        cylinderIds: ["TANK-231"],
        targetBar: 230,
        targetO2: 18,
        targetHe: 45,
        method: "Trimix充填",
        residualBar: { "TANK-231": 30 },
        operator: "李航",
      },
      { type: "fill-started", at: isoHoursAgo(24), groupId: "GRP-1002", operator: "李航" },
      {
        type: "fill-recorded",
        at: isoHoursAgo(20),
        groupId: "GRP-1002",
        measuredO2: 20.6,
        measuredHe: 44.5,
        settleBar: 228,
        operator: "李航",
      },
      {
        type: "rework-opened",
        at: isoHoursAgo(20),
        groupId: "GRP-1002",
        reasons: ["氧含量偏差 +2.6%（限值 ±1%）"],
        fromFillOperator: "李航",
      },
    ],
  },
  {
    // 待充填队列
    id: "GRP-1003",
    events: [
      {
        type: "group-created",
        at: isoHoursAgo(3),
        groupId: "GRP-1003",
        cylinderIds: ["TANK-204"],
        targetBar: 200,
        targetO2: 21,
        targetHe: 0,
        method: "空气充填",
        residualBar: { "TANK-204": 55 },
        operator: "周倩",
      },
    ],
  },
  {
    // 整组拒绝：目标压力不一致（历史保留）
    id: "GRP-0998",
    events: [
      {
        type: "group-created",
        at: isoDays(-3, 11),
        groupId: "GRP-0998",
        cylinderIds: ["TANK-204", "TANK-219"],
        targetBar: 200,
        targetO2: 32,
        targetHe: 0,
        method: "高氧充填",
        residualBar: { "TANK-204": 60, "TANK-219": 45 },
        operator: "周倩",
      },
      {
        type: "group-rejected",
        at: isoDays(-3, 11),
        groupId: "GRP-0998",
        reason: "target-pressure-mismatch",
        detail: "同组目标压力不一致：TANK-204=200bar，TANK-219=180bar",
        operator: "周倩",
      },
    ],
  },
];

export function seedStoreIfEmpty(store: Store): boolean {
  const state = store.getState();
  if (Object.keys(state.cylinders).length > 0 || Object.keys(state.groups).length > 0) {
    return false;
  }
  for (const c of cylinders) {
    for (const e of c.events) store.appendCylinder(c.id, e);
  }
  for (const g of groups) {
    for (const e of g.events) store.appendGroup(g.id, e);
  }
  return true;
}
