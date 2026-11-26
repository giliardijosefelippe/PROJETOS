import { test } from "node:test";
import assert from "node:assert/strict";
import * as core from "../www/js/core.js";
import { loadState, saveState } from "../www/js/store.js";

const at = (y, mo, d, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi, 0, 0).getTime();
// 2026-11-25 is a Wednesday (getDay() === 3)
const NOW = at(2026, 11, 25, 7, 0);

function withMed(input = {}, now = NOW) {
  const r = core.addMed(core.emptyState(), { name: "Losartana", dose: "50 mg", notes: "com água", times: ["08:00", "20:00"], days: [], ...input }, now);
  assert.ok(r.ok, r.errors?.join(","));
  return r;
}

test("cadastro: valida nome, horários e normaliza", () => {
  assert.equal(core.validateMedInput({ name: "", times: ["08:00"] }).ok, false);
  assert.equal(core.validateMedInput({ name: "X", times: [] }).ok, false);
  assert.equal(core.validateMedInput({ name: "X", times: ["25:00"] }).ok, false);
  const v = core.validateMedInput({ name: "  Dipirona ", times: ["8:05", "08:05", "20:00"], days: [3, 1, 3] });
  assert.ok(v.ok);
  assert.deepEqual(v.value.times, ["08:05", "20:00"]);
  assert.deepEqual(v.value.days, [1, 3]);
  assert.equal(v.value.name, "Dipirona");
  assert.deepEqual(core.validateMedInput({ name: "X", times: ["08:00"], days: [0, 1, 2, 3, 4, 5, 6] }).value.days, []);
});

test("cadastro: vários medicamentos, cada um com vários horários", () => {
  let s = core.emptyState();
  for (let i = 0; i < 5; i++) {
    const r = core.addMed(s, { name: `Med ${i}`, times: ["06:00", "12:00", "18:00", "23:30"] }, at(2026, 11, 25, 5, 0));
    assert.ok(r.ok);
    s = r.state;
  }
  assert.equal(s.meds.length, 5);
  const doses = core.dosesForDay(s, NOW, NOW);
  assert.equal(doses.length, 20);
});

test("agendamento: próximo horário hoje e depois de amanhã com dias da semana", () => {
  const { med } = withMed({ times: ["08:00", "20:00"] });
  assert.equal(core.nextOccurrence(med, NOW), at(2026, 11, 25, 8, 0));
  assert.equal(core.nextOccurrence(med, at(2026, 11, 25, 8, 0)), at(2026, 11, 25, 20, 0));
  assert.equal(core.nextOccurrence(med, at(2026, 11, 25, 20, 0)), at(2026, 11, 26, 8, 0));

  // Only Mondays (1) and Fridays (5): from Wed 25 -> Fri 27
  const { med: weekly } = withMed({ times: ["09:30"], days: [1, 5] });
  assert.equal(core.nextOccurrence(weekly, NOW), at(2026, 11, 27, 9, 30));
  assert.equal(core.nextOccurrence(weekly, at(2026, 11, 27, 9, 30)), at(2026, 11, 30, 9, 30));
});

test("agendamento: não gera doses antes do cadastro", () => {
  const later = at(2026, 11, 25, 15, 0);
  const { med } = withMed({ times: ["08:00", "20:00"] }, later);
  assert.deepEqual(core.occurrencesBetween(med, at(2026, 11, 25), at(2026, 11, 26)), [at(2026, 11, 25, 20, 0)]);
});

test("status das doses: agendado, na hora, atrasado", () => {
  const { state } = withMed({ times: ["08:00"] });
  const key = (n) => core.dosesForDay(state, NOW, n)[0].status;
  assert.equal(key(at(2026, 11, 25, 7, 30)), "upcoming");
  assert.equal(key(at(2026, 11, 25, 8, 5)), "due");
  assert.equal(key(at(2026, 11, 25, 9, 0)), "late");
});

test("histórico: tomado, pulado, atrasado e adesão", () => {
  const { state: s0 } = withMed({ times: ["08:00", "12:00", "16:00", "20:00"] });
  const doses = core.dosesForDay(s0, NOW, at(2026, 11, 25, 23, 0));
  let s = core.recordDose(s0, doses[0].key, "taken", at(2026, 11, 25, 8, 2), at(2026, 11, 25, 8, 2)).state;
  s = core.recordDose(s, doses[1].key, "taken", at(2026, 11, 25, 13, 0), at(2026, 11, 25, 13, 0)).state;
  s = core.recordDose(s, doses[2].key, "skipped", at(2026, 11, 25, 16, 1)).state;
  const now = at(2026, 11, 25, 22, 0);
  const day = core.dosesForDay(s, NOW, now);
  assert.deepEqual(day.map((d) => d.status), ["taken", "taken", "skipped", "late"]);
  assert.equal(day[0].takenLate, false);
  assert.equal(day[1].takenLate, true);
  assert.equal(day[1].delayMin, 60);
  const sum = core.summarize(day);
  assert.equal(sum.taken, 2);
  assert.equal(sum.takenLate, 1);
  assert.equal(sum.skipped, 1);
  assert.equal(sum.late, 1);
  assert.equal(sum.adherence, 50);

  // retroactive undo goes back to late
  const undone = core.undoDose(s, doses[0].key);
  assert.equal(core.dosesForDay(undone, NOW, now)[0].status, "late");
});

test("reconcile: doses antigas sem registro viram 'missed' e persistem", () => {
  const { state } = withMed({ times: ["08:00"] });
  const later = at(2026, 11, 27, 6, 0);
  const r = core.reconcile(state, later);
  const missed = r.log.filter((e) => e.status === "missed");
  assert.equal(missed.length, 2); // 25 and 26 at 08:00; 27 at 08:00 is still in the future
  assert.equal(core.reconcile(r, later).log.length, 2);
  const hist = core.getDoses(r, at(2026, 11, 25), later, later);
  assert.deepEqual(hist.map((d) => d.status), ["missed", "missed"]);
});

test("editar horários não reescreve o histórico passado", () => {
  const { state, med } = withMed({ times: ["08:00"] });
  const later = at(2026, 11, 26, 10, 0);
  const upd = core.updateMed(state, med.id, { name: "Losartana", dose: "100 mg", times: ["21:00"], days: [] }, later);
  assert.ok(upd.ok);
  const past = core.getDoses(upd.state, at(2026, 11, 25), at(2026, 11, 26, 9), later);
  assert.deepEqual(past.map((d) => [d.status, d.dose]), [["missed", "50 mg"], ["missed", "50 mg"]]);
  const future = core.getDoses(upd.state, later, at(2026, 11, 27), later);
  assert.deepEqual(future.map((d) => fmt(d.scheduledAt)), ["21:00"]);
});

const fmt = (ms) => new Date(ms).toTimeString().slice(0, 5);

test("excluir arquiva: histórico fica, agenda some", () => {
  const { state, med } = withMed({ times: ["08:00"] });
  const doses = core.dosesForDay(state, NOW, NOW);
  const s1 = core.recordDose(state, doses[0].key, "taken", at(2026, 11, 25, 8, 1)).state;
  const s2 = core.archiveMed(s1, med.id, at(2026, 11, 25, 12, 0));
  assert.equal(s2.meds.length, 1);
  assert.ok(s2.meds[0].archivedAt);
  assert.equal(core.getDoses(s2, at(2026, 11, 26), at(2026, 11, 30), NOW).length, 0);
  assert.equal(core.getDoses(s2, at(2026, 11, 25), at(2026, 11, 26), at(2026, 11, 25, 13)).filter((d) => d.status === "taken").length, 1);
  assert.equal(core.buildAlarmSchedule(s2, at(2026, 11, 25, 13)).length, 0);
});

test("soneca: próximo alarme considera o adiamento", () => {
  const { state } = withMed({ times: ["08:00"] });
  const now = at(2026, 11, 25, 8, 0);
  const d = core.dosesForDay(state, now, now)[0];
  const s = core.snoozeDose(state, d.key, now + 10 * core.MINUTE);
  assert.equal(core.getDoses(s, at(2026, 11, 25), at(2026, 11, 26), now + 1000)[0].status, "snoozed");
  const sched = core.buildAlarmSchedule(s, now + 1000);
  const entry = sched.find((e) => e.key === d.key);
  assert.equal(entry.at, now + 10 * core.MINUTE);
  assert.equal(entry.dueAt, at(2026, 11, 25, 8, 0));
  // after snooze expires and no action it is "due" again and rings
  assert.equal(core.dosesToRing(s, now + 10 * core.MINUTE + 1000).length, 1);
  // snooze is cleared when the dose is taken
  const taken = core.recordDose(s, d.key, "taken", now + 11 * core.MINUTE).state;
  assert.equal(taken.snoozes[d.key], undefined);
});

test("dosesToRing: toca na hora e não toca dose antiga demais", () => {
  const { state } = withMed({ times: ["08:00"] });
  assert.equal(core.dosesToRing(state, at(2026, 11, 25, 7, 59)).length, 0);
  assert.equal(core.dosesToRing(state, at(2026, 11, 25, 8, 0)).length, 1);
  assert.equal(core.dosesToRing(state, at(2026, 11, 25, 8, 20)).length, 1);
  assert.equal(core.dosesToRing(state, at(2026, 11, 25, 15, 0)).length, 0);
});

test("agenda nativa: lista doses pendentes dentro do horizonte, ordenadas e limitadas", () => {
  const { state } = withMed({ times: ["08:00", "20:00"] });
  const sched = core.buildAlarmSchedule(state, NOW, 3);
  assert.equal(sched.length, 6);
  assert.deepEqual(sched.map((s) => s.at), [...sched.map((s) => s.at)].sort((a, b) => a - b));
  assert.ok(sched.every((s) => s.name === "Losartana" && s.dose === "50 mg"));
  const big = core.emptyState();
  let s = big;
  for (let i = 0; i < 10; i++) s = core.addMed(s, { name: `M${i}`, times: ["01:00", "05:00", "09:00", "13:00", "17:00", "21:00"] }, NOW).state;
  assert.equal(core.buildAlarmSchedule(s, NOW).length, core.MAX_ALARMS);
});

test("eventos nativos: tomei/pular/adiar aplicam no histórico", () => {
  const { state } = withMed({ times: ["08:00", "12:00", "20:00"] });
  const d = core.dosesForDay(state, NOW, NOW);
  const ts = at(2026, 11, 25, 8, 1);
  const s = core.applyNativeEvents(
    state,
    [
      { key: d[0].key, action: "snoozed", ts, until: ts + 10 * core.MINUTE },
      { key: d[0].key, action: "taken", ts: ts + 11 * core.MINUTE },
      { key: d[1].key, action: "skipped", ts: at(2026, 11, 25, 12, 1) },
      { key: d[2].key, action: "snoozed", ts: at(2026, 11, 25, 20, 1), until: at(2026, 11, 25, 20, 11) },
      { key: "teste@123", action: "taken", ts },
    ],
    at(2026, 11, 25, 20, 2),
  );
  const out = core.dosesForDay(s, NOW, at(2026, 11, 25, 20, 5));
  assert.deepEqual(out.map((x) => x.status), ["taken", "skipped", "snoozed"]);
  assert.equal(out[0].actedAt, ts + 11 * core.MINUTE);
  assert.equal(out[2].snoozedUntil, at(2026, 11, 25, 20, 11));
});

test("pausar/retomar: sem alarmes enquanto pausado", () => {
  const { state, med } = withMed({ times: ["08:00"] });
  const paused = core.setMedActive(state, med.id, false, NOW);
  assert.equal(core.buildAlarmSchedule(paused, NOW).length, 0);
  const resumed = core.setMedActive(paused, med.id, true, at(2026, 11, 26, 1, 0));
  assert.ok(core.buildAlarmSchedule(resumed, at(2026, 11, 26, 1, 0)).length > 0);
});

test("backup: exportar e importar preserva dados; rejeita lixo", () => {
  const { state } = withMed({ times: ["08:00"] });
  const d = core.dosesForDay(state, NOW, NOW)[0];
  const s = core.recordDose(state, d.key, "taken", NOW).state;
  const r = core.parseImport(core.exportState(s));
  assert.ok(r.ok);
  assert.equal(r.state.meds.length, 1);
  assert.equal(r.state.log.length, 1);
  assert.equal(core.parseImport("não é json").ok, false);
  assert.equal(core.parseImport('{"foo":1}').ok, false);
});

test("persistência: salva e recarrega do storage", () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.equal(loadState(storage).meds.length, 0);
  const { state } = withMed();
  saveState(state, storage);
  const loaded = loadState(storage);
  assert.equal(loaded.meds[0].name, "Losartana");
  assert.equal(loaded.settings.userName, "Giliardi");
  storage.setItem("dispertador.state.v1", "{corrompido");
  assert.equal(loadState(storage).meds.length, 0);
});

test("configurações: limites de soneca", () => {
  let s = core.updateSettings(core.emptyState(), { snoozeMinutes: 0 });
  assert.equal(s.settings.snoozeMinutes, 1);
  s = core.updateSettings(s, { snoozeMinutes: 9999 });
  assert.equal(s.settings.snoozeMinutes, 120);
});
