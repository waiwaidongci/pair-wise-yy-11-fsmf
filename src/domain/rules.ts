import { CLEANLINESS_ADMIT, HYDRO_WARN_DAYS, TOLERANCE } from "./constants";
import type {
  CylinderEvent,
  CylinderPhase,
  CylinderSnapshot,
  FillMethod,
  FillResult,
  GroupEvent,
  GroupPhase,
  GroupSnapshot,
  RuleViolation,
  SignoffInfo,
} from "./types";

// ---------- 日期 / 准入 ----------

export function daysUntil(isoDate: string, now: Date = new Date()): number {
  const end = new Date(isoDate + "T23:59:59");
  return Math.ceil((end.getTime() - now.getTime()) / 86_400_000);
}

export function hydroStatus(
  validUntil: string,
  now: Date = new Date()
): { expired: boolean; daysLeft: number; warn: boolean } {
  const daysLeft = daysUntil(validUntil, now);
  return { expired: daysLeft < 0, daysLeft, warn: daysLeft <= HYDRO_WARN_DAYS };
}

interface CylinderFold {
  id: string;
  volumeL: number;
  material: string;
  hydroValidUntil: string;
  cleanliness: CylinderSnapshot["cleanliness"];
  inspectionIn: boolean;
  events: CylinderEvent[];
}

export function foldCylinder(
  id: string,
  events: CylinderEvent[]
): CylinderFold | null {
  return events.reduce<CylinderFold | null>((acc, e) => {
    if (e.type === "cylinder-registered") {
      return {
        id: e.id,
        volumeL: e.volumeL,
        material: e.material,
        hydroValidUntil: e.hydroValidUntil,
        cleanliness: e.cleanliness,
        inspectionIn: false,
        events: [...(acc?.events ?? []), e],
      };
    }
    if (!acc) return acc;
    if (e.type === "cylinder-sent-for-inspection") {
      return { ...acc, inspectionIn: true, events: [...acc.events, e] };
    }
    if (e.type === "cylinder-inspected") {
      return {
        ...acc,
        inspectionIn: false,
        hydroValidUntil: e.newValidUntil,
        cleanliness: e.cleanliness,
        events: [...acc.events, e],
      };
    }
    return { ...acc, events: [...acc.events, e] };
  }, null);
}

export function deriveCylinder(
  id: string,
  events: CylinderEvent[],
  busy = false,
  now: Date = new Date()
): CylinderSnapshot | null {
  const fold = foldCylinder(id, events);
  if (!fold) return null;

  let phase: CylinderPhase;
  let admissionReason: string | undefined;
  if (fold.inspectionIn) {
    phase = "inspection";
    admissionReason = "气瓶送检中，检验合格后方可充填";
  } else if (fold.cleanliness === "C") {
    phase = "contaminated";
    admissionReason = "油脂污染（C 级），只能送检";
  } else if (hydroStatus(fold.hydroValidUntil, now).expired) {
    phase = "expired";
    admissionReason = "检验已过期，只能送检";
  } else {
    phase = "admitted";
  }

  return {
    id: fold.id,
    volumeL: fold.volumeL,
    material: fold.material,
    hydroValidUntil: fold.hydroValidUntil,
    cleanliness: fold.cleanliness,
    phase,
    admitted: phase === "admitted",
    admissionReason,
    inspectionIn: fold.inspectionIn,
    busy,
    events: fold.events,
  };
}

/** 清洁等级是否允许该充填方式（B 级禁充 Trimix） */
export function methodAllowed(
  cleanliness: CylinderSnapshot["cleanliness"],
  method: FillMethod
): boolean {
  return CLEANLINESS_ADMIT[cleanliness].methods.includes(method);
}

// ---------- 配比偏差判定 ----------

export function evaluateFill(
  target: { o2: number; he: number; bar: number },
  measured: { o2: number; he: number; bar: number }
): { passed: boolean; deviations: string[] } {
  const deviations: string[] = [];
  if (Math.abs(measured.o2 - target.o2) > TOLERANCE.o2Pct) {
    deviations.push(
      `氧含量偏差 ${signed(measured.o2 - target.o2)}%（限值 ±${TOLERANCE.o2Pct}%）`
    );
  }
  if (Math.abs(measured.he - target.he) > TOLERANCE.hePct) {
    deviations.push(
      `氦含量偏差 ${signed(measured.he - target.he)}%（限值 ±${TOLERANCE.hePct}%）`
    );
  }
  if (Math.abs(measured.bar - target.bar) > TOLERANCE.settleBar) {
    deviations.push(
      `静置压力偏差 ${signed(measured.bar - target.bar)}bar（限值 ±${TOLERANCE.settleBar}bar）`
    );
  }
  return { passed: deviations.length === 0, deviations };
}

function signed(n: number): string {
  return (n >= 0 ? "+" : "") + n.toFixed(1).replace(/\.0$/, "");
}

// ---------- 瓶组状态机（事件折叠） ----------

interface GroupFold {
  phase: GroupPhase;
  cylinderIds: string[];
  targetBar: number;
  targetO2: number;
  targetHe: number;
  method: FillMethod;
  residualBar: Record<string, number>;
  operator: string;
  createdAt: string;
  rejectReason?: string;
  rejectDetail?: string;
  fillStartedAt?: string;
  latestFill?: FillResult;
  reworkReasons?: string[];
  reworkReviews: GroupSnapshot["reworkReviews"];
  currentSignoff?: SignoffInfo;
  signoffHistory: SignoffInfo[];
  voidEvents: GroupSnapshot["voidEvents"];
}

export function deriveGroup(events: GroupEvent[]): GroupSnapshot | null {
  if (events.length === 0) return null;
  let f: GroupFold | null = null;

  for (const e of events) {
    switch (e.type) {
      case "group-created":
        f = {
          phase: "draft",
          cylinderIds: [...e.cylinderIds],
          targetBar: e.targetBar,
          targetO2: e.targetO2,
          targetHe: e.targetHe,
          method: e.method,
          residualBar: { ...e.residualBar },
          operator: e.operator,
          createdAt: e.at,
          reworkReviews: [],
          signoffHistory: [],
          voidEvents: [],
        };
        break;
      case "group-rejected":
        if (f) {
          f.phase = "rejected";
          f.rejectReason = e.reason;
          f.rejectDetail = e.detail;
        }
        break;
      case "group-revised":
        if (f) {
          f.phase = "draft";
          f.targetBar = e.targetBar;
          f.targetO2 = e.targetO2;
          f.targetHe = e.targetHe;
          f.method = e.method;
          f.rejectReason = undefined;
          f.rejectDetail = undefined;
        }
        break;
      case "fill-started":
        if (f) {
          f.phase = "filling";
          f.fillStartedAt = e.at;
          f.latestFill = undefined;
          f.reworkReasons = undefined;
          f.reworkReviews = [];
        }
        break;
      case "fill-recorded":
        if (f) {
          const r = evaluateFill(
            { o2: f.targetO2, he: f.targetHe, bar: f.targetBar },
            { o2: e.measuredO2, he: e.measuredHe, bar: e.settleBar }
          );
          f.latestFill = {
            measuredO2: e.measuredO2,
            measuredHe: e.measuredHe,
            settleBar: e.settleBar,
            at: e.at,
            operator: e.operator,
            passed: r.passed,
            deviations: r.deviations,
          };
          f.phase = "awaiting-signoff";
        }
        break;
      case "rework-opened":
        if (f) {
          f.phase = "rework";
          f.reworkReasons = e.reasons;
        }
        break;
      case "rework-reviewed":
        if (f) {
          f.reworkReviews = [...f.reworkReviews, e];
          if (e.passed) f.phase = "awaiting-signoff";
        }
        break;
      case "delivered-signed":
        if (f) {
          const signoff: SignoffInfo = {
            at: e.at,
            receiver: e.receiver,
            operator: e.operator,
            voided: false,
          };
          f.currentSignoff = signoff;
          f.signoffHistory = [...f.signoffHistory, signoff];
          f.phase = "signed";
        }
        break;
      case "delivery-voided": {
        if (!f) break;
        f.voidEvents = [...f.voidEvents, e];
        if (f.currentSignoff) {
          const voided: SignoffInfo = {
            ...f.currentSignoff,
            voided: true,
            voidReason: e.reason,
            voidAt: e.at,
          };
          f.currentSignoff = voided;
          f.signoffHistory = [
            ...f.signoffHistory.slice(0, -1),
            voided,
          ];
        }
        if (e.reason === "valve-replaced") {
          // 换阀后整瓶需重新充填：清空本轮参数，回到待充填
          f.phase = "draft";
          f.latestFill = undefined;
          f.reworkReasons = undefined;
          f.reworkReviews = [];
          f.fillStartedAt = undefined;
        } else {
          // 补录气源批次：参数仍有效，重算为待重新签收
          f.phase = "voided-awaiting-signoff";
        }
        break;
      }
    }
  }

  if (!f) return null;
  return {
    groupId: events[0].groupId,
    phase: f.phase,
    cylinderIds: f.cylinderIds,
    targetBar: f.targetBar,
    targetO2: f.targetO2,
    targetHe: f.targetHe,
    method: f.method,
    residualBar: f.residualBar,
    operator: f.operator,
    createdAt: f.createdAt,
    rejectReason: f.rejectReason,
    rejectDetail: f.rejectDetail,
    fillStartedAt: f.fillStartedAt,
    latestFill: f.latestFill,
    reworkReasons: f.reworkReasons,
    reworkReviews: f.reworkReviews,
    currentSignoff: f.currentSignoff,
    signoffHistory: f.signoffHistory,
    voidEvents: f.voidEvents,
    events,
  };
}

// 占用气瓶的瓶组阶段（未关闭闭环）；rejected 为终态，气瓶可重新入组
const BUSY_PHASES: GroupPhase[] = [
  "draft",
  "filling",
  "rework",
  "awaiting-signoff",
  "voided-awaiting-signoff",
];

export function isBusyPhase(phase: GroupPhase): boolean {
  return BUSY_PHASES.includes(phase);
}

// ---------- 指令校验（规则层，不产生副作用） ----------

export interface CreateGroupInput {
  cylinderIds: string[];
  lines: { id: string; targetBar: number; residualBar: number }[];
  targetO2: number;
  targetHe: number;
  method: FillMethod;
  operator: string;
}

/**
 * 建组闸门：
 * 1) 同组目标压力不同 → 整组拒绝（target-pressure-mismatch）
 * 2) 存在过期 / 油脂污染 / 送检中 / 清洁等级与充填方式不符 → 整组拒绝
 * 返回要追加的事件序列（created + 可选 rejected），或 RuleViolation（硬性非法输入）
 */
export function planCreateGroup(
  input: CreateGroupInput,
  cylinders: Record<string, CylinderSnapshot>,
  now: Date = new Date()
): { events: GroupEvent[]; violations: RuleViolation[] } {
  const violations: RuleViolation[] = [];
  const { lines, targetO2, targetHe, method, operator } = input;

  if (lines.length === 0) violations.push({ code: "empty", message: "至少选择一个气瓶" });
  const ids = lines.map((l) => l.id);
  if (new Set(ids).size !== ids.length)
    violations.push({ code: "duplicate", message: "同一气瓶不能在瓶组内重复" });
  for (const l of lines) {
    if (!cylinders[l.id])
      violations.push({ code: "no-cylinder", message: `气瓶 ${l.id} 不存在` });
    if (!(l.targetBar > 0))
      violations.push({ code: "bad-target", message: `气瓶 ${l.id} 目标压力无效` });
    if (l.residualBar < 0 || l.residualBar > l.targetBar)
      violations.push({
        code: "bad-residual",
        message: `气瓶 ${l.id} 残压需在 0 至目标压力之间`,
      });
  }
  if (targetO2 < 1 || targetO2 > 100)
    violations.push({ code: "bad-o2", message: "目标氧含量需在 1–100% 之间" });
  if (targetHe < 0 || targetHe + targetO2 > 100)
    violations.push({ code: "bad-he", message: "目标氦含量无效，氧氦之和不可超过 100%" });
  if (!operator.trim())
    violations.push({ code: "no-operator", message: "必须填写操作员" });

  const pressureMismatch =
    new Set(lines.map((l) => l.targetBar)).size > 1;
  const admissionFailures: string[] = [];
  for (const l of lines) {
    const c = cylinders[l.id];
    if (!c) continue;
    if (c.busy)
      violations.push({
        code: "busy",
        message: `气瓶 ${l.id} 已在未关闭瓶组中，不能重复入组`,
      });
    if (!c.admitted) admissionFailures.push(`${l.id}：${c.admissionReason}`);
    else if (!methodAllowed(c.cleanliness, method))
      admissionFailures.push(
        `${l.id}：${CLEANLINESS_ADMIT[c.cleanliness].label}，${CLEANLINESS_ADMIT[c.cleanliness].note}`
      );
  }

  if (violations.length > 0) return { events: [], violations };

  const groupId = `GRP-${String(Date.now()).slice(-8)}`;
  const at = now.toISOString();
  const residualBar: Record<string, number> = {};
  for (const l of lines) residualBar[l.id] = l.residualBar;

  const created: GroupEvent = {
    type: "group-created",
    at,
    groupId,
    cylinderIds: ids,
    targetBar: lines[0].targetBar,
    targetO2,
    targetHe,
    method,
    residualBar,
    operator,
  };

  if (admissionFailures.length > 0) {
    return {
      events: [
        created,
        {
          type: "group-rejected",
          at,
          groupId,
          reason: "cylinders-not-admitted",
          detail: admissionFailures.join("；"),
          operator,
        },
      ],
      violations: [],
    };
  }
  if (pressureMismatch) {
    return {
      events: [
        created,
        {
          type: "group-rejected",
          at,
          groupId,
          reason: "target-pressure-mismatch",
          detail:
            "同组目标压力不一致：" +
            lines.map((l) => `${l.id}=${l.targetBar}bar`).join("，"),
          operator,
        },
      ],
      violations: [],
    };
  }
  return { events: [created], violations: [] };
}

/** 开始充填前的二次闸门（临期过期等情况在此拦截） */
export function checkStartFill(
  group: GroupSnapshot,
  cylinders: Record<string, CylinderSnapshot>
): { ok: boolean; detail?: string } {
  const failures: string[] = [];
  for (const id of group.cylinderIds) {
    const c = cylinders[id];
    if (!c) {
      failures.push(`${id}：气瓶档案缺失`);
      continue;
    }
    if (!c.admitted) failures.push(`${id}：${c.admissionReason}`);
    else if (!methodAllowed(c.cleanliness, group.method))
      failures.push(`${id}：清洁等级 ${c.cleanliness} 不允许${group.method}`);
  }
  return failures.length === 0
    ? { ok: true }
    : { ok: false, detail: failures.join("；") };
}

/** 返工复核：复核人必须与充填操作员不同 */
export function checkReviewer(
  group: GroupSnapshot,
  reviewer: string
): RuleViolation | null {
  const fillOperator = group.latestFill?.operator ?? group.operator;
  if (!reviewer.trim())
    return { code: "no-reviewer", message: "必须填写复核人" };
  if (reviewer.trim() === fillOperator)
    return {
      code: "self-review",
      message: `返工须另一人复核：复核人不能与充填操作员（${fillOperator}）为同一人`,
    };
  return null;
}

// ---------- 混合气配比提示 ----------

export interface MixHint {
  label: string;
  mod: number | null; // 按 PO2 1.4 计算的最大氧分压深度
  endHe?: number;
}

export function mixHint(o2: number, he: number): MixHint {
  if (he > 0) {
    return {
      label: `Trimix ${Math.round(o2)}/${Math.round(he)}`,
      mod: modMeters(o2),
      endHe: he,
    };
  }
  if (o2 >= 22) {
    return { label: `高氧 EAN${Math.round(o2)}`, mod: modMeters(o2) };
  }
  return { label: "空气 21/0", mod: modMeters(21) };
}

function modMeters(o2Pct: number): number {
  // 以最大氧分压 PO2 = 1.4bar 估算 MOD（米，海水近似 10m/atm）
  return Math.round((1.4 / (o2Pct / 100) - 1) * 10);
}
