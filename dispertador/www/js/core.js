// Dispertador core: pure scheduling/history logic (no DOM, no storage side effects).
// All times are epoch milliseconds in the device's local timezone semantics.

export const STATE_VERSION = 1;
export const MINUTE = 60 * 1000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** Unlogged doses older than this are materialized as "missed" in the history. */
export const MISSED_AFTER_MIN = 12 * 60;
/** Doses within this many minutes after the scheduled time are "due now"; after, "late". */
export const DEFAULT_TOLERANCE_MIN = 15;
export const ALARM_HORIZON_DAYS = 14;
export const MAX_ALARMS = 400;

export const DEFAULT_SETTINGS = Object.freeze({
  userName: "Giliardi",
  snoozeMinutes: 10,
  toleranceMin: DEFAULT_TOLERANCE_MIN,
  vibrate: true,
  keepScreenOn: true,
});

export const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function emptyState() {
  return {
    version: STATE_VERSION,
    settings: { ...DEFAULT_SETTINGS },
    meds: [],
    log: [],
    snoozes: {},
  };
}

const clone = (o) => JSON.parse(JSON.stringify(o));

export function newId() {
  const rnd = Math.random().toString(36).slice(2, 8);
  return `m${Date.now().toString(36)}${rnd}`;
}

export function pad2(n) {
  return String(n).padStart(2, "0");
}

export function parseTime(str) {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(str ?? "").trim());
  if (!m) return null;
  return { h: Number(m[1]), m: Number(m[2]) };
}

export function normalizeTime(str) {
  const t = parseTime(str);
  return t ? `${pad2(t.h)}:${pad2(t.m)}` : null;
}

export function dateKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function startOfDay(ms) {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
}

export function doseKey(medId, scheduledAt) {
  return `${medId}@${scheduledAt}`;
}

export function parseDoseKey(key) {
  const i = String(key).lastIndexOf("@");
  if (i < 1) return null;
  const scheduledAt = Number(key.slice(i + 1));
  if (!Number.isFinite(scheduledAt)) return null;
  return { medId: key.slice(0, i), scheduledAt };
}

/**
 * Validate and normalize user input for a medication.
 * Returns { ok, errors: string[] (pt-BR), value }.
 */
export function validateMedInput(input) {
  const errors = [];
  const name = String(input?.name ?? "").trim();
  const dose = String(input?.dose ?? "").trim();
  const notes = String(input?.notes ?? "").trim();
  if (!name) errors.push("Informe o nome do medicamento.");
  if (name.length > 80) errors.push("O nome deve ter no máximo 80 caracteres.");
  if (dose.length > 60) errors.push("A dose deve ter no máximo 60 caracteres.");
  if (notes.length > 500) errors.push("As observações devem ter no máximo 500 caracteres.");

  const rawTimes = Array.isArray(input?.times) ? input.times : [];
  const times = [];
  for (const t of rawTimes) {
    const n = normalizeTime(t);
    if (!n) {
      errors.push(`Horário inválido: "${t}".`);
      continue;
    }
    if (!times.includes(n)) times.push(n);
  }
  times.sort();
  if (times.length === 0 && !errors.some((e) => e.startsWith("Horário inválido"))) {
    errors.push("Adicione pelo menos um horário.");
  }

  const rawDays = Array.isArray(input?.days) ? input.days : [];
  const days = [];
  for (const d of rawDays) {
    const n = Number(d);
    if (!Number.isInteger(n) || n < 0 || n > 6) {
      errors.push("Dia da semana inválido.");
      continue;
    }
    if (!days.includes(n)) days.push(n);
  }
  days.sort((a, b) => a - b);

  return { ok: errors.length === 0, errors, value: { name, dose, notes, times, days: days.length === 7 ? [] : days } };
}

/** Occurrences (epoch ms) of a medication schedule within [fromMs, toMs). */
export function occurrencesBetween(med, fromMs, toMs) {
  const out = [];
  if (!med || toMs <= fromMs) return out;
  const lower = Math.max(fromMs, med.effectiveFrom ?? 0);
  if (toMs <= lower) return out;
  const times = (med.times ?? []).map(parseTime).filter(Boolean);
  if (times.length === 0) return out;
  const days = med.days ?? [];
  const first = new Date(startOfDay(lower));
  const lastDay = startOfDay(toMs);
  for (let d = new Date(first); d.getTime() <= lastDay; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    if (days.length > 0 && !days.includes(d.getDay())) continue;
    for (const t of times) {
      const ms = new Date(d.getFullYear(), d.getMonth(), d.getDate(), t.h, t.m, 0, 0).getTime();
      if (ms >= lower && ms < toMs) out.push(ms);
    }
  }
  return out.sort((a, b) => a - b);
}

/** Next occurrence strictly after afterMs (searches up to 15 days ahead). */
export function nextOccurrence(med, afterMs) {
  const list = occurrencesBetween(med, afterMs + 1, afterMs + 15 * DAY);
  return list.length ? list[0] : null;
}

function isActive(med) {
  return med.active !== false && !med.archivedAt;
}

function logIndex(state) {
  const idx = new Map();
  for (const e of state.log) idx.set(e.key, e);
  return idx;
}

function medById(state, id) {
  return state.meds.find((m) => m.id === id) ?? null;
}

/**
 * Write "missed" log entries for every unlogged past occurrence of a medication
 * since its effectiveFrom. Used before editing/pausing/archiving a medication so
 * that history is not rewritten by schedule changes.
 */
export function freezePast(state, medId, now, cutoffMs = now) {
  const med = medById(state, medId);
  if (!med || !isActive(med)) return state;
  const idx = logIndex(state);
  const from = Math.max(med.effectiveFrom ?? 0, now - 90 * DAY);
  for (const at of occurrencesBetween(med, from, cutoffMs)) {
    const key = doseKey(med.id, at);
    if (idx.has(key)) continue;
    state.log.push({
      key,
      medId: med.id,
      name: med.name,
      dose: med.dose,
      scheduledAt: at,
      status: "missed",
      actedAt: null,
    });
    delete state.snoozes[key];
  }
  return state;
}

/** Materialize old unlogged doses (older than MISSED_AFTER_MIN) as "missed". */
export function reconcile(inputState, now) {
  const state = clone(inputState);
  const cutoff = now - MISSED_AFTER_MIN * MINUTE;
  for (const med of state.meds) {
    if (isActive(med)) freezePast(state, med.id, now, cutoff);
  }
  for (const [key, until] of Object.entries(state.snoozes)) {
    if (until < now - DAY) delete state.snoozes[key];
  }
  return state;
}

export function addMed(inputState, input, now) {
  const v = validateMedInput(input);
  if (!v.ok) return { ok: false, errors: v.errors, state: inputState };
  const state = clone(inputState);
  const med = {
    id: newId(),
    ...v.value,
    active: true,
    createdAt: now,
    effectiveFrom: now,
    archivedAt: null,
  };
  state.meds.push(med);
  return { ok: true, errors: [], state, med };
}

export function updateMed(inputState, id, input, now) {
  const v = validateMedInput(input);
  if (!v.ok) return { ok: false, errors: v.errors, state: inputState };
  const state = clone(inputState);
  const med = medById(state, id);
  if (!med) return { ok: false, errors: ["Medicamento não encontrado."], state: inputState };
  freezePast(state, id, now);
  Object.assign(med, v.value, { effectiveFrom: now });
  return { ok: true, errors: [], state, med };
}

export function setMedActive(inputState, id, active, now) {
  const state = clone(inputState);
  const med = medById(state, id);
  if (!med || med.archivedAt) return state;
  if (!active && isActive(med)) freezePast(state, id, now);
  if (active && !isActive(med)) med.effectiveFrom = now;
  med.active = !!active;
  return state;
}

/** Soft-delete: keeps the medication and its history, removes it from schedules. */
export function archiveMed(inputState, id, now) {
  const state = clone(inputState);
  const med = medById(state, id);
  if (!med || med.archivedAt) return state;
  freezePast(state, id, now);
  med.archivedAt = now;
  med.active = false;
  return state;
}

export function updateSettings(inputState, patch) {
  const state = clone(inputState);
  const s = state.settings;
  if (patch.userName !== undefined) s.userName = String(patch.userName).trim().slice(0, 40) || DEFAULT_SETTINGS.userName;
  if (patch.snoozeMinutes !== undefined) {
    const n = Math.round(Number(patch.snoozeMinutes));
    if (Number.isFinite(n)) s.snoozeMinutes = Math.min(120, Math.max(1, n));
  }
  if (patch.toleranceMin !== undefined) {
    const n = Math.round(Number(patch.toleranceMin));
    if (Number.isFinite(n)) s.toleranceMin = Math.min(240, Math.max(1, n));
  }
  if (patch.vibrate !== undefined) s.vibrate = !!patch.vibrate;
  if (patch.keepScreenOn !== undefined) s.keepScreenOn = !!patch.keepScreenOn;
  return state;
}

/** Record a dose as "taken" or "skipped". Can overwrite a previous entry (e.g. retroactive). */
export function recordDose(inputState, key, status, now, actedAt = now) {
  if (status !== "taken" && status !== "skipped") return { ok: false, state: inputState, error: "Ação inválida." };
  const parsed = parseDoseKey(key);
  if (!parsed) return { ok: false, state: inputState, error: "Dose inválida." };
  const state = clone(inputState);
  const med = medById(state, parsed.medId);
  if (!med) return { ok: false, state: inputState, error: "Medicamento não encontrado." };
  state.log = state.log.filter((e) => e.key !== key);
  state.log.push({
    key,
    medId: med.id,
    name: med.name,
    dose: med.dose,
    scheduledAt: parsed.scheduledAt,
    status,
    actedAt,
  });
  delete state.snoozes[key];
  return { ok: true, state };
}

/** Remove a log entry (undo). A past dose then reappears as late/missed. */
export function undoDose(inputState, key) {
  const state = clone(inputState);
  state.log = state.log.filter((e) => e.key !== key);
  delete state.snoozes[key];
  return state;
}

export function snoozeDose(inputState, key, untilMs) {
  const state = clone(inputState);
  if (state.log.some((e) => e.key === key && (e.status === "taken" || e.status === "skipped"))) return state;
  state.snoozes[key] = untilMs;
  return state;
}

/**
 * Doses (scheduled + logged) in [fromMs, toMs) with a computed display status:
 * upcoming | due | snoozed | late | taken | skipped | missed
 */
export function getDoses(state, fromMs, toMs, now) {
  const tolerance = (state.settings?.toleranceMin ?? DEFAULT_TOLERANCE_MIN) * MINUTE;
  const idx = logIndex(state);
  const byKey = new Map();

  for (const e of state.log) {
    if (e.scheduledAt >= fromMs && e.scheduledAt < toMs) {
      const med = medById(state, e.medId);
      const delayMs = e.status === "taken" && e.actedAt != null ? e.actedAt - e.scheduledAt : null;
      byKey.set(e.key, {
        key: e.key,
        medId: e.medId,
        name: e.name,
        dose: e.dose,
        notes: med?.notes ?? "",
        scheduledAt: e.scheduledAt,
        status: e.status,
        actedAt: e.actedAt,
        takenLate: delayMs != null && delayMs > tolerance,
        delayMin: delayMs != null ? Math.round(delayMs / MINUTE) : null,
        snoozedUntil: null,
      });
    }
  }

  for (const med of state.meds) {
    if (!isActive(med)) continue;
    for (const at of occurrencesBetween(med, fromMs, toMs)) {
      const key = doseKey(med.id, at);
      if (idx.has(key) || byKey.has(key)) continue;
      const snoozedUntil = state.snoozes?.[key] ?? null;
      let status;
      if (at > now) status = "upcoming";
      else if (snoozedUntil && snoozedUntil > now) status = "snoozed";
      else if (now - at < tolerance) status = "due";
      else status = "late";
      byKey.set(key, {
        key,
        medId: med.id,
        name: med.name,
        dose: med.dose,
        notes: med.notes,
        scheduledAt: at,
        status,
        actedAt: null,
        takenLate: false,
        delayMin: null,
        snoozedUntil,
      });
    }
  }
  return [...byKey.values()].sort((a, b) => a.scheduledAt - b.scheduledAt || a.name.localeCompare(b.name, "pt-BR"));
}

export function dosesForDay(state, dayMs, now) {
  const start = startOfDay(dayMs);
  const end = new Date(new Date(start).getFullYear(), new Date(start).getMonth(), new Date(start).getDate() + 1).getTime();
  return getDoses(state, start, end, now);
}

/** Next pending (unlogged, not past-due) dose, taking snoozes into account. */
export function nextDose(state, now) {
  const doses = getDoses(state, now - MISSED_AFTER_MIN * MINUTE, now + 15 * DAY, now).filter(
    (d) => d.status === "upcoming" || d.status === "snoozed" || d.status === "due",
  );
  if (!doses.length) return null;
  return doses.sort((a, b) => alarmTime(state, a) - alarmTime(state, b))[0];
}

export function alarmTime(state, dose) {
  const s = state.snoozes?.[dose.key];
  return s && s > dose.scheduledAt ? s : dose.scheduledAt;
}

/** Doses that should be ringing right now (web mode): alarm time passed within `windowMin`. */
export function dosesToRing(state, now, windowMin = 30) {
  const from = now - (windowMin + (state.settings?.snoozeMinutes ?? 10) * 12) * MINUTE;
  return getDoses(state, from, now + MINUTE, now)
    .filter((d) => d.status === "due" || d.status === "late" || d.status === "snoozed" || d.status === "upcoming")
    .filter((d) => {
      const at = alarmTime(state, d);
      return at <= now && now - at < windowMin * MINUTE;
    });
}

/**
 * Alarm list handed to the native scheduler: every unlogged dose from the last
 * MISSED_AFTER_MIN until the horizon, with the effective alarm time (snooze aware).
 */
export function buildAlarmSchedule(state, now, horizonDays = ALARM_HORIZON_DAYS) {
  const doses = getDoses(state, now - MISSED_AFTER_MIN * MINUTE, now + horizonDays * DAY, now).filter(
    (d) => d.status !== "taken" && d.status !== "skipped" && d.status !== "missed",
  );
  return doses
    .map((d) => ({
      key: d.key,
      medId: d.medId,
      name: d.name,
      dose: d.dose,
      notes: d.notes,
      dueAt: d.scheduledAt,
      at: alarmTime(state, d),
    }))
    .sort((a, b) => a.at - b.at)
    .slice(0, MAX_ALARMS);
}

/** Apply events produced by the native alarm UI ({key, action, ts, until?}). */
export function applyNativeEvents(inputState, events, now) {
  let state = inputState;
  const sorted = [...(events ?? [])].sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
  for (const ev of sorted) {
    if (!ev || typeof ev.key !== "string") continue;
    if (ev.action === "taken" || ev.action === "skipped") {
      const r = recordDose(state, ev.key, ev.action, now, ev.ts ?? now);
      if (r.ok) state = r.state;
    } else if (ev.action === "snoozed" && Number.isFinite(ev.until)) {
      state = snoozeDose(state, ev.key, ev.until);
    }
  }
  return state;
}

/** Summary counters for a period. Adherence = taken / (taken + skipped + missed + late). */
export function summarize(doses) {
  const c = { taken: 0, takenLate: 0, skipped: 0, missed: 0, late: 0, pending: 0, total: doses.length };
  for (const d of doses) {
    if (d.status === "taken") {
      c.taken++;
      if (d.takenLate) c.takenLate++;
    } else if (d.status === "skipped") c.skipped++;
    else if (d.status === "missed") c.missed++;
    else if (d.status === "late") c.late++;
    else c.pending++;
  }
  const denom = c.taken + c.skipped + c.missed + c.late;
  c.adherence = denom > 0 ? Math.round((c.taken / denom) * 100) : null;
  return c;
}

export function exportState(state) {
  return JSON.stringify({ app: "dispertador", exportedAt: new Date().toISOString(), data: state }, null, 2);
}

/** Parse and sanitize a backup file. Returns { ok, state?, error? }. */
export function parseImport(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "Arquivo inválido (não é JSON)." };
  }
  const data = parsed?.app === "dispertador" ? parsed.data : parsed;
  if (!data || !Array.isArray(data.meds) || !Array.isArray(data.log)) {
    return { ok: false, error: "Arquivo não parece ser um backup do Dispertador." };
  }
  const state = emptyState();
  state.settings = { ...DEFAULT_SETTINGS, ...(data.settings ?? {}) };
  for (const m of data.meds) {
    const v = validateMedInput(m);
    if (!v.ok || typeof m.id !== "string" || !m.id) continue;
    state.meds.push({
      id: m.id,
      ...v.value,
      active: m.active !== false,
      createdAt: Number(m.createdAt) || 0,
      effectiveFrom: Number(m.effectiveFrom) || Number(m.createdAt) || 0,
      archivedAt: m.archivedAt ? Number(m.archivedAt) : null,
    });
  }
  for (const e of data.log) {
    if (!e || typeof e.key !== "string" || !["taken", "skipped", "missed"].includes(e.status)) continue;
    if (!Number.isFinite(e.scheduledAt)) continue;
    state.log.push({
      key: e.key,
      medId: String(e.medId ?? ""),
      name: String(e.name ?? ""),
      dose: String(e.dose ?? ""),
      scheduledAt: e.scheduledAt,
      status: e.status,
      actedAt: Number.isFinite(e.actedAt) ? e.actedAt : null,
    });
  }
  if (data.snoozes && typeof data.snoozes === "object") {
    for (const [k, v] of Object.entries(data.snoozes)) if (Number.isFinite(v)) state.snoozes[k] = v;
  }
  return { ok: true, state };
}
