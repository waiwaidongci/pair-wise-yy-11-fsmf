export type Cleanliness = "oxygen-clean" | "standard" | "oil-contaminated";
export type FillMethod = "空气" | "高氧" | "Trimix" | "纯氧";

export interface FillRecord {
  o2: number;
  he: number;
  settledBar: number;
  at: string;
  by: string;
  deviations: string[];
}

export interface ReviewRecord {
  by: string;
  at: string;
}

export interface Signoff {
  id: string;
  customer: string;
  by: string;
  at: string;
  valid: boolean;
  invalidatedAt?: string;
  invalidateReason?: string;
}

export interface ValveChange {
  id: string;
  at: string;
  by: string;
  note: string;
}

export interface GasBatch {
  id: string;
  batchNo: string;
  at: string;
  by: string;
}

export interface Tank {
  id: string;
  serial: string;
  volumeL: number;
  inspectionUntil: string; // YYYY-MM-DD
  cleanliness: Cleanliness;
  residualBar: number;
  targetBar: number;
  targetO2: number;
  targetHe: number;
  fillMethod: FillMethod;
  operator: string;
  groupId: string | null;
  fills: FillRecord[];
  reviewRequired: boolean;
  reviews: ReviewRecord[];
  signoffs: Signoff[];
  valveChanges: ValveChange[];
  gasBatches: GasBatch[];
  createdAt: string;
}

export interface FillGroup {
  id: string;
  name: string;
  createdAt: string;
}

export interface DomainEvent {
  id: string;
  at: string;
  type: string;
  message: string;
  tankId?: string;
  groupId?: string;
}

export interface AppState {
  tanks: Tank[];
  groups: FillGroup[];
  events: DomainEvent[];
}

export type TankStatus =
  | "pending-inspection"
  | "queued"
  | "rework"
  | "pending-review"
  | "awaiting-signoff"
  | "delivered";

export type GroupStatus = "rejected" | "filling" | "rework" | "ready" | "delivered";
