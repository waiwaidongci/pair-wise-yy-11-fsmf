import { createContext, useContext, useMemo, useSyncExternalStore } from "react";
import { selectCylinders, selectGroups } from "../domain/flow";
import type { Store } from "../domain/store";
import { computeStats } from "../domain/stats";

const StoreContext = createContext<Store | null>(null);

export const StoreProvider = StoreContext.Provider;

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error("StoreProvider 缺失");
  return store;
}

// 订阅事件流：任何追加都会触发派生快照重算，刷新后由 localStorage 重建，保证一致
export function useAppData() {
  const store = useStore();
  const state = useSyncExternalStore(
    store.subscribe,
    store.getState,
    store.getState
  );

  return useMemo(() => {
    const cylinders = selectCylinders(store);
    const groups = selectGroups(store);
    const stats = computeStats(Object.values(cylinders), groups);
    return { store, cylinders, groups, stats };
    // state 是每次事件追加后新建的引用，作为重算触发器
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, state]);
}
