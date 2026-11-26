// Persistence layer (localStorage). Everything stays on the device.
import { emptyState, STATE_VERSION, DEFAULT_SETTINGS } from "./core.js";

const KEY = "dispertador.state.v1";
const FIRED_KEY = "dispertador.fired.v1";

export function loadState(storage = globalThis.localStorage) {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.meds) || !Array.isArray(parsed.log)) return emptyState();
    return {
      version: STATE_VERSION,
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
      meds: parsed.meds,
      log: parsed.log,
      snoozes: parsed.snoozes && typeof parsed.snoozes === "object" ? parsed.snoozes : {},
    };
  } catch {
    return emptyState();
  }
}

export function saveState(state, storage = globalThis.localStorage) {
  storage.setItem(KEY, JSON.stringify(state));
}

export function loadFired(storage = globalThis.localStorage) {
  try {
    return JSON.parse(storage.getItem(FIRED_KEY) ?? "{}") ?? {};
  } catch {
    return {};
  }
}

export function saveFired(map, storage = globalThis.localStorage) {
  const cutoff = Date.now() - 3 * 24 * 3600 * 1000;
  const pruned = Object.fromEntries(Object.entries(map).filter(([, ts]) => ts > cutoff));
  storage.setItem(FIRED_KEY, JSON.stringify(pruned));
}
