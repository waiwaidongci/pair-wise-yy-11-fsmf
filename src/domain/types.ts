// 领域模型：潜水气瓶瓶组配比与交付冻结闭环
// 事件溯源 —— 所有状态由不可变事件推导，历史只追加、不改写

export type CleanlinessGrade = "A" | "B" | "C";

// ---------- 气瓶 ----------

export interface CylinderRegistered {
  type: "cylinder-registered";
  at: string;
  id: string; // 气瓶编号，如 TANK-204
  volumeL: number; // 容积（升）
  material: string; // 瓶体描述，如 12L铝瓶
  hydroValidUntil: string; // 检验有效期（ISO 日期）
  cleanliness: CleanlinessGrade; // 清洁等级
  note?: string;
}

export interface CylinderSentForInspection {
  type: "cylinder-sent-for-inspection";
  at: string;
  id: string;
  reason: "hydro-expired" | "oil-contaminated";
  operator: string;
}

export interface CylinderInspected {
  type: "cylinder-inspected";
  at: string;
  id: string;
  newValidUntil: string;
  cleanliness: CleanlinessGrade; // 检验后重新评定的清洁等级
  inspector: string;
}

export interface ValveReplaced {
  type: "valve-replaced";
  at: string;
  id: string;
  operator: string;
  note?: string;
}

export type CylinderEvent =
  | CylinderRegistered
  | CylinderSentForInspection
  | CylinderInspected
  | ValveReplaced;

// ---------- 瓶组 ----------

export type FillMethod = "空气充填" | "高氧充填" | "Trimix充填";

export interface GroupCreated {
  type: "group-created";
  at: string;
  groupId: string;
  cylinderIds: string[];
  targetBar: number; // 同组必须目标压力一致，否则整组拒绝（见 group-rejected）
  targetO2: number; // 目标氧含量 %
  targetHe: number; // 目标氦含量 %
  method: FillMethod;
  residualBar: Record<string, number>; // 每瓶残压
  operator: string;
}

export interface GroupRejected {
  type: "group-rejected";
  at: string;
  groupId: string;
  reason:
    | "target-pressure-mismatch" // 同组目标压力不同，整组拒绝
    | "cylinders-not-admitted"; // 存在不可准入气瓶
  detail: string;
  operator: string;
}

export interface GroupRevised {
  type: "group-revised";
  at: string;
  groupId: string;
  targetBar: number;
  targetO2: number;
  targetHe: number;
  method: FillMethod;
  operator: string;
}

export interface FillStarted {
  type: "fill-started";
  at: string;
  groupId: string;
  operator: string;
}

export interface FillRecorded {
  type: "fill-recorded";
  at: string;
  groupId: string;
  measuredO2: number; // 实测氧含量 %
  measuredHe: number; // 实测氦含量 %
  settleBar: number; // 静置复测压力 bar
  operator: string;
}

export interface ReworkOpened {
  type: "rework-opened";
  at: string;
  groupId: string;
  reasons: string[]; // 超限项说明
  fromFillOperator: string;
}

export interface ReworkReviewed {
  type: "rework-reviewed";
  at: string;
  groupId: string;
  measuredO2: number; // 返工后复测
  measuredHe: number;
  settleBar: number;
  reviewer: string; // 必须与充填操作员不同
  passed: boolean;
  note?: string;
}

export interface DeliveredSigned {
  type: "delivered-signed";
  at: string;
  groupId: string;
  receiver: string; // 签收人
  operator: string;
}

export interface DeliveryVoided {
  type: "delivery-voided";
  at: string;
  groupId: string;
  reason: "valve-replaced" | "source-batch-backfilled";
  sourceBatch?: string; // 补录气源批次
  operator: string;
  note?: string;
}

export type GroupEvent =
  | GroupCreated
  | GroupRejected
  | GroupRevised
  | FillStarted
  | FillRecorded
  | ReworkOpened
  | ReworkReviewed
  | DeliveredSigned
  | DeliveryVoided;

// ---------- 推导快照 ----------

export type CylinderPhase =
  | "admitted" // 准入，可入组
  | "inspection" // 送检中
  | "expired" // 检验过期（尚未发起送检）
  | "contaminated"; // 油脂污染（尚未发起送检）

export interface CylinderSnapshot {
  id: string;
  volumeL: number;
  material: string;
  hydroValidUntil: string;
  cleanliness: CleanlinessGrade;
  phase: CylinderPhase;
  admitted: boolean;
  admissionReason?: string;
  inspectionIn: boolean;
  busy: boolean; // 是否已处于未关闭瓶组
  events: CylinderEvent[];
}

export type GroupPhase =
  | "draft" // 已建组待充填
  | "rejected" // 整组拒绝（压力不一致等）
  | "filling" // 充填中
  | "rework" // 返工待复核
  | "awaiting-signoff" // 待签收
  | "signed" // 已签收（交付冻结）
  | "voided-awaiting-signoff"; // 签收失效后重算：参数仍有效，待重新签收

export interface FillResult {
  measuredO2: number;
  measuredHe: number;
  settleBar: number;
  at: string;
  operator: string;
  passed: boolean;
  deviations: string[];
}

export interface SignoffInfo {
  at: string;
  receiver: string;
  operator: string;
  voided: boolean;
  voidReason?: DeliveryVoided["reason"];
  voidAt?: string;
}

export interface GroupSnapshot {
  groupId: string;
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
  reworkReviews: ReworkReviewed[];
  currentSignoff?: SignoffInfo;
  signoffHistory: SignoffInfo[];
  voidEvents: DeliveryVoided[];
  events: GroupEvent[];
}

export interface AppState {
  cylinders: Record<string, CylinderEvent[]>;
  groups: Record<string, GroupEvent[]>;
}

export interface RuleViolation {
  code: string;
  message: string;
}
