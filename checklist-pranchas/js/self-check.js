/* Node check for domain rules and snapshot isolation. Not loaded by the page. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname);
const memory = new Map();
const context = {
  console,
  crypto: globalThis.crypto,
  setTimeout,
  clearTimeout,
  localStorage: {
    getItem(key) { return memory.has(key) ? memory.get(key) : null; },
    setItem(key, value) { memory.set(key, String(value)); },
    removeItem(key) { memory.delete(key); }
  }
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
["domain.js", "seed.js", "store.js"].forEach(function (file) {
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
});

const store = context.LunardeliStore;
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

const svgFile = {
  name: "evidencia.svg",
  type: "image/svg+xml",
  size: 120,
  dataUrl: "data:image/svg+xml;charset=utf-8," + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg'/>")
};

async function answerRun(run, overrides) {
  const state = store.getState();
  for (const item of run.templateSnapshot.items) {
    const over = overrides && overrides[item.code];
    const status = over ? over.status : "conforme";
    const comment = over ? over.comment : "";
    const saved = await store.saveResponse(run.id, item.id, status, comment);
    assert(saved.ok, item.code + " " + (saved.message || saved.code));
    if (item.requiredEvidence && status === "conforme") {
      const evidence = await store.addEvidence(run.id, item.id, svgFile);
      assert(evidence.ok, "evidência " + item.code + " " + (evidence.message || ""));
    }
  }
  return state;
}

async function main() {
  await store.init();
  const state = store.getState();
  const dumped = JSON.stringify(state);
  assert(!dumped.includes("NBR"), "seed não pode citar NBR");
  assert(!dumped.includes("6118"), "seed não pode citar número de norma");
  assert(state.masterItems.every(function (item) { return item.technicalReference && !item.technicalReference.norm; }), "referência normativa começa vazia");

  const run = state.runs.find(function (entry) { return entry.id === "run-vig-01-prod"; });
  const beforeTitle = run.templateSnapshot.items.find(function (item) { return item.code === "VIG-02"; }).title;
  const beforeVersion = run.templateSnapshot.versionNumber;
  await store.setCurrentUser("user-admin");
  const master = state.masterItems.find(function (item) { return item.id === "mi-vig-02"; });
  const edited = await store.saveMasterItem(Object.assign({}, master, {
    title: "Título só no checklist geral",
    norm: master.technicalReference.norm,
    edition: master.technicalReference.edition,
    item: master.technicalReference.item,
    note: master.technicalReference.note
  }));
  assert(edited.ok, edited.message);
  const after = store.getState().runs.find(function (entry) { return entry.id === "run-vig-01-prod"; });
  assert(after.templateSnapshot.items.find(function (item) { return item.code === "VIG-02"; }).title === beforeTitle, "editar o geral não altera snapshot");

  const drafted = await store.startNewVersion("tpl-vigas-prod");
  assert(drafted.ok, drafted.message);
  const published = await store.publishDraft("tpl-vigas-prod", "v2 de teste");
  assert(published.ok, published.message);
  const still = store.getState().runs.find(function (entry) { return entry.id === "run-vig-01-prod"; });
  assert(still.templateSnapshot.versionNumber === beforeVersion, "publicar v2 não altera run da v1");
  const live = store.getState().templateVersions.filter(function (version) {
    return version.templateId === "tpl-vigas-prod" && version.status === "published";
  });
  assert(live.length === 1 && live[0].versionNumber === 2, "só uma versão publicada");

  await store.setCurrentUser("user-prod");
  const openItem = still.templateSnapshot.items.find(function (item) { return item.code === "VIG-02"; });
  const missingNa = await store.saveResponse(still.id, openItem.id, "nao_aplicavel", "  ");
  assert(!missingNa.ok && missingNa.code === "na_needs_justification", "N/A sem justificativa");
  const missingNc = await store.saveResponse(still.id, openItem.id, "nao_conforme", "");
  assert(!missingNc.ok && missingNc.code === "nc_needs_comment", "NC sem comentário");
  await store.setCurrentUser("user-view");
  const viewer = await store.saveResponse(still.id, openItem.id, "conforme", "");
  assert(!viewer.ok, "consulta não grava");

  await store.setCurrentUser("user-prod");
  const fresh = await store.createDrawing({
    projectId: "proj-demo",
    drawingTypeId: "dt-vigas",
    number: "VIG-09",
    title: "Vigas da v2",
    structureLabel: "Torre A",
    levelLabel: "Tipo"
  });
  assert(fresh.ok, fresh.message);
  const started = await store.startProduction(fresh.revisionId);
  assert(started.ok, started.message);
  const v2run = store.getState().runs.find(function (entry) { return entry.revisionId === fresh.revisionId; });
  assert(v2run.templateSnapshot.versionNumber === 2, "run novo usa a v2");
  assert(store.getState().runs.find(function (entry) { return entry.id === "run-vig-01-prod"; }).templateSnapshot.versionNumber === 1, "run antigo segue na v1");

  const prod = store.getState().runs.find(function (entry) { return entry.id === "run-vig-01-prod"; });
  await answerRun(prod);
  const forwarded = await store.forwardProduction("rev-vig-01-r00");
  assert(forwarded.ok, forwarded.message);
  const authorReview = await store.startConference("rev-vig-01-r00");
  assert(!authorReview.ok, "autor não abre a própria conferência");
  await store.setCurrentUser("user-rev");
  const conference = await store.startConference("rev-vig-01-r00");
  assert(conference.ok, conference.message);
  const confRun = store.getState().runs.find(function (entry) { return entry.revisionId === "rev-vig-01-r00" && entry.activityKind === "conferencia"; });
  await answerRun(confRun, { "VIG-05": { status: "nao_conforme", comment: "Totais do exemplo não fecham." } });
  await store.setCurrentUser("user-prod");
  const roleBlock = await store.approve("rev-vig-01-r00", "");
  assert(!roleBlock.ok && roleBlock.code === "role_cannot_approve", "desenhista não aprova");
  await store.setCurrentUser("user-rev");
  const blocked = await store.approve("rev-vig-01-r00", "");
  assert(!blocked.ok, "bloqueante em aberto impede aprovação: " + blocked.message);
  const vig5 = confRun.templateSnapshot.items.find(function (item) { return item.code === "VIG-05"; });
  const exception = await store.recordException("rev-vig-01-r00", vig5.id, "Exceção didática registrada pela coordenação interna.");
  assert(exception.ok, exception.message);
  const stayed = store.getState().responses.find(function (response) { return response.runItemId === vig5.id; });
  assert(stayed.status === "nao_conforme", "exceção não vira conformidade");
  const approved = await store.approve("rev-vig-01-r00", "Aprovação interna de teste");
  assert(approved.ok, approved.message);
  const frozen = await store.saveResponse(confRun.id, vig5.id, "conforme", "");
  assert(!frozen.ok && frozen.code === "immutable", "revisão aprovada não muda");
  assert(store.getState().audit.some(function (event) { return event.id === "audit-seed"; }), "auditoria inicial permanece");
  const runsBefore = store.getState().runs.length;
  await store.setCurrentUser("user-admin");
  const archived = await store.archiveRevision("rev-vig-01-r00", "Arquivo de teste, sem apagar.");
  assert(archived.ok, archived.message);
  assert(store.getState().runs.length === runsBefore, "arquivar não apaga o run");
  assert(store.getState().revisions.find(function (revision) { return revision.id === "rev-vig-01-r00"; }).immutable, "aprovação segue imutável");

  await store.setCurrentUser("user-prod");
  const forma = await store.startProduction("rev-for-01-r00");
  assert(forma.ok, forma.message);
  const formaRun = store.getState().runs.find(function (entry) { return entry.revisionId === "rev-for-01-r00" && entry.activityKind === "producao"; });
  await answerRun(formaRun);
  assert((await store.forwardProduction("rev-for-01-r00")).ok, "encaminhou forma");
  await store.setCurrentUser("user-rev");
  assert((await store.startConference("rev-for-01-r00")).ok, "conferência da forma");
  const formaConf = store.getState().runs.find(function (entry) { return entry.revisionId === "rev-for-01-r00" && entry.activityKind === "conferencia"; });
  await answerRun(formaConf, { "FOR-02": { status: "nao_conforme", comment: "Faltou uma abertura no exemplo." } });
  assert((await store.returnWithPending("rev-for-01-r00")).ok, "devolveu pendência");
  await store.setCurrentUser("user-prod");
  assert((await store.startCorrection("rev-for-01-r00")).ok, "correção");
  const issue = store.getState().issues.find(function (entry) { return entry.revisionId === "rev-for-01-r00" && entry.status !== "resolvida"; });
  assert(issue, "pendência criada");
  assert((await store.addIssueNote(issue.id, "Abertura recolocada no exemplo.", null)).ok, "nota de correção");
  assert((await store.sendToRecheck("rev-for-01-r00")).ok, "pediu reconferência");
  await store.setCurrentUser("user-rev");
  assert((await store.startConference("rev-for-01-r00")).ok, "retomou conferência");
  const for02 = formaConf.templateSnapshot.items.find(function (item) { return item.code === "FOR-02"; });
  assert((await store.saveResponse(formaConf.id, for02.id, "conforme", "Corrigido no exemplo.")).ok, "reconferiu");
  const formaApproved = await store.approve("rev-for-01-r00", "");
  assert(formaApproved.ok, formaApproved.message);

  await store.setCurrentUser("user-admin");
  const lajes = await store.createDrawing({
    projectId: "proj-demo",
    drawingTypeId: "dt-lajes",
    number: "LAJ-09",
    title: "Lajes de teste",
    structureLabel: "Bloco B",
    levelLabel: "Térreo"
  });
  assert(lajes.ok, lajes.message);
  assert((await store.startProduction(lajes.revisionId)).ok, "Ana produz");
  const lajesRun = store.getState().runs.find(function (entry) { return entry.revisionId === lajes.revisionId && entry.activityKind === "producao"; });
  await answerRun(lajesRun);
  assert((await store.forwardProduction(lajes.revisionId)).ok, "Ana encaminha");
  await store.setCurrentUser("user-rev");
  assert((await store.startConference(lajes.revisionId)).ok, "Helena confere lajes");
  const lajesConf = store.getState().runs.find(function (entry) { return entry.revisionId === lajes.revisionId && entry.activityKind === "conferencia"; });
  await answerRun(lajesConf);
  await store.setCurrentUser("user-admin");
  const selfApproval = await store.approve(lajes.revisionId, "");
  assert(!selfApproval.ok && selfApproval.code === "self_approval", "autora não aprova: " + selfApproval.message);
  await store.setCurrentUser("user-rev");
  assert((await store.approve(lajes.revisionId, "")).ok, "outra pessoa aprova");

  if (failures.length) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
  console.log("self-check ok");
}

main().catch(function (error) {
  console.error(error);
  process.exit(1);
});
