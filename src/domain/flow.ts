// 应用服务层：编排“规则（纯函数）”与“存储（事件追加）”，
// 界面只调用这里的动作，不直接操作 store。

import {
  checkReviewer,
  deriveCylinder,
  deriveGroup,
  evaluateFill,
  isBusyPhase,
} from "./rules";
import type { Store } from "./store";
import type {
  CleanlinessGrade,
  CylinderSnapshot,
  FillMethod,
  GroupEvent,
  GroupSnapshot,
  RuleViolation,
} from "./types";

export interface ActionResult {
  ok: boolean;
  violations: RuleViolation[];
  groupId?: string;
  message?: string;
}

function fail(violations: RuleViolation[]): ActionResult {
  return { ok: false, violations };
}

export function registerCylinder(
  store: Store,
  input: {
    id: string;
    volumeL: number;
    material: string;
    hydroValidUntil: string;
    cleanliness: CleanlinessGrade;
    note?: string;
  }
): ActionResult {
  const violations: RuleViolation[] = [];
  const id = input.id.trim().toUpperCase();
  if (!id) violations.push({ code: "no-id", message: "请填写气瓶编号" });
  if (!(input.volumeL > 0))
    violations.push({ code: "bad-volume", message: "容积需大于 0 升" });
  if (!input.hydroValidUntil)
    violations.push({ code: "no-hydro", message: "请选择检验有效期" });
  if (!input.material.trim())
    violations.push({ code: "no-material", message: "请填写瓶体规格" });
  if (store.getState().cylinders[id])
    violations.push({ code: "exists", message: `气瓶 ${id} 已存在档案` });
  if (violations.length) return fail(violations);

  store.appendCylinder(id, {
    type: "cylinder-registered",
    at: new Date().toISOString(),
    id,
    volumeL: input.volumeL,
    material: input.material.trim(),
    hydroValidUntil: input.hydroValidUntil,
    cleanliness: input.cleanliness,
    note: input.note?.trim() || undefined,
  });
  return { ok: true, violations: [], message: `气瓶 ${id} 档案已建立` };
}

export function sendForInspection(
  store: Store,
  id: string,
  operator: string
): ActionResult {
  const c = snapshotOf(store, id);
  if (!c) return fail([{ code: "missing", message: "气瓶不存在" }]);
  if (c.inspectionIn)
    return fail([{ code: "in-inspection", message: "该气瓶已在送检中" }]);
  if (c.busy)
    return fail([
      {
        code: "busy",
        message: `气瓶 ${id} 在未关闭瓶组中，请先处理瓶组后再送检`,
      },
    ]);
  if (!operator.trim())
    return fail([{ code: "no-operator", message: "必须填写操作员" }]);

  const reason =
    c.cleanliness === "C" ? "oil-contaminated" : "hydro-expired";
  store.appendCylinder(id, {
    type: "cylinder-sent-for-inspection",
    at: new Date().toISOString(),
    id,
    reason,
    operator: operator.trim(),
  });
  return { ok: true, violations: [], message: `${id} 已登记送检（${reason === "oil-contaminated" ? "油脂污染" : "检验过期"}）` };
}

export function completeInspection(
  store: Store,
  id: string,
  input: { newValidUntil: string; cleanliness: CleanlinessGrade; inspector: string }
): ActionResult {
  const c = snapshotOf(store, id);
  if (!c) return fail([{ code: "missing", message: "气瓶不存在" }]);
  if (!c.inspectionIn)
    return fail([{ code: "not-inspection", message: "该气瓶当前不在送检中" }]);
  if (!input.newValidUntil)
    return fail([{ code: "no-date", message: "请选择新检验有效期" }]);
  if (!input.inspector.trim())
    return fail([{ code: "no-inspector", message: "请填写检验员" }]);

  store.appendCylinder(id, {
    type: "cylinder-inspected",
    at: new Date().toISOString(),
    id,
    newValidUntil: input.newValidUntil,
    cleanliness: input.cleanliness,
    inspector: input.inspector.trim(),
  });
  return { ok: true, violations: [], message: `${id} 检验合格，已恢复准入` };
}

export function snapshotOf(store: Store, id: string): CylinderSnapshot | null {
  return selectCylinders(store)[id] ?? null;
}

export function selectCylinders(
  store: Store
): Record<string, CylinderSnapshot> {
  const state = store.getState();
  const busy = new Set<string>();
  for (const evs of Object.values(state.groups)) {
    const g = deriveGroup(evs);
    if (g && isBusyPhase(g.phase)) g.cylinderIds.forEach((id) => busy.add(id));
  }
  const out: Record<string, CylinderSnapshot> = {};
  for (const [id, evs] of Object.entries(state.cylinders)) {
    const snap = deriveCylinder(id, evs, busy.has(id));
    if (snap) out[id] = snap;
  }
  return out;
}

export function selectGroups(store: Store): GroupSnapshot[] {
  return Object.values(store.getState().groups)
    .map((evs) => deriveGroup(evs))
    .filter((g): g is GroupSnapshot => g !== null)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

// ---------- 瓶组动作 ----------

export function createGroup(
  store: Store,
  planned: { events: GroupEvent[] }
): ActionResult {
  if (planned.events.length === 0)
    return fail([{ code: "nothing", message: "没有可提交的瓶组事件" }]);
  const groupId = planned.events[0].groupId;
  for (const e of planned.events) store.appendGroup(groupId, e);
  const rejected = planned.events.find((e) => e.type === "group-rejected");
  return rejected
    ? {
        ok: true,
        groupId,
        violations: [],
        message:
          rejected.type === "group-rejected" &&
          rejected.reason === "target-pressure-mismatch"
            ? `瓶组 ${groupId} 因目标压力不一致已整组拒绝`
            : `瓶组 ${groupId} 因气瓶不可准入已整组拒绝`,
      }
    : { ok: true, groupId, violations: [], message: `瓶组 ${groupId} 已进入待充填队列` };
}

export function reviseGroup(
  store: Store,
  group: GroupSnapshot,
  input: {
    targetBar: number;
    targetO2: number;
    targetHe: number;
    method: FillMethod;
    operator: string;
  }
): ActionResult {
  if (group.phase !== "rejected")
    return fail([{ code: "phase", message: "仅被整组拒绝的瓶组可修订" }]);
  if (!(input.targetBar > 0))
    return fail([{ code: "bad-bar", message: "目标压力无效" }]);
  if (!input.operator.trim())
    return fail([{ code: "no-operator", message: "必须填写操作员" }]);
  store.appendGroup(group.groupId, {
    type: "group-revised",
    at: new Date().toISOString(),
    groupId: group.groupId,
    targetBar: input.targetBar,
    targetO2: input.targetO2,
    targetHe: input.targetHe,
    method: input.method,
    operator: input.operator.trim(),
  });
  return { ok: true, groupId: group.groupId, violations: [], message: "瓶组已修订，重新进入待充填队列" };
}

export function startFill(
  store: Store,
  group: GroupSnapshot,
  operator: string,
  gate: { ok: boolean; detail?: string }
): ActionResult {
  if (group.phase !== "draft" && group.phase !== "voided-awaiting-signoff")
    return fail([{ code: "phase", message: "当前瓶组状态不能开始充填" }]);
  if (!gate.ok)
    return fail([{ code: "gate", message: gate.detail ?? "准入校验未通过" }]);
  if (!operator.trim())
    return fail([{ code: "no-operator", message: "必须填写充填操作员" }]);
  store.appendGroup(group.groupId, {
    type: "fill-started",
    at: new Date().toISOString(),
    groupId: group.groupId,
    operator: operator.trim(),
  });
  return { ok: true, groupId: group.groupId, violations: [], message: "充填已开始" };
}

export function recordFill(
  store: Store,
  group: GroupSnapshot,
  input: { measuredO2: number; measuredHe: number; settleBar: number; operator: string }
): ActionResult {
  if (group.phase !== "filling")
    return fail([{ code: "phase", message: "瓶组不在充填中，无法录入实测数据" }]);
  const violations: RuleViolation[] = [];
  if (!(input.measuredO2 >= 0 && input.measuredO2 <= 100))
    violations.push({ code: "bad-o2", message: "实测氧含量需在 0–100% 之间" });
  if (!(input.measuredHe >= 0 && input.measuredHe <= 100))
    violations.push({ code: "bad-he", message: "实测氦含量需在 0–100% 之间" });
  if (!(input.settleBar > 0))
    violations.push({ code: "bad-bar", message: "静置复测压力需大于 0" });
  if (!input.operator.trim())
    violations.push({ code: "no-operator", message: "必须填写操作员" });
  if (violations.length) return fail(violations);

  const r = evaluateFill(
    { o2: group.targetO2, he: group.targetHe, bar: group.targetBar },
    { o2: input.measuredO2, he: input.measuredHe, bar: input.settleBar }
  );
  const at = new Date().toISOString();
  store.appendGroup(group.groupId, {
    type: "fill-recorded",
    at,
    groupId: group.groupId,
    measuredO2: input.measuredO2,
    measuredHe: input.measuredHe,
    settleBar: input.settleBar,
    operator: input.operator.trim(),
  });
  if (!r.passed) {
    store.appendGroup(group.groupId, {
      type: "rework-opened",
      at,
      groupId: group.groupId,
      reasons: r.deviations,
      fromFillOperator: input.operator.trim(),
    });
    return {
      ok: true,
      groupId: group.groupId,
      violations: [],
      message: "偏差超限，已进入返工流程，须另一人复核",
    };
  }
  return { ok: true, groupId: group.groupId, violations: [], message: "实测合格，瓶组进入待签收" };
}

export function reviewRework(
  store: Store,
  group: GroupSnapshot,
  input: { measuredO2: number; measuredHe: number; settleBar: number; reviewer: string; note?: string }
): ActionResult {
  if (group.phase !== "rework")
    return fail([{ code: "phase", message: "瓶组不在返工状态" }]);
  const v = checkReviewer(group, input.reviewer);
  if (v) return fail([v]);
  const r = evaluateFill(
    { o2: group.targetO2, he: group.targetHe, bar: group.targetBar },
    { o2: input.measuredO2, he: input.measuredHe, bar: input.settleBar }
  );
  const event = {
    type: "rework-reviewed" as const,
    at: new Date().toISOString(),
    groupId: group.groupId,
    measuredO2: input.measuredO2,
    measuredHe: input.measuredHe,
    settleBar: input.settleBar,
    reviewer: input.reviewer.trim(),
    passed: r.passed,
    note: input.note?.trim() || undefined,
  };
  store.appendGroup(group.groupId, event);
  if (!r.passed) {
    return {
      ok: true,
      groupId: group.groupId,
      violations: [],
      message: `复核仍超限（${r.deviations.join("；")}），保持返工状态，可再次复测`,
    };
  }
  return { ok: true, groupId: group.groupId, violations: [], message: `复核人 ${input.reviewer.trim()} 确认合格，进入待签收` };
}

export function signDelivery(
  store: Store,
  group: GroupSnapshot,
  receiver: string,
  operator: string
): ActionResult {
  if (group.phase !== "awaiting-signoff" && group.phase !== "voided-awaiting-signoff")
    return fail([{ code: "phase", message: "仅待签收瓶组可签收" }]);
  if (!receiver.trim())
    return fail([{ code: "no-receiver", message: "必须填写签收人" }]);
  if (!operator.trim())
    return fail([{ code: "no-operator", message: "必须填写交付操作员" }]);
  store.appendGroup(group.groupId, {
    type: "delivered-signed",
    at: new Date().toISOString(),
    groupId: group.groupId,
    receiver: receiver.trim(),
    operator: operator.trim(),
  });
  return { ok: true, groupId: group.groupId, violations: [], message: `瓶组已由 ${receiver.trim()} 签收并冻结` };
}

/** 已签收后更换阀门：原签收立即失效，重算回待充填 */
export function replaceValve(
  store: Store,
  group: GroupSnapshot,
  operator: string,
  note?: string
): ActionResult {
  if (group.phase !== "signed")
    return fail([{ code: "phase", message: "仅已签收冻结的瓶组可更换阀门" }]);
  if (!operator.trim())
    return fail([{ code: "no-operator", message: "必须填写操作员" }]);
  const at = new Date().toISOString();
  store.appendGroup(group.groupId, {
    type: "delivery-voided",
    at,
    groupId: group.groupId,
    reason: "valve-replaced",
    operator: operator.trim(),
    note: note?.trim() || undefined,
  });
  for (const id of group.cylinderIds) {
    store.appendCylinder(id, {
      type: "valve-replaced",
      at,
      id,
      operator: operator.trim(),
      note: note?.trim() || undefined,
    });
  }
  return { ok: true, groupId: group.groupId, violations: [], message: "原签收已失效（更换阀门），瓶组重算为待充填，历史保留" };
}

/** 已签收后补录气源批次：原签收立即失效，重算为待重新签收 */
export function backfillSourceBatch(
  store: Store,
  group: GroupSnapshot,
  sourceBatch: string,
  operator: string
): ActionResult {
  if (group.phase !== "signed")
    return fail([{ code: "phase", message: "仅已签收冻结的瓶组可补录气源批次" }]);
  if (!sourceBatch.trim())
    return fail([{ code: "no-batch", message: "请填写气源批次号" }]);
  if (!operator.trim())
    return fail([{ code: "no-operator", message: "必须填写操作员" }]);
  store.appendGroup(group.groupId, {
    type: "delivery-voided",
    at: new Date().toISOString(),
    groupId: group.groupId,
    reason: "source-batch-backfilled",
    sourceBatch: sourceBatch.trim(),
    operator: operator.trim(),
  });
  return { ok: true, groupId: group.groupId, violations: [], message: `已补录气源批次 ${sourceBatch.trim()}，原签收获失效，待重新签收，历史保留` };
}
