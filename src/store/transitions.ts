import {
  admissionBlockers,
  canRecordFill,
  canReview,
  canSignoff,
  checkDeviations,
  CLEANLINESS_LABEL,
  deriveGroupStatus,
  deriveTankStatus,
  groupMembers,
  todayStr,
  validSignoff,
} from "../domain/rules";
import type {
  AppState,
  Cleanliness,
  DomainEvent,
  FillGroup,
  FillMethod,
  FillRecord,
  Signoff,
  Tank,
} from "../domain/types";
import { uid } from "./ids";

export type Result = { ok: true; state: AppState } | { ok: false; error: string };

const ok = (state: AppState): Result => ({ ok: true, state });
const err = (error: string): Result => ({ ok: false, error });

function findTank(state: AppState, tankId: string): Tank | undefined {
  return state.tanks.find((t) => t.id === tankId);
}

function replaceTank(state: AppState, updated: Tank, events: DomainEvent[]): AppState {
  return {
    ...state,
    tanks: state.tanks.map((t) => (t.id === updated.id ? updated : t)),
    events: [...state.events, ...events],
  };
}

export interface RegisterInput {
  serial: string;
  volumeL: number;
  inspectionUntil: string;
  cleanliness: Cleanliness;
  residualBar: number;
  targetBar: number;
  targetO2: number;
  targetHe: number;
  fillMethod: FillMethod;
  operator: string;
  /** "none" 不编组 / "new" 新建瓶组 / 其他为已有瓶组 id */
  groupChoice: string;
  newGroupName?: string;
}

export function registerTank(state: AppState, input: RegisterInput, now: Date): Result {
  const serial = input.serial.trim();
  if (!serial) return err("请填写气瓶编号");
  if (state.tanks.some((t) => t.serial.toLowerCase() === serial.toLowerCase()))
    return err(`气瓶编号 ${serial} 已存在`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.inspectionUntil)) return err("请选择检验有效期");
  if (!(input.volumeL > 0)) return err("容积须大于 0");
  if (input.residualBar < 0) return err("残压不能为负");
  if (!(input.targetBar > 0)) return err("目标压力须大于 0");
  if (input.targetO2 < 0 || input.targetO2 > 100 || input.targetHe < 0 || input.targetHe > 100)
    return err("氧/氦含量须在 0–100% 之间");
  if (input.targetO2 + input.targetHe > 100) return err("氧含量与氦含量之和不能超过 100%");
  if (!input.operator.trim()) return err("请填写操作员");

  const today = todayStr(now);
  const iso = now.toISOString();
  const events: DomainEvent[] = [];
  let groups = state.groups;
  let groupId: string | null = null;

  if (input.groupChoice === "new") {
    const name = input.newGroupName?.trim();
    if (!name) return err("请填写新瓶组名称");
    const group: FillGroup = { id: uid("grp"), name, createdAt: iso };
    groups = [...groups, group];
    groupId = group.id;
  } else if (input.groupChoice !== "none") {
    if (!state.groups.some((g) => g.id === input.groupChoice)) return err("所选瓶组不存在");
    groupId = input.groupChoice;
  }

  const tank: Tank = {
    id: uid("tank"),
    serial,
    volumeL: input.volumeL,
    inspectionUntil: input.inspectionUntil,
    cleanliness: input.cleanliness,
    residualBar: input.residualBar,
    targetBar: input.targetBar,
    targetO2: input.targetO2,
    targetHe: input.targetHe,
    fillMethod: input.fillMethod,
    operator: input.operator.trim(),
    groupId,
    fills: [],
    reviewRequired: false,
    reviews: [],
    signoffs: [],
    valveChanges: [],
    gasBatches: [],
    createdAt: iso,
  };

  events.push({
    id: uid("ev"),
    at: iso,
    type: "tank.registered",
    message: `${serial} 登记准入（${input.fillMethod}，目标 ${input.targetBar}bar）${groupId ? "，已编组" : ""}`,
    tankId: tank.id,
    groupId: groupId ?? undefined,
  });

  const blockers = admissionBlockers(tank, today);
  if (blockers.length > 0) {
    events.push({
      id: uid("ev"),
      at: iso,
      type: "tank.admission-blocked",
      message: `${serial} 准入拦截：${blockers.join("、")}，只能送检`,
      tankId: tank.id,
    });
  }

  const next: AppState = {
    ...state,
    groups,
    tanks: [...state.tanks, tank],
    events: [...state.events, ...events],
  };

  // 编组后立即重算瓶组配比：同组目标压力不一致 → 整组拒绝
  if (groupId) {
    const members = groupMembers(next, groupId);
    if (members.length > 1 && deriveGroupStatus(members, today) === "rejected") {
      const groupName = groups.find((g) => g.id === groupId)?.name ?? "瓶组";
      next.events = [
        ...next.events,
        {
          id: uid("ev"),
          at: iso,
          type: "group.rejected",
          message: `${groupName} 同组目标压力不一致（${members
            .map((m) => `${m.serial}:${m.targetBar}bar`)
            .join("、")}），整组拒绝`,
          groupId,
        },
      ];
    }
  }
  return ok(next);
}

/** 送检：仅待送检（过期/油脂污染）气瓶可执行，归队后重新准入 */
export function sendToInspection(
  state: AppState,
  tankId: string,
  inspectionUntil: string,
  cleanliness: Cleanliness,
  by: string,
  now: Date
): Result {
  const tank = findTank(state, tankId);
  if (!tank) return err("气瓶不存在");
  const today = todayStr(now);
  if (deriveTankStatus(tank, today) !== "pending-inspection")
    return err("仅待送检气瓶可执行送检");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inspectionUntil) || inspectionUntil <= today)
    return err("新检验有效期须晚于今天");
  if (cleanliness === "oil-contaminated") return err("送检归队后清洁等级不得仍为油脂污染");
  if (!by.trim()) return err("请填写经办人");

  const updated: Tank = { ...tank, inspectionUntil, cleanliness };
  return ok(
    replaceTank(state, updated, [
      {
        id: uid("ev"),
        at: now.toISOString(),
        type: "tank.sent-to-inspection",
        message: `${tank.serial} 送检完成（检验至 ${inspectionUntil}，${CLEANLINESS_LABEL[cleanliness]}，经办 ${by.trim()}），重新准入待充填`,
        tankId,
        groupId: tank.groupId ?? undefined,
      },
    ])
  );
}

export function removeFromGroup(state: AppState, tankId: string, now: Date): Result {
  const tank = findTank(state, tankId);
  if (!tank) return err("气瓶不存在");
  if (!tank.groupId) return err("气瓶不在任何瓶组中");
  const today = todayStr(now);
  if (deriveTankStatus(tank, today) === "delivered")
    return err("已签收气瓶处于交付冻结中，不能移出瓶组");

  const group = state.groups.find((g) => g.id === tank.groupId);
  const updated: Tank = { ...tank, groupId: null };
  return ok(
    replaceTank(state, updated, [
      {
        id: uid("ev"),
        at: now.toISOString(),
        type: "group.member-removed",
        message: `${tank.serial} 移出${group?.name ?? "瓶组"}，瓶组状态重算`,
        tankId,
        groupId: group?.id,
      },
    ])
  );
}

/** 充填后录入实测氧/氦与静置复测压力；偏差超限进入返工，返工充填合格后须另一人复核 */
export function recordFill(
  state: AppState,
  tankId: string,
  o2: number,
  he: number,
  settledBar: number,
  by: string,
  now: Date
): Result {
  const tank = findTank(state, tankId);
  if (!tank) return err("气瓶不存在");
  if ([o2, he, settledBar].some((v) => Number.isNaN(v))) return err("请填写完整的实测数值");
  if (o2 < 0 || o2 > 100 || he < 0 || he > 100) return err("氧/氦含量须在 0–100% 之间");
  if (settledBar < 0) return err("静置复测压力不能为负");
  if (!by.trim()) return err("请填写充填操作员");

  const today = todayStr(now);
  const members = tank.groupId ? groupMembers(state, tank.groupId) : null;
  const gate = canRecordFill(tank, members, today);
  if (!gate.ok) return err(gate.reason ?? "当前状态不允许充填");

  const deviations = checkDeviations(tank, o2, he, settledBar);
  const wasRework = deriveTankStatus(tank, today) === "rework";
  const iso = now.toISOString();
  const fill: FillRecord = { o2, he, settledBar, at: iso, by: by.trim(), deviations };
  const updated: Tank = {
    ...tank,
    fills: [...tank.fills, fill],
    reviewRequired: wasRework && deviations.length === 0,
  };

  let event: DomainEvent;
  if (deviations.length > 0) {
    event = {
      id: uid("ev"),
      at: iso,
      type: "fill.rework",
      message: `${tank.serial} 复测偏差超限（${deviations.join("；")}），进入返工`,
      tankId,
      groupId: tank.groupId ?? undefined,
    };
  } else if (wasRework) {
    event = {
      id: uid("ev"),
      at: iso,
      type: "fill.recorded",
      message: `${tank.serial} 返工充填复测合格（氧 ${o2}%、氦 ${he}%、静置 ${settledBar}bar），待另一人复核`,
      tankId,
      groupId: tank.groupId ?? undefined,
    };
  } else {
    event = {
      id: uid("ev"),
      at: iso,
      type: "fill.recorded",
      message: `${tank.serial} 充填复测合格（氧 ${o2}%、氦 ${he}%、静置 ${settledBar}bar）`,
      tankId,
      groupId: tank.groupId ?? undefined,
    };
  }
  return ok(replaceTank(state, updated, [event]));
}

export function reviewRework(state: AppState, tankId: string, reviewer: string, now: Date): Result {
  const tank = findTank(state, tankId);
  if (!tank) return err("气瓶不存在");
  const gate = canReview(tank, reviewer, todayStr(now));
  if (!gate.ok) return err(gate.reason ?? "不可复核");

  const iso = now.toISOString();
  const updated: Tank = {
    ...tank,
    reviewRequired: false,
    reviews: [...tank.reviews, { by: reviewer.trim(), at: iso }],
  };
  return ok(
    replaceTank(state, updated, [
      {
        id: uid("ev"),
        at: iso,
        type: "rework.reviewed",
        message: `${tank.serial} 返工复核通过（复核人 ${reviewer.trim()}），转入待签收`,
        tankId,
        groupId: tank.groupId ?? undefined,
      },
    ])
  );
}

export function signoffTank(
  state: AppState,
  tankId: string,
  customer: string,
  by: string,
  now: Date
): Result {
  const tank = findTank(state, tankId);
  if (!tank) return err("气瓶不存在");
  const gate = canSignoff(tank, todayStr(now));
  if (!gate.ok) return err(gate.reason ?? "当前状态不可签收");
  if (!customer.trim()) return err("请填写签收客户");
  if (!by.trim()) return err("请填写签收经办人");

  const iso = now.toISOString();
  const signoff: Signoff = {
    id: uid("so"),
    customer: customer.trim(),
    by: by.trim(),
    at: iso,
    valid: true,
  };
  const updated: Tank = { ...tank, signoffs: [...tank.signoffs, signoff] };
  return ok(
    replaceTank(state, updated, [
      {
        id: uid("ev"),
        at: iso,
        type: "signoff.created",
        message: `${tank.serial} 签收交付（客户 ${customer.trim()}），交付冻结生效`,
        tankId,
        groupId: tank.groupId ?? undefined,
      },
    ])
  );
}

/** 更换阀门：已签收气瓶的原签收立即失效，重算瓶组状态，历史保留 */
export function replaceValve(
  state: AppState,
  tankId: string,
  by: string,
  note: string,
  now: Date
): Result {
  const tank = findTank(state, tankId);
  if (!tank) return err("气瓶不存在");
  if (!by.trim()) return err("请填写经办人");

  const iso = now.toISOString();
  const hadValidSignoff = validSignoff(tank);
  const updated: Tank = {
    ...tank,
    valveChanges: [
      ...tank.valveChanges,
      { id: uid("vc"), at: iso, by: by.trim(), note: note.trim() || "更换阀门" },
    ],
    signoffs: tank.signoffs.map((s) =>
      s.valid ? { ...s, valid: false, invalidatedAt: iso, invalidateReason: "更换阀门" } : s
    ),
  };
  const events: DomainEvent[] = [
    {
      id: uid("ev"),
      at: iso,
      type: "valve.replaced",
      message: `${tank.serial} 更换阀门（经办 ${by.trim()}）`,
      tankId,
      groupId: tank.groupId ?? undefined,
    },
  ];
  if (hadValidSignoff) {
    events.push({
      id: uid("ev"),
      at: iso,
      type: "signoff.invalidated",
      message: `${tank.serial} 原签收立即失效（更换阀门），重算瓶组状态，历史保留`,
      tankId,
      groupId: tank.groupId ?? undefined,
    });
  }
  return ok(replaceTank(state, updated, events));
}

/** 补录气源批次：已签收气瓶的原签收立即失效，重算瓶组状态，历史保留 */
export function addGasBatch(
  state: AppState,
  tankId: string,
  batchNo: string,
  by: string,
  now: Date
): Result {
  const tank = findTank(state, tankId);
  if (!tank) return err("气瓶不存在");
  if (!batchNo.trim()) return err("请填写气源批次号");
  if (!by.trim()) return err("请填写经办人");

  const iso = now.toISOString();
  const hadValidSignoff = validSignoff(tank);
  const updated: Tank = {
    ...tank,
    gasBatches: [
      ...tank.gasBatches,
      { id: uid("gb"), batchNo: batchNo.trim(), at: iso, by: by.trim() },
    ],
    signoffs: tank.signoffs.map((s) =>
      s.valid ? { ...s, valid: false, invalidatedAt: iso, invalidateReason: "补录气源批次" } : s
    ),
  };
  const events: DomainEvent[] = [
    {
      id: uid("ev"),
      at: iso,
      type: "gasbatch.added",
      message: `${tank.serial} 补录气源批次 ${batchNo.trim()}（经办 ${by.trim()}）`,
      tankId,
      groupId: tank.groupId ?? undefined,
    },
  ];
  if (hadValidSignoff) {
    events.push({
      id: uid("ev"),
      at: iso,
      type: "signoff.invalidated",
      message: `${tank.serial} 原签收立即失效（补录气源批次），重算瓶组状态，历史保留`,
      tankId,
      groupId: tank.groupId ?? undefined,
    });
  }
  return ok(replaceTank(state, updated, events));
}
