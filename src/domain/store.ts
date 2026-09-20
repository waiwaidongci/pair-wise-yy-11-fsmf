import { STORAGE_KEY, STORAGE_VERSION } from "./constants";
import type {
  AppState,
  CylinderEvent,
  GroupEvent,
} from "./types";

// 存储层：只负责事件日志的追加与持久化，不含任何业务判断。
// 规则在 domain/rules.ts，界面在 ui/，三层互不依赖实现细节。

export interface PersistedShape {
  version: number;
  cylinders: Record<string, CylinderEvent[]>;
  groups: Record<string, GroupEvent[]>;
}

const EMPTY: AppState = { cylinders: {}, groups: {} };

export interface Store {
  getState(): AppState;
  appendCylinder(id: string, event: CylinderEvent): void;
  appendGroup(groupId: string, event: GroupEvent): void;
  subscribe(listener: () => void): () => void;
  reset(): void;
}

function load(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(EMPTY);
    const parsed = JSON.parse(raw) as PersistedShape;
    if (parsed.version !== STORAGE_VERSION) return structuredClone(EMPTY);
    return { cylinders: parsed.cylinders ?? {}, groups: parsed.groups ?? {} };
  } catch {
    return structuredClone(EMPTY);
  }
}

export function createStore(): Store {
  let state: AppState = load();
  const listeners = new Set<() => void>();

  function persist() {
    const payload: PersistedShape = {
      version: STORAGE_VERSION,
      cylinders: state.cylinders,
      groups: state.groups,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // 容量不足等情况下内存状态仍保持一致
    }
    listeners.forEach((l) => l());
  }

  return {
    getState: () => state,
    appendCylinder(id, event) {
      const next = structuredClone(state);
      next.cylinders[id] = [...(next.cylinders[id] ?? []), event];
      state = next;
      persist();
    },
    appendGroup(groupId, event) {
      const next = structuredClone(state);
      next.groups[groupId] = [...(next.groups[groupId] ?? []), event];
      state = next;
      persist();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    reset() {
      state = structuredClone(EMPTY);
      persist();
    },
  };
}
