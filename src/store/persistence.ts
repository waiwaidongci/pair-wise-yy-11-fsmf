import { addDays, todayStr } from "../domain/rules";
import type { AppState, DomainEvent, FillGroup, Tank } from "../domain/types";

const STORAGE_KEY = "hxyfront-62010.fillclosure.v1";

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      if (parsed && Array.isArray(parsed.tanks) && Array.isArray(parsed.events)) return parsed;
    }
  } catch {
    // 存储不可用时回退到演示数据
  }
  return seedState(new Date());
}

export function saveState(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 忽略写入失败（如隐私模式）
  }
}

export function resetState(): AppState {
  const state = seedState(new Date());
  saveState(state);
  return state;
}

function seedState(now: Date): AppState {
  const today = todayStr(now);
  const d = (n: number) => addDays(today, n);
  const ts = (hoursOffset: number) => new Date(now.getTime() + hoursOffset * 3600000).toISOString();

  const groups: FillGroup[] = [
    { id: "grp-a", name: "瓶组A · 空气 200bar", createdAt: ts(-72) },
    { id: "grp-b", name: "瓶组B · 高氧", createdAt: ts(-48) },
    { id: "grp-c", name: "瓶组C · Trimix", createdAt: ts(-24) },
  ];

  const tanks: Tank[] = [
    {
      id: "tank-101",
      serial: "TANK-101",
      volumeL: 12,
      inspectionUntil: d(320),
      cleanliness: "oxygen-clean",
      residualBar: 30,
      targetBar: 200,
      targetO2: 21,
      targetHe: 0,
      fillMethod: "空气",
      operator: "张涛",
      groupId: "grp-a",
      fills: [{ o2: 20.8, he: 0, settledBar: 202, at: ts(-55), by: "张涛", deviations: [] }],
      reviewRequired: false,
      reviews: [],
      signoffs: [
        {
          id: "so-101a",
          customer: "蓝海潜水俱乐部",
          by: "前台·小周",
          at: ts(-50),
          valid: false,
          invalidatedAt: ts(-40),
          invalidateReason: "更换阀门",
        },
        { id: "so-101b", customer: "蓝海潜水俱乐部", by: "前台·小周", at: ts(-30), valid: true },
      ],
      valveChanges: [{ id: "vc-101", at: ts(-40), by: "赵工", note: "更换K阀，复测合格" }],
      gasBatches: [{ id: "gb-101", batchNo: "AIR-2026-0911", at: ts(-55), by: "张涛" }],
      createdAt: ts(-70),
    },
    {
      id: "tank-102",
      serial: "TANK-102",
      volumeL: 12,
      inspectionUntil: d(300),
      cleanliness: "oxygen-clean",
      residualBar: 25,
      targetBar: 200,
      targetO2: 21,
      targetHe: 0,
      fillMethod: "空气",
      operator: "张涛",
      groupId: "grp-a",
      fills: [{ o2: 21.1, he: 0, settledBar: 198, at: ts(-54), by: "张涛", deviations: [] }],
      reviewRequired: false,
      reviews: [],
      signoffs: [
        { id: "so-102a", customer: "蓝海潜水俱乐部", by: "前台·小周", at: ts(-28), valid: true },
      ],
      valveChanges: [],
      gasBatches: [{ id: "gb-102", batchNo: "AIR-2026-0911", at: ts(-54), by: "张涛" }],
      createdAt: ts(-69),
    },
    {
      id: "tank-204",
      serial: "TANK-204",
      volumeL: 11,
      inspectionUntil: d(180),
      cleanliness: "standard",
      residualBar: 55,
      targetBar: 200,
      targetO2: 32,
      targetHe: 0,
      fillMethod: "高氧",
      operator: "李敏",
      groupId: "grp-b",
      fills: [],
      reviewRequired: false,
      reviews: [],
      signoffs: [],
      valveChanges: [],
      gasBatches: [],
      createdAt: ts(-48),
    },
    {
      id: "tank-219",
      serial: "TANK-219",
      volumeL: 11,
      inspectionUntil: d(90),
      cleanliness: "standard",
      residualBar: 40,
      targetBar: 220,
      targetO2: 32,
      targetHe: 0,
      fillMethod: "高氧",
      operator: "李敏",
      groupId: "grp-b",
      fills: [],
      reviewRequired: false,
      reviews: [],
      signoffs: [],
      valveChanges: [],
      gasBatches: [],
      createdAt: ts(-47),
    },
    {
      id: "tank-231",
      serial: "TANK-231",
      volumeL: 24,
      inspectionUntil: d(12),
      cleanliness: "oxygen-clean",
      residualBar: 60,
      targetBar: 200,
      targetO2: 21,
      targetHe: 35,
      fillMethod: "Trimix",
      operator: "王强",
      groupId: "grp-c",
      fills: [],
      reviewRequired: false,
      reviews: [],
      signoffs: [],
      valveChanges: [],
      gasBatches: [],
      createdAt: ts(-24),
    },
    {
      id: "tank-260",
      serial: "TANK-260",
      volumeL: 12,
      inspectionUntil: d(260),
      cleanliness: "oxygen-clean",
      residualBar: 35,
      targetBar: 200,
      targetO2: 36,
      targetHe: 0,
      fillMethod: "高氧",
      operator: "王强",
      groupId: null,
      fills: [
        {
          o2: 38.6,
          he: 0,
          settledBar: 200,
          at: ts(-6),
          by: "王强",
          deviations: ["氧含量偏差 2.6%（限 ±1%）"],
        },
      ],
      reviewRequired: false,
      reviews: [],
      signoffs: [],
      valveChanges: [],
      gasBatches: [],
      createdAt: ts(-10),
    },
    {
      id: "tank-277",
      serial: "TANK-277",
      volumeL: 12,
      inspectionUntil: d(210),
      cleanliness: "oxygen-clean",
      residualBar: 45,
      targetBar: 210,
      targetO2: 18,
      targetHe: 45,
      fillMethod: "Trimix",
      operator: "李敏",
      groupId: null,
      fills: [
        {
          o2: 18.4,
          he: 39.5,
          settledBar: 210,
          at: ts(-20),
          by: "李敏",
          deviations: ["氦含量偏差 5.5%（限 ±2%）"],
        },
        { o2: 18.1, he: 44.3, settledBar: 208, at: ts(-4), by: "李敏", deviations: [] },
      ],
      reviewRequired: true,
      reviews: [],
      signoffs: [],
      valveChanges: [],
      gasBatches: [],
      createdAt: ts(-22),
    },
    {
      id: "tank-305",
      serial: "TANK-305",
      volumeL: 12,
      inspectionUntil: d(-6),
      cleanliness: "standard",
      residualBar: 15,
      targetBar: 200,
      targetO2: 21,
      targetHe: 0,
      fillMethod: "空气",
      operator: "张涛",
      groupId: null,
      fills: [],
      reviewRequired: false,
      reviews: [],
      signoffs: [],
      valveChanges: [],
      gasBatches: [],
      createdAt: ts(-40),
    },
    {
      id: "tank-318",
      serial: "TANK-318",
      volumeL: 11,
      inspectionUntil: d(200),
      cleanliness: "oil-contaminated",
      residualBar: 60,
      targetBar: 200,
      targetO2: 32,
      targetHe: 0,
      fillMethod: "高氧",
      operator: "李敏",
      groupId: null,
      fills: [],
      reviewRequired: false,
      reviews: [],
      signoffs: [],
      valveChanges: [],
      gasBatches: [],
      createdAt: ts(-8),
    },
  ];

  const events: DomainEvent[] = [
    { id: "ev-01", at: ts(-70), type: "tank.registered", message: "TANK-101 登记准入（空气，目标 200bar），加入瓶组A", tankId: "tank-101", groupId: "grp-a" },
    { id: "ev-02", at: ts(-69), type: "tank.registered", message: "TANK-102 登记准入（空气，目标 200bar），加入瓶组A", tankId: "tank-102", groupId: "grp-a" },
    { id: "ev-03", at: ts(-55), type: "fill.recorded", message: "TANK-101 充填复测合格（氧 20.8%、氦 0%、静置 202bar）", tankId: "tank-101", groupId: "grp-a" },
    { id: "ev-04", at: ts(-54), type: "fill.recorded", message: "TANK-102 充填复测合格（氧 21.1%、氦 0%、静置 198bar）", tankId: "tank-102", groupId: "grp-a" },
    { id: "ev-05", at: ts(-50), type: "signoff.created", message: "TANK-101 签收交付（客户 蓝海潜水俱乐部），交付冻结生效", tankId: "tank-101", groupId: "grp-a" },
    { id: "ev-06", at: ts(-48), type: "tank.registered", message: "TANK-204 登记准入（高氧，目标 200bar），加入瓶组B", tankId: "tank-204", groupId: "grp-b" },
    { id: "ev-07", at: ts(-47), type: "tank.registered", message: "TANK-219 登记准入（高氧，目标 220bar），加入瓶组B", tankId: "tank-219", groupId: "grp-b" },
    { id: "ev-08", at: ts(-47), type: "group.rejected", message: "瓶组B · 高氧 同组目标压力不一致（TANK-204:200bar、TANK-219:220bar），整组拒绝", groupId: "grp-b" },
    { id: "ev-09", at: ts(-40), type: "valve.replaced", message: "TANK-101 更换阀门（经办 赵工）", tankId: "tank-101", groupId: "grp-a" },
    { id: "ev-10", at: ts(-40), type: "signoff.invalidated", message: "TANK-101 原签收立即失效（更换阀门），重算瓶组状态，历史保留", tankId: "tank-101", groupId: "grp-a" },
    { id: "ev-11", at: ts(-30), type: "signoff.created", message: "TANK-101 重新签收（客户 蓝海潜水俱乐部），交付冻结生效", tankId: "tank-101", groupId: "grp-a" },
    { id: "ev-12", at: ts(-28), type: "signoff.created", message: "TANK-102 签收交付（客户 蓝海潜水俱乐部），瓶组A 全组交付冻结", tankId: "tank-102", groupId: "grp-a" },
    { id: "ev-13", at: ts(-24), type: "tank.registered", message: "TANK-231 登记准入（Trimix，目标 200bar），加入瓶组C；检验期剩余 12 天，注意临期", tankId: "tank-231", groupId: "grp-c" },
    { id: "ev-14", at: ts(-20), type: "fill.rework", message: "TANK-277 复测偏差超限（氦含量偏差 5.5%（限 ±2%）），进入返工", tankId: "tank-277" },
    { id: "ev-15", at: ts(-8), type: "tank.registered", message: "TANK-318 登记准入（高氧，目标 200bar）", tankId: "tank-318" },
    { id: "ev-16", at: ts(-8), type: "tank.admission-blocked", message: "TANK-318 准入拦截：油脂污染，只能送检", tankId: "tank-318" },
    { id: "ev-17", at: ts(-6), type: "fill.rework", message: "TANK-260 复测偏差超限（氧含量偏差 2.6%（限 ±1%）），进入返工", tankId: "tank-260" },
    { id: "ev-18", at: ts(-4), type: "fill.recorded", message: "TANK-277 返工充填复测合格（氧 18.1%、氦 44.3%、静置 208bar），待另一人复核", tankId: "tank-277" },
  ];

  return { tanks, groups, events };
}
