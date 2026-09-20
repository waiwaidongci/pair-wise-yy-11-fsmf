// 领域规则冒烟测试：esbuild 打包后以 node 运行，不依赖浏览器
import { createStore } from "./src/domain/store";
import {
  completeInspection,
  createGroup,
  recordFill,
  registerCylinder,
  replaceValve,
  reviewRework,
  backfillSourceBatch,
  selectCylinders,
  selectGroups,
  sendForInspection,
  signDelivery,
  startFill,
} from "./src/domain/flow";
import { checkStartFill, planCreateGroup } from "./src/domain/rules";
import type { FillMethod } from "./src/domain/types";

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error("✗ " + msg);
  }
}

function dateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// localStorage 内存桩
class MemStorage {
  m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
  get size() {
    return this.m.size;
  }
}
(globalThis as unknown as { localStorage: MemStorage }).localStorage =
  new MemStorage();

// ---------- 场景 1：过期/污染只能送检，不能入组 ----------
{
  const store = createStore();
  registerCylinder(store, {
    id: "exp1",
    volumeL: 12,
    material: "钢瓶",
    hydroValidUntil: dateOffset(-3),
    cleanliness: "B",
  });
  registerCylinder(store, {
    id: "oil1",
    volumeL: 12,
    material: "钢瓶",
    hydroValidUntil: dateOffset(100),
    cleanliness: "C",
  });
  registerCylinder(store, {
    id: "ok1",
    volumeL: 12,
    material: "钢瓶",
    hydroValidUntil: dateOffset(100),
    cleanliness: "A",
  });
  const cyl = selectCylinders(store);
  assert(cyl.EXP1?.phase === "expired", "过期气瓶相位为 expired");
  assert(cyl.OIL1?.phase === "contaminated", "C级污染相位为 contaminated");
  assert(cyl.EXP1?.admitted === false, "过期气瓶不可准入");

  const planned = planCreateGroup(
    {
      cylinderIds: ["EXP1", "OIL1", "OK1"],
      lines: [
        { id: "EXP1", targetBar: 200, residualBar: 10 },
        { id: "OIL1", targetBar: 200, residualBar: 10 },
        { id: "OK1", targetBar: 200, residualBar: 10 },
      ],
      targetO2: 21,
      targetHe: 0,
      method: "空气充填" as FillMethod,
      operator: "甲",
    },
    cyl
  );
  assert(planned.violations.length === 0, "建组输入本身合法");
  const reject = planned.events.find((e) => e.type === "group-rejected");
  assert(
    reject?.type === "group-rejected" && reject.reason === "cylinders-not-admitted",
    "含过期/污染气瓶整组拒绝（cylinders-not-admitted）"
  );
  createGroup(store, planned);

  // 过期瓶登记送检，检验合格回填后恢复准入
  const r1 = sendForInspection(store, "EXP1", "甲");
  assert(r1.ok, "过期瓶可登记送检");
  const cyl2 = selectCylinders(store);
  assert(cyl2.EXP1?.phase === "inspection", "送检中相位");
  const r2 = completeInspection(store, "EXP1", {
    newValidUntil: dateOffset(300),
    cleanliness: "B",
    inspector: "检验员",
  });
  assert(r2.ok, "检验合格回填成功");
  const cyl3 = selectCylinders(store);
  assert(cyl3.EXP1?.admitted === true, "检验后恢复准入");
}

// ---------- 场景 2：目标压力不一致整组拒绝，修订后入队 ----------
{
  const store = createStore();
  registerCylinder(store, { id: "a", volumeL: 12, material: "s", hydroValidUntil: dateOffset(50), cleanliness: "A" });
  registerCylinder(store, { id: "b", volumeL: 12, material: "s", hydroValidUntil: dateOffset(50), cleanliness: "A" });
  const cyl = selectCylinders(store);
  const planned = planCreateGroup(
    {
      cylinderIds: ["A", "B"],
      lines: [
        { id: "A", targetBar: 200, residualBar: 0 },
        { id: "B", targetBar: 180, residualBar: 0 },
      ],
      targetO2: 32,
      targetHe: 0,
      method: "高氧充填",
      operator: "甲",
    },
    cyl
  );
  assert(planned.events.length === 2, "生成 created+rejected 两事件");
  createGroup(store, planned);
  const g = selectGroups(store)[0];
  assert(g.phase === "rejected", "瓶组处于 rejected");
  // 被拒绝瓶组不占用气瓶
  assert(selectCylinders(store).A.busy === false, "拒绝组释放气瓶占用");
}

// ---------- 场景 3：偏差超限 → 返工 → 必须另一人复核 → 签收冻结 ----------
{
  const store = createStore();
  registerCylinder(store, { id: "t1", volumeL: 12, material: "s", hydroValidUntil: dateOffset(90), cleanliness: "A" });
  const cyl = selectCylinders(store);
  const planned = planCreateGroup(
    {
      cylinderIds: ["T1"],
      lines: [{ id: "T1", targetBar: 200, residualBar: 20 }],
      targetO2: 18,
      targetHe: 45,
      method: "Trimix充填",
      operator: "甲",
    },
    cyl
  );
  createGroup(store, planned);
  let g = selectGroups(store)[0];
  const gate = checkStartFill(g, selectCylinders(store));
  assert(gate.ok, "开充前闸门通过");
  startFill(store, g, "甲", gate);
  g = selectGroups(store)[0];
  assert(g.phase === "filling", "进入充填中");

  // 超限：氧偏差 +2.6%
  const rr = recordFill(store, g, { measuredO2: 20.6, measuredHe: 45, settleBar: 200, operator: "甲" });
  assert(rr.ok, "录入成功（流程层 ok 表示事件已处理）");
  g = selectGroups(store)[0];
  assert(g.phase === "rework", "超限进入返工");
  assert((g.reworkReasons?.length ?? 0) === 1, "记录 1 项偏差");

  // 同一人复核被拒绝
  const self = reviewRework(store, g, { measuredO2: 18.2, measuredHe: 45, settleBar: 200, reviewer: "甲" });
  assert(!self.ok && self.violations[0].code === "self-review", "同一人复核被拒（self-review）");

  // 另一人复核，仍不合格 → 保持返工
  const failReview = reviewRework(store, g, { measuredO2: 19.8, measuredHe: 45, settleBar: 200, reviewer: "乙" });
  assert(failReview.ok, "另一人可提交复核");
  g = selectGroups(store)[0];
  assert(g.phase === "rework", "复测仍超限保持返工");
  assert(g.reworkReviews.length === 1, "保留一次失败复核记录");

  // 另一人复核合格 → 待签收 → 签收
  reviewRework(store, g, { measuredO2: 18.4, measuredHe: 45.2, settleBar: 196, reviewer: "乙" });
  g = selectGroups(store)[0];
  assert(g.phase === "awaiting-signoff", "复核合格转待签收");
  signDelivery(store, g, "客户丙", "甲");
  g = selectGroups(store)[0];
  assert(g.phase === "signed" && g.currentSignoff?.voided === false, "签收冻结");
}

// ---------- 场景 4：冻结后换阀 → 原签收失效、回待充填、气瓶留痕 ----------
{
  const store = createStore();
  registerCylinder(store, { id: "v1", volumeL: 12, material: "s", hydroValidUntil: dateOffset(90), cleanliness: "A" });
  const cyl = selectCylinders(store);
  const planned = planCreateGroup(
    {
      cylinderIds: ["V1"],
      lines: [{ id: "V1", targetBar: 200, residualBar: 0 }],
      targetO2: 21,
      targetHe: 0,
      method: "空气充填",
      operator: "甲",
    },
    cyl
  );
  createGroup(store, planned);
  let g = selectGroups(store)[0];
  startFill(store, g, "甲", checkStartFill(g, selectCylinders(store)));
  g = selectGroups(store)[0];
  recordFill(store, g, { measuredO2: 21, measuredHe: 0, settleBar: 200, operator: "甲" });
  g = selectGroups(store)[0];
  signDelivery(store, g, "客", "甲");
  g = selectGroups(store)[0];

  const vr = replaceValve(store, g, "丁");
  assert(vr.ok, "换阀操作成功");
  g = selectGroups(store)[0];
  assert(g.phase === "draft", "换阀后重算回待充填");
  assert(g.currentSignoff?.voided === true, "原签收标记为已失效");
  assert(g.signoffHistory.length === 1 && g.signoffHistory[0].voided, "历史保留失效签收");
  const cEv = selectCylinders(store).V1.events;
  assert(cEv.some((e) => e.type === "valve-replaced"), "气瓶档案留下换阀事件");
}

// ---------- 场景 5：冻结后补录气源批次 → 待重新签收，再签后冻结 ----------
{
  const store = createStore();
  registerCylinder(store, { id: "s1", volumeL: 12, material: "s", hydroValidUntil: dateOffset(90), cleanliness: "A" });
  const cyl = selectCylinders(store);
  const planned = planCreateGroup(
    {
      cylinderIds: ["S1"],
      lines: [{ id: "S1", targetBar: 200, residualBar: 0 }],
      targetO2: 32,
      targetHe: 0,
      method: "高氧充填",
      operator: "甲",
    },
    cyl
  );
  createGroup(store, planned);
  let g = selectGroups(store)[0];
  startFill(store, g, "甲", checkStartFill(g, selectCylinders(store)));
  g = selectGroups(store)[0];
  recordFill(store, g, { measuredO2: 32.3, measuredHe: 0, settleBar: 199, operator: "甲" });
  g = selectGroups(store)[0];
  signDelivery(store, g, "客", "甲");
  g = selectGroups(store)[0];

  backfillSourceBatch(store, g, "AIR-X-001", "戊");
  g = selectGroups(store)[0];
  assert(g.phase === "voided-awaiting-signoff", "补录批次后重算为待重新签收");
  assert(g.latestFill !== undefined, "补录批次保留原实测参数");
  assert(g.voidEvents[0].sourceBatch === "AIR-X-001", "记录气源批次");

  signDelivery(store, g, "客", "戊");
  g = selectGroups(store)[0];
  assert(g.phase === "signed", "重新签收后再次冻结");
  assert(g.signoffHistory.length === 2, "两次签收均在历史中");
  assert(g.signoffHistory[0].voided && !g.signoffHistory[1].voided, "前次失效、后次有效");
}

// ---------- 场景 6：B 级瓶禁充 Trimix；刷新后一致（持久化重建） ----------
{
  // 使用独立存储，且在创建任何 store 前安装桩
  const mem6 = new MemStorage();
  (globalThis as unknown as { localStorage: MemStorage }).localStorage = mem6;

  const store = createStore();
  registerCylinder(store, { id: "b1", volumeL: 12, material: "s", hydroValidUntil: dateOffset(90), cleanliness: "B" });
  const cyl = selectCylinders(store);
  const planned = planCreateGroup(
    {
      cylinderIds: ["B1"],
      lines: [{ id: "B1", targetBar: 200, residualBar: 0 }],
      targetO2: 18,
      targetHe: 45,
      method: "Trimix充填",
      operator: "甲",
    },
    cyl
  );
  const rej = planned.events.find((e) => e.type === "group-rejected");
  assert(rej?.type === "group-rejected", "B级瓶 Trimix 整组拒绝");
  createGroup(store, planned);

  // 持久化重建：新 store 实例从同一 localStorage 读出（模拟刷新）
  const reopened = createStore();
  const groups2 = selectGroups(reopened);
  assert(groups2.length === 1 && groups2[0].phase === "rejected", "刷新/重开后状态一致");
  assert(selectCylinders(reopened).B1?.cleanliness === "B", "气瓶档案刷新后一致");

  (globalThis as unknown as { localStorage: MemStorage }).localStorage =
    new MemStorage();
}

// ---------- 场景 7：忙瓶不能重复入组 ----------
{
  const store = createStore();
  registerCylinder(store, { id: "z1", volumeL: 12, material: "s", hydroValidUntil: dateOffset(90), cleanliness: "A" });
  const cyl = selectCylinders(store);
  const planned = planCreateGroup(
    {
      cylinderIds: ["Z1"],
      lines: [{ id: "Z1", targetBar: 200, residualBar: 0 }],
      targetO2: 21,
      targetHe: 0,
      method: "空气充填",
      operator: "甲",
    },
    cyl
  );
  createGroup(store, planned);
  const again = planCreateGroup(
    {
      cylinderIds: ["Z1"],
      lines: [{ id: "Z1", targetBar: 200, residualBar: 0 }],
      targetO2: 21,
      targetHe: 0,
      method: "空气充填",
      operator: "甲",
    },
    selectCylinders(store)
  );
  assert(
    again.violations.some((v) => v.code === "busy"),
    "在未关闭瓶组中的气瓶不能重复入组"
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
