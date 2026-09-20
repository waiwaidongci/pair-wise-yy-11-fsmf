import type { CleanlinessGrade, FillMethod } from "./types";

// 业务阈值集中存放（规则层配置）

export const TOLERANCE = {
  o2Pct: 1, // 实测氧含量偏差 ±1%
  hePct: 1, // 实测氦含量偏差 ±1%
  settleBar: 10, // 静置复测压力偏差 ±10 bar
};

// 清洁等级准入：
// A 氧清洁，可充任何混合气；B 普通清洁，仅可充空气/高氧，禁充 Trimix；
// C 油脂污染，只能送检
export const CLEANLINESS_ADMIT: Record<
  CleanlinessGrade,
  { label: string; admissible: boolean; methods: FillMethod[]; note: string }
> = {
  A: {
    label: "A 氧清洁",
    admissible: true,
    methods: ["空气充填", "高氧充填", "Trimix充填"],
    note: "可充空气 / 高氧 / Trimix",
  },
  B: {
    label: "B 普通清洁",
    admissible: true,
    methods: ["空气充填", "高氧充填"],
    note: "仅可充空气 / 高氧，禁充 Trimix",
  },
  C: {
    label: "C 油脂污染",
    admissible: false,
    methods: [],
    note: "油脂污染，只能送检",
  },
};

export const HYDRO_WARN_DAYS = 30; // 检验临期提醒窗口

export const PHASE_LABEL: Record<string, string> = {
  draft: "待充填",
  rejected: "整组拒绝",
  filling: "充填中",
  rework: "返工待复核",
  "awaiting-signoff": "待签收",
  signed: "已签收冻结",
  "voided-awaiting-signoff": "签收失效·待重签",
  admitted: "准入",
  inspection: "送检中",
  expired: "检验过期",
  contaminated: "油脂污染",
};

export const FILL_METHODS: FillMethod[] = ["空气充填", "高氧充填", "Trimix充填"];

export const STORAGE_KEY = "hxyfront-62010-fill-v2";
export const STORAGE_VERSION = 2;

// 已冻结后允许的“补录气源批次”重签次数上限仅做提示，不做硬限制
