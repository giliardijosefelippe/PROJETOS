// Bridge to the native Android alarm plugin (only available inside the Capacitor APK).
const cap = globalThis.Capacitor;

export const isNative = !!(cap && typeof cap.isNativePlatform === "function" && cap.isNativePlatform());

// The native bridge injects window.Capacitor.Plugins (no JS bundler needed).
const plugin = isNative && typeof cap.isPluginAvailable === "function" && cap.isPluginAvailable("DispertadorAlarm") ? cap.Plugins.DispertadorAlarm : null;

export function nativeAvailable() {
  return !!plugin;
}

/** Replace the native alarm schedule. */
export async function syncAlarms(alarms, settings) {
  if (!plugin) return null;
  return plugin.sync({ alarms, settings });
}

/** Pull (and clear) actions the user performed on the native alarm screen. */
export async function consumeEvents() {
  if (!plugin) return [];
  const r = await plugin.consumeEvents();
  return r?.events ?? [];
}

export async function getStatus() {
  if (!plugin) return null;
  return plugin.getStatus();
}

export async function openSettings(type) {
  if (!plugin) return;
  await plugin.openSettings({ type });
}

export async function testAlarm() {
  if (!plugin) return;
  await plugin.testAlarm();
}

export async function requestNotifications() {
  if (!plugin) return;
  await plugin.requestNotificationPermission();
}

export function onNativeEvent(handler) {
  if (!plugin) return;
  plugin.addListener("alarmEvent", handler);
}
