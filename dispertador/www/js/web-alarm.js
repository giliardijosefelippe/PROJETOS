// Best-effort browser alarm: looping Web Audio beeps, vibration, wake lock, notifications.
// Browsers cannot guarantee any of this when the tab is closed/frozen: the APK is the reliable mode.

let ctx = null;
let master = null;
let beepTimer = null;
let vibTimer = null;
let wakeLock = null;
let ringing = false;

export function audioSupported() {
  return !!(globalThis.AudioContext || globalThis.webkitAudioContext);
}

/** Must be called from a user gesture at least once so the browser allows sound later. */
export async function unlockAudio() {
  if (!audioSupported()) return false;
  if (!ctx) {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 1;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp);
    comp.connect(ctx.destination);
  }
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      /* ignored */
    }
  }
  return ctx.state === "running";
}

export function audioReady() {
  return !!ctx && ctx.state === "running";
}

function beep(at, freq, dur) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = "square";
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(1, at + 0.01);
  g.gain.setValueAtTime(1, at + dur - 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(g);
  g.connect(master);
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

function playPattern() {
  if (!ctx || ctx.state !== "running") return;
  const t0 = ctx.currentTime + 0.05;
  // Digital-alarm-clock pattern: four fast beeps, then a pause (repeated every 2s).
  for (let i = 0; i < 4; i++) {
    beep(t0 + i * 0.22, 1568, 0.14);
    beep(t0 + i * 0.22 + 0.001, 1976, 0.14);
  }
}

async function requestWakeLock() {
  try {
    if ("wakeLock" in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => {
        wakeLock = null;
      });
    }
  } catch {
    wakeLock = null;
  }
}

export async function setKeepScreenOn(on) {
  if (on) {
    await requestWakeLock();
  } else if (wakeLock) {
    try {
      await wakeLock.release();
    } catch {
      /* ignored */
    }
    wakeLock = null;
  }
}

export function isRinging() {
  return ringing;
}

export function startRinging({ vibrate = true } = {}) {
  if (ringing) return;
  ringing = true;
  requestWakeLock();
  unlockAudio().then(() => {
    playPattern();
  });
  beepTimer = setInterval(playPattern, 2000);
  if (vibrate && "vibrate" in navigator) {
    const buzz = () => navigator.vibrate([600, 200, 600, 200, 600, 200, 1200]);
    buzz();
    vibTimer = setInterval(buzz, 3600);
  }
}

export function stopRinging() {
  ringing = false;
  clearInterval(beepTimer);
  clearInterval(vibTimer);
  beepTimer = vibTimer = null;
  if ("vibrate" in navigator) navigator.vibrate(0);
}

/** One short beep sequence to let the user check the volume. */
export async function testSound() {
  const ok = await unlockAudio();
  if (!ok) return false;
  playPattern();
  if ("vibrate" in navigator) navigator.vibrate([400, 150, 400]);
  return true;
}

export function notificationPermission() {
  return "Notification" in globalThis ? Notification.permission : "unsupported";
}

export async function askNotificationPermission() {
  if (!("Notification" in globalThis)) return "unsupported";
  if (Notification.permission === "default") {
    try {
      return await Notification.requestPermission();
    } catch {
      return Notification.permission;
    }
  }
  return Notification.permission;
}

/** Show a system notification (through the service worker when available). */
export async function showDoseNotification(doses) {
  if (notificationPermission() !== "granted") return;
  const first = doses[0];
  const title = doses.length > 1 ? `Hora dos remédios (${doses.length})` : `Hora do remédio: ${first.name}`;
  const body = doses.map((d) => (d.dose ? `${d.name} — ${d.dose}` : d.name)).join("\n");
  const options = {
    body,
    tag: "dispertador-alarm",
    renotify: true,
    requireInteraction: true,
    vibrate: [600, 200, 600, 200, 600, 200, 1200],
    icon: "icons/icon-192.png",
    badge: "icons/icon-192.png",
    data: { keys: doses.map((d) => d.key) },
    actions:
      doses.length === 1
        ? [
            { action: "taken", title: "Tomei" },
            { action: "snooze", title: "Adiar" },
          ]
        : [],
  };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.showNotification(title, options);
      return;
    }
    new Notification(title, options);
  } catch {
    /* ignored */
  }
}

export async function closeNotifications() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    const list = (await reg?.getNotifications({ tag: "dispertador-alarm" })) ?? [];
    list.forEach((n) => n.close());
  } catch {
    /* ignored */
  }
}

export function visibilityWakeLockHook() {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && (ringing || globalThis.__dispertadorKeepOn)) requestWakeLock();
  });
}
