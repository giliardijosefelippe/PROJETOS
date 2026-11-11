/**
 * Keeps the screen awake via Wake Lock API and optional Capacitor plugin.
 */

let wakeLock = null;
let enabled = true;

async function tryCapacitorKeepAwake(on) {
  try {
    const mod = await import("@capacitor-community/keep-awake");
    if (on) {
      await mod.KeepAwake.keepAwake();
    } else {
      await mod.KeepAwake.allowSleep();
    }
    return true;
  } catch {
    return false;
  }
}

export function isWakeEnabled() {
  return enabled;
}

export async function setWakeEnabled(on) {
  enabled = Boolean(on);
  if (!enabled) {
    if (wakeLock) {
      try {
        await wakeLock.release();
      } catch {
        /* ignore */
      }
      wakeLock = null;
    }
    await tryCapacitorKeepAwake(false);
    return { ok: true, mode: "off" };
  }

  const cap = await tryCapacitorKeepAwake(true);
  if (cap) {
    return { ok: true, mode: "capacitor" };
  }

  if (!("wakeLock" in navigator)) {
    return { ok: false, mode: "unsupported" };
  }

  try {
    const request = navigator.wakeLock.request("screen");
    const timeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("wake-lock-timeout")), 1500);
    });
    wakeLock = await Promise.race([request, timeout]);
    wakeLock.addEventListener("release", () => {
      wakeLock = null;
    });
    return { ok: true, mode: "wake-lock" };
  } catch (err) {
    return { ok: false, mode: "error", error: err };
  }
}

export function bindWakeVisibility() {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && enabled) {
      setWakeEnabled(true);
    }
  });
}
