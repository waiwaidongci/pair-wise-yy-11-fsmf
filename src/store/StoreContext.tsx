import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AppState, Cleanliness } from "../domain/types";
import { loadState, resetState, saveState } from "./persistence";
import * as tx from "./transitions";
import type { RegisterInput, Result } from "./transitions";

export interface Actions {
  registerTank(input: RegisterInput): Result;
  sendToInspection(
    tankId: string,
    inspectionUntil: string,
    cleanliness: Cleanliness,
    by: string
  ): Result;
  removeFromGroup(tankId: string): Result;
  recordFill(tankId: string, o2: number, he: number, settledBar: number, by: string): Result;
  reviewRework(tankId: string, reviewer: string): Result;
  signoff(tankId: string, customer: string, by: string): Result;
  replaceValve(tankId: string, by: string, note: string): Result;
  addGasBatch(tankId: string, batchNo: string, by: string): Result;
  resetDemo(): void;
}

export interface StoreValue {
  state: AppState;
  actions: Actions;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(() => loadState());
  const ref = useRef(state);
  ref.current = state;

  // 每次状态变化即持久化，保证刷新后队列与统计一致
  useEffect(() => {
    saveState(state);
  }, [state]);

  const actions = useMemo<Actions>(() => {
    const run = (fn: (s: AppState) => Result): Result => {
      const r = fn(ref.current);
      if (r.ok) setState(r.state);
      return r;
    };
    const now = () => new Date();
    return {
      registerTank: (input) => run((s) => tx.registerTank(s, input, now())),
      sendToInspection: (tankId, until, cleanliness, by) =>
        run((s) => tx.sendToInspection(s, tankId, until, cleanliness, by, now())),
      removeFromGroup: (tankId) => run((s) => tx.removeFromGroup(s, tankId, now())),
      recordFill: (tankId, o2, he, bar, by) =>
        run((s) => tx.recordFill(s, tankId, o2, he, bar, by, now())),
      reviewRework: (tankId, reviewer) => run((s) => tx.reviewRework(s, tankId, reviewer, now())),
      signoff: (tankId, customer, by) => run((s) => tx.signoffTank(s, tankId, customer, by, now())),
      replaceValve: (tankId, by, note) => run((s) => tx.replaceValve(s, tankId, by, note, now())),
      addGasBatch: (tankId, batchNo, by) => run((s) => tx.addGasBatch(s, tankId, batchNo, by, now())),
      resetDemo: () => setState(resetState()),
    };
  }, []);

  const value = useMemo<StoreValue>(() => ({ state, actions }), [state, actions]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore 必须在 StoreProvider 内使用");
  return ctx;
}
