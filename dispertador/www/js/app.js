import * as core from "./core.js";
import { loadState, saveState, loadFired, saveFired } from "./store.js";
import * as native from "./native.js";
import * as web from "./web-alarm.js";

const $ = (sel, root = document) => root.querySelector(sel);
const view = $("#view");
const modal = $("#modal");
const ringEl = $("#ring");
const toastEl = $("#toast");

let state = core.reconcile(loadState(), Date.now());
let tab = location.hash.replace("#", "") || "hoje";
let historyDays = 7;
let nativeStatus = null;
let fired = loadFired();
let ringingKeys = [];
let toastTimer = null;
const NATIVE = native.isNative && native.nativeAvailable();

/* ---------- helpers ---------- */

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === false || v == null) continue;
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

const fmtTime = (ms) => new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const fmtDay = (ms) => new Date(ms).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
const fmtDayShort = (ms) => new Date(ms).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });

function fmtRelative(ms, now) {
  const diff = Math.round((ms - now) / core.MINUTE);
  if (diff <= 0) return "agora";
  if (diff < 60) return `em ${diff} min`;
  const hrs = Math.floor(diff / 60);
  const min = diff % 60;
  if (hrs < 24) return min ? `em ${hrs} h ${min} min` : `em ${hrs} h`;
  const days = Math.floor(hrs / 24);
  return `em ${days} dia${days > 1 ? "s" : ""}`;
}

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastEl.hidden = true), 3200);
}

function daysLabel(med) {
  if (!med.days || med.days.length === 0) return "Todos os dias";
  return med.days.map((d) => core.WEEKDAY_LABELS[d]).join(", ");
}

const STATUS_LABEL = {
  upcoming: "Agendado",
  due: "Na hora",
  snoozed: "Adiado",
  late: "Atrasado",
  taken: "Tomado",
  skipped: "Pulado",
  missed: "Atrasado (sem registro)",
};

function statusBadge(d) {
  let text = STATUS_LABEL[d.status];
  if (d.status === "taken") {
    text = d.takenLate ? `Tomado com atraso (${d.delayMin} min)` : `Tomado às ${fmtTime(d.actedAt)}`;
  }
  if (d.status === "snoozed" && d.snoozedUntil) text = `Adiado até ${fmtTime(d.snoozedUntil)}`;
  return h("span", { class: `badge ${d.status}`, text });
}

/* ---------- state mutations ---------- */

function commit(next, { silent = false } = {}) {
  state = next;
  saveState(state);
  syncNative();
  if (!silent) render();
}

async function syncNative() {
  if (!NATIVE) return;
  try {
    const now = Date.now();
    await native.syncAlarms(core.buildAlarmSchedule(state, now), {
      snoozeMinutes: state.settings.snoozeMinutes,
      vibrate: state.settings.vibrate,
      maxVolume: true,
      ringTimeoutSec: 120,
      repeatMinutes: 5,
      maxRepeats: 5,
    });
  } catch (e) {
    console.error("syncNative", e);
  }
}

async function pullNativeEvents() {
  if (!NATIVE) return;
  try {
    const events = await native.consumeEvents();
    if (events.length) {
      state = core.applyNativeEvents(state, events, Date.now());
    }
    state = core.reconcile(state, Date.now());
    saveState(state);
    nativeStatus = await native.getStatus();
    await syncNative();
    render();
  } catch (e) {
    console.error("pullNativeEvents", e);
  }
}

function act(key, status) {
  const r = core.recordDose(state, key, status, Date.now());
  if (!r.ok) return toast(r.error);
  commit(r.state);
  closeRing(key);
}

function snooze(key) {
  const until = Date.now() + state.settings.snoozeMinutes * core.MINUTE;
  delete fired[key];
  saveFired(fired);
  commit(core.snoozeDose(state, key, until));
  closeRing(key);
  toast(`Adiado por ${state.settings.snoozeMinutes} min.`);
}

/* ---------- views ---------- */

function renderAlarmStatus(now) {
  if (NATIVE) {
    const s = nativeStatus;
    const items = [];
    if (s) {
      items.push(["Notificações", s.notifications, "notifications", "Permitir"]);
      items.push(["Alarmes exatos", s.exactAlarm, "exactAlarm", "Permitir"]);
      items.push(["Alarme em tela cheia", s.fullScreen, "fullScreen", "Permitir"]);
      items.push(["Bateria sem restrição (recomendado)", s.batteryUnrestricted, "battery", "Liberar"]);
    }
    const allOk = !s || items.filter((i) => i[2] !== "battery").every((i) => i[1]);
    return h(
      "section",
      { class: `card ${allOk ? "" : "warn"}` },
      h("div", { class: "title", text: allOk ? "Alarme nativo ativo" : "Atenção: o alarme pode falhar" }),
      h("div", {
        class: "muted",
        text: allOk
          ? `${s?.scheduled ?? 0} alarme(s) agendado(s) no Android. Toca mesmo com o app fechado. Para não ser interrompido pelo sistema, libere o uso de bateria sem restrição.`
          : "Conceda as permissões abaixo para o alarme tocar de forma confiável.",
      }),
      ...items.map(([label, ok, type, cta]) =>
        h(
          "div",
          { class: "perm" },
          h("span", { class: `dot ${ok ? "" : "bad"}` }),
          h("span", { class: "grow", text: label }),
          ok
            ? h("span", { class: "muted", text: "OK" })
            : h("button", { class: "btn small amber", text: cta, onClick: () => native.openSettings(type) }),
        ),
      ),
      h("div", { class: "actions" }, h("button", { class: "btn small", text: "Testar alarme (8 s)", onClick: runNativeTest })),
    );
  }

  const perm = web.notificationPermission();
  const needsAudio = !web.audioReady();
  return h(
    "section",
    { class: "card warn" },
    h("div", { class: "title", text: "Modo navegador (limitado)" }),
    h("div", {
      class: "muted",
      style: "color:inherit",
      text: "No navegador o alarme só toca com esta página aberta e o celular ativo. Para um alarme confiável (tela bloqueada, app fechado, após reiniciar) use o APK.",
    }),
    h(
      "div",
      { class: "actions" },
      needsAudio &&
        h("button", {
          class: "btn small primary",
          text: "Ativar som do alarme",
          onClick: async () => {
            await web.unlockAudio();
            await web.askNotificationPermission();
            render();
          },
        }),
      !needsAudio &&
        perm === "default" &&
        h("button", {
          class: "btn small primary",
          text: "Ativar notificações",
          onClick: async () => {
            await web.askNotificationPermission();
            render();
          },
        }),
      h("button", {
        class: "btn small",
        text: "Testar som",
        onClick: async () => {
          const ok = await web.testSound();
          toast(ok ? "Tocando teste de som." : "Toque em “Ativar som do alarme” primeiro.");
          render();
        },
      }),
    ),
    h("div", {
      class: "muted",
      style: "color:inherit;margin-top:6px",
      text: `Som: ${web.audioReady() ? "ativado" : "desativado"} · Notificações: ${perm === "granted" ? "ativadas" : perm === "denied" ? "bloqueadas" : perm === "unsupported" ? "sem suporte" : "pendentes"}`,
    }),
  );
}

async function runNativeTest() {
  try {
    await native.requestNotifications();
    await native.testAlarm();
    toast("Alarme de teste em 8 segundos. Bloqueie a tela para testar a tela cheia.");
  } catch (e) {
    toast("Não foi possível agendar o teste.");
  }
}

function doseRow(d, now, { retro = false } = {}) {
  const actions = [];
  const canAct = d.status === "due" || d.status === "late" || d.status === "snoozed" || d.status === "upcoming";
  if (canAct) {
    actions.push(h("button", { class: "btn small ok", text: "Tomei", onClick: () => act(d.key, "taken") }));
    if (d.status !== "upcoming") {
      actions.push(h("button", { class: "btn small amber", text: `Adiar ${state.settings.snoozeMinutes} min`, onClick: () => snooze(d.key) }));
    }
    actions.push(h("button", { class: "btn small", text: "Pular", onClick: () => act(d.key, "skipped") }));
  } else if (d.status === "missed") {
    actions.push(h("button", { class: "btn small ok", text: "Tomei", onClick: () => act(d.key, "taken") }));
    actions.push(h("button", { class: "btn small", text: "Pulei", onClick: () => act(d.key, "skipped") }));
  } else {
    actions.push(
      h("button", {
        class: "btn small",
        text: "Desfazer",
        onClick: () => {
          commit(core.undoDose(state, d.key));
        },
      }),
    );
  }
  void retro;
  return h(
    "div",
    { class: "card" },
    h(
      "div",
      { class: "row" },
      h("div", { class: "time", text: fmtTime(d.scheduledAt) }),
      h(
        "div",
        { class: "grow" },
        h("div", { class: "title", text: d.dose ? `${d.name} — ${d.dose}` : d.name }),
        d.notes && h("div", { class: "muted", text: d.notes }),
      ),
      statusBadge(d),
    ),
    h("div", { class: "actions" }, ...actions),
  );
}

function renderToday() {
  const now = Date.now();
  const startToday = core.startOfDay(now);
  const endToday = new Date(new Date(startToday).getFullYear(), new Date(startToday).getMonth(), new Date(startToday).getDate() + 1).getTime();
  const from = Math.min(startToday, now - core.MISSED_AFTER_MIN * core.MINUTE);
  const doses = core.getDoses(state, from, endToday, now);
  const stats = core.summarize(doses.filter((d) => d.scheduledAt >= startToday));
  const next = core.nextDose(state, now);

  const root = h("div");
  root.append(
    h("h1", { text: `Olá, ${state.settings.userName}` }),
    h("p", { class: "sub", text: fmtDay(now) }),
    renderAlarmStatus(now),
  );

  if (state.meds.filter((m) => m.active && !m.archivedAt).length === 0) {
    root.append(
      h(
        "div",
        { class: "empty card" },
        h("p", { text: "Você ainda não cadastrou nenhum medicamento." }),
        h("button", { class: "btn primary", text: "Cadastrar primeiro medicamento", onClick: () => openMedForm() }),
      ),
    );
    return root;
  }

  if (next) {
    const at = core.alarmTime(state, next);
    root.append(
      h(
        "section",
        { class: "card next" },
        h("div", { class: "muted", text: "Próximo alarme" }),
        h("div", { class: "title", text: next.dose ? `${next.name} — ${next.dose}` : next.name }),
        h("div", {
          text:
            at <= now
              ? `Hora de tomar (${fmtTime(at)}). Registre quando tomar.`
              : `${new Date(at).toDateString() === new Date(now).toDateString() ? "Hoje" : fmtDayShort(at)} às ${fmtTime(at)} (${fmtRelative(at, now)})`,
        }),
      ),
    );
  } else {
    root.append(h("section", { class: "card" }, h("div", { class: "title", text: "Nenhum alarme futuro agendado." })));
  }

  root.append(
    h(
      "div",
      { class: "stats" },
      stat(stats.taken, "Tomados"),
      stat(stats.skipped, "Pulados"),
      stat(stats.late + stats.missed, "Atrasados"),
      stat(stats.pending, "A tomar"),
    ),
  );

  const pendingEarlier = doses.filter((d) => d.scheduledAt < startToday);
  if (pendingEarlier.length) {
    root.append(h("h2", { text: "Pendentes de ontem" }), ...pendingEarlier.map((d) => doseRow(d, now)));
  }
  const todays = doses.filter((d) => d.scheduledAt >= startToday);
  root.append(h("h2", { text: "Hoje" }));
  if (todays.length === 0) root.append(h("div", { class: "empty", text: "Nenhuma dose programada para hoje." }));
  else root.append(...todays.map((d) => doseRow(d, now)));
  return root;
}

function stat(n, label) {
  return h("div", { class: "stat" }, h("b", { text: n }), h("span", { text: label }));
}

function renderMeds() {
  const root = h("div");
  root.append(h("h1", { text: "Meus remédios" }));
  const meds = state.meds.filter((m) => !m.archivedAt);
  if (meds.length === 0) {
    root.append(h("div", { class: "empty", text: "Nenhum medicamento cadastrado. Toque em “Novo remédio”." }));
  }
  for (const m of meds) {
    root.append(
      h(
        "div",
        { class: "card" },
        h(
          "div",
          { class: "row" },
          h(
            "div",
            { class: "grow" },
            h("div", { class: "title", text: m.name }),
            m.dose && h("div", { text: m.dose }),
            m.notes && h("div", { class: "muted", text: m.notes }),
          ),
          !m.active && h("span", { class: "badge", text: "Pausado" }),
        ),
        h("div", { class: "chips" }, ...m.times.map((t) => h("span", { class: "chip", text: t })), h("span", { class: "chip", text: daysLabel(m) })),
        h(
          "div",
          { class: "actions" },
          h("button", { class: "btn small", text: "Editar", onClick: () => openMedForm(m) }),
          h("button", {
            class: "btn small",
            text: m.active ? "Pausar" : "Retomar",
            onClick: () => commit(core.setMedActive(state, m.id, !m.active, Date.now())),
          }),
          h("button", {
            class: "btn small danger",
            text: "Excluir",
            onClick: () => {
              if (confirm(`Excluir “${m.name}”? O histórico das doses é mantido.`)) {
                commit(core.archiveMed(state, m.id, Date.now()));
                toast("Medicamento removido (histórico preservado).");
              }
            },
          }),
        ),
      ),
    );
  }
  root.append(h("button", { class: "btn primary fab", text: "+ Novo remédio", onClick: () => openMedForm() }));
  return root;
}

function renderHistory() {
  const now = Date.now();
  const from = core.startOfDay(now - (historyDays - 1) * core.DAY);
  const doses = core.getDoses(state, from, now + 1, now).filter((d) => d.status !== "upcoming");
  const sum = core.summarize(doses);
  const root = h("div");
  root.append(
    h("h1", { text: "Histórico" }),
    h(
      "label",
      { class: "field" },
      "Período",
      h(
        "select",
        {
          onChange: (e) => {
            historyDays = Number(e.target.value);
            render();
          },
        },
        ...[7, 30, 90].map((n) => h("option", { value: n, selected: n === historyDays, text: `Últimos ${n} dias` })),
      ),
    ),
    h(
      "div",
      { class: "stats", style: "margin-top:12px" },
      stat(sum.adherence == null ? "—" : `${sum.adherence}%`, "Adesão"),
      stat(sum.taken, "Tomados"),
      stat(sum.skipped, "Pulados"),
      stat(sum.late + sum.missed, "Atrasados"),
    ),
  );
  if (doses.length === 0) {
    root.append(h("div", { class: "empty", text: "Sem doses registradas neste período." }));
    return root;
  }
  const groups = new Map();
  for (const d of [...doses].reverse()) {
    const k = core.dateKey(d.scheduledAt);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(d);
  }
  for (const list of groups.values()) {
    root.append(h("div", { class: "history-day", text: fmtDay(list[0].scheduledAt) }));
    for (const d of list.reverse()) root.append(doseRow(d, now, { retro: true }));
  }
  return root;
}

function renderSettings() {
  const s = state.settings;
  const root = h("div");
  root.append(
    h("h1", { text: "Ajustes" }),
    h(
      "div",
      { class: "card" },
      h("label", { class: "field" }, "Seu nome", h("input", { type: "text", maxlength: 40, value: s.userName, onChange: (e) => commit(core.updateSettings(state, { userName: e.target.value })) })),
      h(
        "label",
        { class: "field" },
        "Tempo da soneca (Adiar)",
        h(
          "select",
          { onChange: (e) => commit(core.updateSettings(state, { snoozeMinutes: e.target.value })) },
          ...[1, 5, 10, 15, 20, 30, 60].map((n) => h("option", { value: n, selected: n === s.snoozeMinutes, text: `${n} min` })),
        ),
      ),
      h(
        "label",
        { class: "field" },
        "Considerar “atrasado” após",
        h(
          "select",
          { onChange: (e) => commit(core.updateSettings(state, { toleranceMin: e.target.value })) },
          ...[5, 10, 15, 30, 60].map((n) => h("option", { value: n, selected: n === s.toleranceMin, text: `${n} min` })),
        ),
      ),
      h(
        "label",
        { class: "switch" },
        h("span", { text: "Vibração" }),
        h("input", { type: "checkbox", checked: s.vibrate, onChange: (e) => commit(core.updateSettings(state, { vibrate: e.target.checked })) }),
      ),
      !NATIVE &&
        h(
          "label",
          { class: "switch" },
          h("span", { text: "Manter tela acesa com o app aberto" }),
          h("input", {
            type: "checkbox",
            checked: s.keepScreenOn,
            onChange: (e) => {
              commit(core.updateSettings(state, { keepScreenOn: e.target.checked }));
              applyWakeLockSetting();
            },
          }),
        ),
    ),
    h(
      "div",
      { class: "card" },
      h("div", { class: "title", text: "Alarme" }),
      h("div", {
        class: "muted",
        text: NATIVE
          ? "Alarme nativo do Android: som alto em loop no volume de alarme (no máximo), vibração, tela cheia, insistência (volta a tocar a cada 5 min, até 5 vezes, se ignorado)."
          : "Alarme do navegador: som em loop e vibração enquanto a página estiver aberta. Para alarme confiável, instale o APK.",
      }),
      h(
        "div",
        { class: "actions" },
        h("button", { class: "btn small primary", text: NATIVE ? "Testar alarme (8 s)" : "Testar alarme agora", onClick: () => (NATIVE ? runNativeTest() : testWebAlarm()) }),
        NATIVE && h("button", { class: "btn small", text: "Configurações do app", onClick: () => native.openSettings("app") }),
      ),
    ),
    h(
      "div",
      { class: "card" },
      h("div", { class: "title", text: "Backup dos dados" }),
      h("div", { class: "muted", text: "Os dados ficam só neste aparelho. Exporte para guardar uma cópia ou restaurar em outro aparelho." }),
      h("div", { class: "actions" }, h("button", { class: "btn small", text: "Exportar / restaurar", onClick: openBackup })),
    ),
    h("p", { class: "muted", text: "Dispertador 0.1.0 · lembrete de medicamentos, não substitui orientação médica." }),
  );
  return root;
}

function testWebAlarm() {
  const now = Date.now();
  const fake = [{ key: `teste@${now}`, medId: "teste", name: "Alarme de teste", dose: "Está tudo funcionando", notes: "", scheduledAt: now }];
  showRing(fake, true);
}

/* ---------- med form ---------- */

function openMedForm(med = null) {
  const form = {
    name: med?.name ?? "",
    dose: med?.dose ?? "",
    notes: med?.notes ?? "",
    times: med?.times?.length ? [...med.times] : ["08:00"],
    days: med?.days ? [...med.days] : [],
  };
  const errorsBox = h("div", { class: "errors", hidden: true });
  const timesBox = h("div");
  const daysBox = h("div", { class: "days" });

  const drawTimes = () => {
    timesBox.replaceChildren(
      ...form.times.map((t, i) =>
        h(
          "div",
          { class: "time-row" },
          h("input", {
            type: "time",
            value: t,
            required: true,
            "aria-label": `Horário ${i + 1}`,
            onChange: (e) => (form.times[i] = e.target.value),
          }),
          h("button", {
            type: "button",
            class: "btn small",
            text: "Remover",
            disabled: form.times.length === 1,
            onClick: () => {
              form.times.splice(i, 1);
              drawTimes();
            },
          }),
        ),
      ),
      h("button", {
        type: "button",
        class: "btn small",
        style: "margin-top:8px",
        text: "+ Adicionar horário",
        onClick: () => {
          form.times.push("12:00");
          drawTimes();
        },
      }),
    );
  };
  const drawDays = () => {
    daysBox.replaceChildren(
      ...core.WEEKDAY_LABELS.map((label, d) =>
        h("button", {
          type: "button",
          class: "day",
          text: label,
          "aria-pressed": String(form.days.includes(d)),
          onClick: () => {
            form.days = form.days.includes(d) ? form.days.filter((x) => x !== d) : [...form.days, d];
            drawDays();
          },
        }),
      ),
    );
  };
  drawTimes();
  drawDays();

  const submit = (e) => {
    e.preventDefault();
    const input = { ...form };
    const r = med ? core.updateMed(state, med.id, input, Date.now()) : core.addMed(state, input, Date.now());
    if (!r.ok) {
      errorsBox.hidden = false;
      errorsBox.replaceChildren(...r.errors.map((m) => h("div", { text: m })));
      return;
    }
    modal.close();
    commit(r.state);
    toast(med ? "Medicamento atualizado." : "Medicamento cadastrado.");
    if (NATIVE) native.requestNotifications();
    else web.askNotificationPermission();
  };

  modal.replaceChildren(
    h(
      "form",
      { onSubmit: submit },
      h("h1", { text: med ? "Editar medicamento" : "Novo medicamento" }),
      h("label", { class: "field" }, "Nome", h("input", { type: "text", maxlength: 80, required: true, value: form.name, placeholder: "Ex.: Losartana", onInput: (e) => (form.name = e.target.value) })),
      h("label", { class: "field" }, "Dose", h("input", { type: "text", maxlength: 60, value: form.dose, placeholder: "Ex.: 1 comprimido de 50 mg", onInput: (e) => (form.dose = e.target.value) })),
      h("label", { class: "field" }, "Observações", h("textarea", { maxlength: 500, placeholder: "Ex.: tomar com água, após o café", onInput: (e) => (form.notes = e.target.value) }, form.notes)),
      h("div", { class: "field" }, "Horários", timesBox),
      h("div", { class: "field" }, "Dias da semana (nenhum marcado = todos os dias)", daysBox),
      errorsBox,
      h(
        "div",
        { class: "actions", style: "margin-top:16px" },
        h("button", { type: "submit", class: "btn primary", text: "Salvar" }),
        h("button", { type: "button", class: "btn", text: "Cancelar", onClick: () => modal.close() }),
      ),
    ),
  );
  modal.showModal();
}

function openBackup() {
  const area = h("textarea", { class: "backup", "aria-label": "Backup em JSON" }, core.exportState(state));
  const msg = h("div", { class: "muted" });
  const fileInput = h("input", {
    type: "file",
    accept: "application/json,.json",
    hidden: true,
    onChange: async (e) => {
      const f = e.target.files?.[0];
      if (f) area.value = await f.text();
    },
  });
  modal.replaceChildren(
    h(
      "div",
      {},
      h("h1", { text: "Backup dos dados" }),
      h("p", { class: "muted", text: "Copie o texto abaixo para guardar. Para restaurar, cole um backup aqui e toque em “Restaurar” (isto substitui os dados atuais)." }),
      area,
      fileInput,
      msg,
      h(
        "div",
        { class: "actions" },
        h("button", {
          class: "btn small",
          text: "Copiar",
          onClick: async () => {
            try {
              await navigator.clipboard.writeText(area.value);
              msg.textContent = "Copiado.";
            } catch {
              area.select();
              msg.textContent = "Selecione e copie o texto manualmente.";
            }
          },
        }),
        h("button", {
          class: "btn small",
          text: "Baixar arquivo",
          onClick: () => {
            const a = h("a", { href: URL.createObjectURL(new Blob([area.value], { type: "application/json" })), download: `dispertador-backup-${core.dateKey(Date.now())}.json` });
            document.body.append(a);
            a.click();
            a.remove();
          },
        }),
        h("button", { class: "btn small", text: "Escolher arquivo…", onClick: () => fileInput.click() }),
        h("button", {
          class: "btn small danger",
          text: "Restaurar",
          onClick: () => {
            const r = core.parseImport(area.value);
            if (!r.ok) {
              msg.textContent = r.error;
              return;
            }
            if (!confirm("Substituir todos os dados atuais por este backup?")) return;
            modal.close();
            commit(core.reconcile(r.state, Date.now()));
            toast("Backup restaurado.");
          },
        }),
        h("button", { class: "btn small", text: "Fechar", onClick: () => modal.close() }),
      ),
    ),
  );
  modal.showModal();
}

/* ---------- web ringing ---------- */

function showRing(doses, isTest = false, notify = true) {
  ringingKeys = doses.map((d) => d.key);
  if (!web.isRinging()) web.startRinging({ vibrate: state.settings.vibrate });
  if (notify && !isTest) web.showDoseNotification(doses);
  document.title = "⏰ Hora do remédio!";
  ringEl.hidden = false;
  const now = Date.now();
  ringEl.replaceChildren(
    h("div", { class: "big-clock", text: fmtTime(now) }),
    h("h1", { text: doses.length > 1 ? "Hora dos remédios" : "Hora do remédio" }),
    ...doses.map((d) =>
      h(
        "div",
        { class: "ring-card" },
        h("div", { class: "title", text: d.name }),
        d.dose && h("div", { text: d.dose }),
        d.notes && h("div", { class: "muted", style: "color:#fecaca", text: d.notes }),
        h(
          "div",
          { class: "ring-actions" },
          h("button", { class: "btn ok", text: "Tomei", onClick: () => (isTest ? closeRing() : act(d.key, "taken")) }),
          h("button", { class: "btn", text: "Pular", onClick: () => (isTest ? closeRing() : act(d.key, "skipped")) }),
        ),
      ),
    ),
    h("button", {
      class: "btn amber snooze-all",
      text: `Adiar ${state.settings.snoozeMinutes} min`,
      onClick: () => {
        if (isTest) return closeRing();
        for (const d of doses) if (ringingKeys.includes(d.key)) snoozeSilently(d.key);
        closeRing();
        render();
        toast(`Adiado por ${state.settings.snoozeMinutes} min.`);
      },
    }),
  );
}

function snoozeSilently(key) {
  const until = Date.now() + state.settings.snoozeMinutes * core.MINUTE;
  delete fired[key];
  saveFired(fired);
  state = core.snoozeDose(state, key, until);
  saveState(state);
}

function closeRing(key) {
  ringingKeys = key ? ringingKeys.filter((k) => k !== key) : [];
  if (ringingKeys.length > 0) {
    const now = Date.now();
    const remaining = core
      .getDoses(state, now - 24 * core.HOUR, now + core.MINUTE, now)
      .filter((d) => ringingKeys.includes(d.key) && !["taken", "skipped"].includes(d.status));
    if (remaining.length > 0) {
      showRing(remaining, false, false);
      return;
    }
  }
  ringingKeys = [];
  web.stopRinging();
  web.closeNotifications();
  ringEl.hidden = true;
  ringEl.replaceChildren();
  document.title = "Dispertador";
}

function checkWebAlarms() {
  if (NATIVE) return;
  const now = Date.now();
  const due = core.dosesToRing(state, now).filter((d) => !fired[d.key] || fired[d.key] < core.alarmTime(state, d));
  if (due.length === 0) return;
  for (const d of due) fired[d.key] = now;
  saveFired(fired);
  const keys = new Set([...ringingKeys, ...due.map((d) => d.key)]);
  const all = core.getDoses(state, now - 24 * core.HOUR, now + core.MINUTE, now).filter((d) => keys.has(d.key) && !["taken", "skipped"].includes(d.status));
  showRing(all);
}

async function applyWakeLockSetting() {
  globalThis.__dispertadorKeepOn = !NATIVE && state.settings.keepScreenOn;
  await web.setKeepScreenOn(globalThis.__dispertadorKeepOn);
}

/* ---------- routing / render ---------- */

function render() {
  for (const b of document.querySelectorAll(".tab")) {
    if (b.dataset.tab === tab) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  }
  const scroll = window.scrollY;
  const content = { hoje: renderToday, remedios: renderMeds, historico: renderHistory, ajustes: renderSettings }[tab] ?? renderToday;
  view.replaceChildren(content());
  window.scrollTo(0, scroll);
}

function go(next) {
  tab = next;
  history.replaceState(null, "", `#${next}`);
  render();
  window.scrollTo(0, 0);
}

for (const b of document.querySelectorAll(".tab")) b.addEventListener("click", () => go(b.dataset.tab));

function tickClock() {
  $("#clock").textContent = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

let lastMinute = -1;
function tick() {
  tickClock();
  checkWebAlarms();
  const minute = Math.floor(Date.now() / core.MINUTE);
  if (minute !== lastMinute && ringEl.hidden && !modal.open) {
    lastMinute = minute;
    const reconciled = core.reconcile(state, Date.now());
    if (reconciled.log.length !== state.log.length) {
      state = reconciled;
      saveState(state);
    }
    if (tab === "hoje" || tab === "historico") render();
  }
}

function handleNotificationAction(action, keys) {
  const key = keys?.[0];
  if (!key) return;
  if (action === "taken") act(key, "taken");
  else if (action === "snooze") snooze(key);
}

if (!NATIVE && "serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
  navigator.serviceWorker.addEventListener("message", (e) => {
    if (e.data?.type === "notification-action") handleNotificationAction(e.data.action, e.data.keys);
  });
}

web.visibilityWakeLockHook();
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    if (NATIVE) pullNativeEvents();
    else checkWebAlarms();
  }
});

if (NATIVE) {
  native.onNativeEvent(() => pullNativeEvents());
  window.addEventListener("focus", () => pullNativeEvents());
}

document.addEventListener(
  "pointerdown",
  () => {
    if (!NATIVE && !web.audioReady()) web.unlockAudio().then(() => tab === "hoje" && ringEl.hidden && render());
  },
  { once: true },
);

const params = new URLSearchParams(location.search);
if (params.get("acao") && params.get("dose")) {
  handleNotificationAction(params.get("acao"), [params.get("dose")]);
  history.replaceState(null, "", location.pathname + location.hash);
}

saveState(state);
render();
tickClock();
setInterval(tick, 1000);
applyWakeLockSetting();
if (NATIVE) {
  native.requestNotifications().catch(() => {});
  pullNativeEvents();
}

// Exposed for manual verification in the browser console / automated checks.
globalThis.__dispertador = { get state() { return state; }, core, render, commit };
