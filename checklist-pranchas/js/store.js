/* Browser persistence: structured data in localStorage, binaries in IndexedDB.
   Approved revisions and audit events are never physically deleted. */
(function (root) {
  "use strict";

  var D = root.LunardeliDomain;
  var KEY = "lunardeli.checklist.html.v1";
  var state = null;
  var db = null;
  var listeners = [];
  var queue = Promise.resolve();
  var limits = { image: 5 * 1024 * 1024, video: 30 * 1024 * 1024, pdf: 20 * 1024 * 1024 };

  function uid() {
    if (root.crypto && root.crypto.randomUUID) return root.crypto.randomUUID();
    return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  function now() {
    return new Date().toISOString();
  }

  function fail(code, extra) {
    var result = { ok: false, code: code, message: D.message(code) };
    if (extra) Object.keys(extra).forEach(function (key) { result[key] = extra[key]; });
    return result;
  }

  function success(message, extra) {
    var result = { ok: true, message: message || "Guardado neste navegador." };
    if (extra) Object.keys(extra).forEach(function (key) { result[key] = extra[key]; });
    return result;
  }

  function persist() {
    try {
      root.localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (error) {
      return false;
    }
  }

  function notify() {
    listeners.slice().forEach(function (fn) {
      try { fn(state); } catch (error) { /* listener errors stay local */ }
    });
  }

  function enqueue(fn) {
    var run = queue.then(fn, fn);
    queue = run.then(function () {}, function () {});
    return run;
  }

  function actor() {
    return state.users.filter(function (user) { return user.id === state.currentUserId; })[0] || null;
  }

  function audit(action, entityType, entityId, payload) {
    state.audit.push({
      id: uid(),
      actorId: state.currentUserId,
      action: action,
      entityType: entityType,
      entityId: entityId,
      payload: payload || {},
      createdAt: now()
    });
  }

  function mustWrite() {
    var who = actor();
    if (!who) return fail("no_actor");
    if (who.role === "consulta") return fail("consulta");
    return null;
  }

  function mustManage() {
    var denied = mustWrite();
    if (denied) return denied;
    var who = actor();
    if (["admin", "coordenador"].indexOf(who.role) < 0) {
      return fail("consulta", { message: "Só administração ou coordenação altera o padrão." });
    }
    return null;
  }

  function findRevision(id) {
    return state.revisions.filter(function (revision) { return revision.id === id; })[0] || null;
  }

  function findRun(revisionId, activityKind) {
    return state.runs.filter(function (run) {
      return run.revisionId === revisionId && run.activityKind === activityKind;
    })[0] || null;
  }

  function responseMap(runId) {
    var map = {};
    state.responses.forEach(function (response) {
      if (response.runId === runId) map[response.runItemId] = response;
    });
    return map;
  }

  function exceptionMap(revision) {
    var map = {};
    (revision.formalExceptions || []).forEach(function (entry) { map[entry.runItemId] = entry; });
    return map;
  }

  function publishedVersion(template) {
    return state.templateVersions.filter(function (version) {
      return version.id === template.currentVersionId && version.status === "published";
    })[0] || null;
  }

  function draftVersion(template) {
    return state.templateVersions.filter(function (version) {
      return version.templateId === template.id && version.status === "draft";
    })[0] || null;
  }

  function latestTemplate(drawingTypeId, activityKind) {
    var candidates = state.templates.filter(function (template) {
      return template.drawingTypeId === drawingTypeId &&
        template.activityKind === activityKind &&
        !template.archivedAt &&
        template.currentVersionId;
    });
    return candidates[0] || null;
  }

  function extOf(name) {
    var parts = String(name || "").toLowerCase().split(".");
    return parts.length > 1 ? parts.pop() : "";
  }

  function kindFor(mime, name) {
    var ext = extOf(name);
    if (mime === "application/pdf" || ext === "pdf") return "pdf";
    if ((mime || "").indexOf("video/") === 0 || ext === "mp4" || ext === "webm") return "video";
    if ((mime || "").indexOf("image/") === 0 || ["png", "jpg", "jpeg", "webp", "gif", "svg"].indexOf(ext) >= 0) return "image";
    return "";
  }

  function openDb() {
    return new Promise(function (resolve) {
      if (!root.indexedDB) { resolve(null); return; }
      var request;
      try { request = root.indexedDB.open("lunardeli-checklist-files", 1); }
      catch (error) { resolve(null); return; }
      request.onupgradeneeded = function () {
        var database = request.result;
        if (!database.objectStoreNames.contains("files")) database.createObjectStore("files", { keyPath: "id" });
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { resolve(null); };
    });
  }

  function idbPut(record) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction("files", "readwrite");
      tx.objectStore("files").put(record);
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error || new Error("idb")); };
    });
  }

  function idbGet(id) {
    return new Promise(function (resolve) {
      if (!db) { resolve(null); return; }
      var tx = db.transaction("files", "readonly");
      var request = tx.objectStore("files").get(id);
      request.onsuccess = function () { resolve(request.result || null); };
      request.onerror = function () { resolve(null); };
    });
  }

  function idbClear() {
    return new Promise(function (resolve) {
      if (!db) { resolve(); return; }
      var tx = db.transaction("files", "readwrite");
      tx.objectStore("files").clear();
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { resolve(); };
    });
  }

  function readAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(reader.error); };
      reader.readAsDataURL(file);
    });
  }

  async function init() {
    db = await openDb();
    var raw = null;
    try { raw = root.localStorage.getItem(KEY); } catch (error) { raw = null; }
    if (!raw) {
      state = root.LunardeliSeed.create();
      persist();
    } else {
      try {
        var parsed = JSON.parse(raw);
        if (!parsed || parsed.schema !== 1 || !parsed.revisions || !parsed.masterItems) throw new Error("schema");
        state = parsed;
        state.inlineFiles = state.inlineFiles || {};
        state.audit = state.audit || [];
      } catch (error) {
        state = root.LunardeliSeed.create();
        persist();
      }
    }
    notify();
    return state;
  }

  function replaceState(next) {
    state = next;
    if (!persist()) return fail("storage");
    notify();
    return success("Dados de exemplo restaurados neste navegador.");
  }

  async function putFile(file) {
    var name = file.name || "arquivo";
    var mime = file.type || file.mime || "";
    var size = file.size || 0;
    var kind = kindFor(mime, name);
    if (!kind) return fail("bad_file");
    var max = limits[kind] || limits.image;
    if (size > max) return fail("file_too_big");
    var id = uid();
    if (file.dataUrl) {
      state.inlineFiles[id] = { name: name, mime: mime || "application/octet-stream", dataUrl: file.dataUrl, size: size };
      if (!persist()) return fail("storage");
      return success("", { id: id });
    }
    if (db && file instanceof Blob) {
      try {
        await idbPut({ id: id, blob: file, name: name, mime: mime, size: size, createdAt: now() });
        return success("", { id: id });
      } catch (error) { /* fall through to inline */ }
    }
    if (size > 400000) {
      return fail("storage", { message: "Este navegador não guardou o arquivo. Tente um arquivo menor ou outro navegador." });
    }
    var dataUrl = await readAsDataUrl(file);
    state.inlineFiles[id] = { name: name, mime: mime || "application/octet-stream", dataUrl: dataUrl, size: size };
    if (!persist()) return fail("storage");
    return success("", { id: id });
  }

  async function getFile(id) {
    if (state.inlineFiles && state.inlineFiles[id]) {
      var inline = state.inlineFiles[id];
      return { name: inline.name, mime: inline.mime, dataUrl: inline.dataUrl };
    }
    var record = await idbGet(id);
    if (!record) return null;
    return { name: record.name, mime: record.mime, blob: record.blob };
  }

  function setCurrentUser(userId) {
    return enqueue(function () {
      var user = state.users.filter(function (entry) { return entry.id === userId; })[0];
      if (!user) return fail("required");
      state.currentUserId = user.id;
      if (!persist()) return fail("storage");
      notify();
      return success("");
    });
  }

  function resetSeed() {
    return enqueue(async function () {
      var denied = mustManage();
      if (denied) return denied;
      await idbClear();
      state = root.LunardeliSeed.create();
      audit("seed_reset", "organization", state.organization.id, {});
      if (!persist()) return fail("storage");
      notify();
      return success("Exemplo didático restaurado. O que você tinha neste navegador foi substituído.");
    });
  }

  function exportJson() {
    return JSON.stringify({ app: "lunardeli-checklist-html", exportedAt: now(), state: state }, null, 2);
  }

  function importJson(text) {
    return enqueue(function () {
      var denied = mustManage();
      if (denied) return denied;
      var parsed;
      try { parsed = JSON.parse(text); } catch (error) { return fail("bad_import"); }
      var incoming = parsed && parsed.state ? parsed.state : parsed;
      if (!incoming || incoming.schema !== 1 || !incoming.masterItems || !incoming.revisions) return fail("bad_import");
      incoming.inlineFiles = incoming.inlineFiles || {};
      incoming.audit = incoming.audit || [];
      state = incoming;
      audit("state_imported", "organization", state.organization.id, {});
      if (!persist()) return fail("storage");
      notify();
      return success("Backup carregado neste navegador. Arquivos grandes que estavam só no IndexedDB não viajam no JSON.");
    });
  }

  function createDrawingType(input) {
    return enqueue(function () {
      var denied = mustManage();
      if (denied) return denied;
      var code = String(input.code || "").trim().toUpperCase();
      var name = String(input.name || "").trim();
      if (!code || !name) return fail("required");
      if (state.drawingTypes.some(function (type) { return type.code === code && !type.archivedAt; })) return fail("duplicate");
      var id = uid();
      state.drawingTypes.push({
        id: id, code: code, name: name, sortOrder: state.drawingTypes.length,
        active: true, archivedAt: null, didactic: false
      });
      audit("drawing_type_created", "drawing_type", id, { code: code });
      if (!persist()) return fail("storage");
      notify();
      return success("Tipo de projeto criado.", { id: id });
    });
  }

  function archiveDrawingType(id, restore) {
    return enqueue(function () {
      var denied = mustManage();
      if (denied) return denied;
      var type = state.drawingTypes.filter(function (entry) { return entry.id === id; })[0];
      if (!type) return fail("required");
      type.archivedAt = restore ? null : now();
      type.active = !!restore;
      audit(restore ? "drawing_type_restored" : "drawing_type_archived", "drawing_type", id, {});
      if (!persist()) return fail("storage");
      notify();
      return success(restore ? "Tipo restaurado." : "Tipo arquivado. Nada foi apagado.");
    });
  }

  function createSection(title) {
    return enqueue(function () {
      var denied = mustManage();
      if (denied) return denied;
      var name = String(title || "").trim();
      if (!name) return fail("required");
      var id = uid();
      state.masterSections.push({ id: id, title: name, sortOrder: state.masterSections.length, archivedAt: null, didactic: false });
      audit("section_created", "master_section", id, { title: name });
      if (!persist()) return fail("storage");
      notify();
      return success("Seção criada no checklist geral.", { id: id });
    });
  }

  function saveMasterItem(input) {
    return enqueue(function () {
      var denied = mustManage();
      if (denied) return denied;
      var code = String(input.code || "").trim();
      var title = String(input.title || "").trim();
      if (!code || !title || !input.sectionId) return fail("required");
      var duplicate = state.masterItems.some(function (entry) {
        return entry.code.toLowerCase() === code.toLowerCase() && entry.id !== input.id && !entry.archivedAt;
      });
      if (duplicate) return fail("duplicate");
      var existing = state.masterItems.filter(function (entry) { return entry.id === input.id; })[0];
      var record = existing || {
        id: uid(),
        media: [],
        didactic: false,
        archivedAt: null,
        sortOrder: state.masterItems.length
      };
      record.sectionId = input.sectionId;
      record.code = code;
      record.title = title;
      record.objective = String(input.objective || "").trim();
      record.steps = String(input.steps || "").trim();
      record.verifiableParameter = String(input.verifiableParameter || "").trim();
      record.acceptanceCriteria = String(input.acceptanceCriteria || "").trim();
      record.priority = input.priority || "media";
      record.isBlocking = !!input.isBlocking;
      record.requiredEvidence = !!input.requiredEvidence;
      record.instructions = String(input.instructions || "").trim();
      record.technicalReference = {
        norm: String(input.norm || "").trim(),
        edition: String(input.edition || "").trim(),
        item: String(input.item || "").trim(),
        note: String(input.note || "").trim()
      };
      if (!existing) state.masterItems.push(record);
      audit(existing ? "master_item_updated" : "master_item_created", "master_item", record.id, { code: code });
      if (!persist()) return fail("storage");
      notify();
      return success(existing
        ? "Item atualizado no checklist geral. Versões já publicadas e conferências em andamento não mudam."
        : "Item incluído no checklist geral.", { id: record.id });
    });
  }

  function archiveMasterItem(id, restore) {
    return enqueue(function () {
      var denied = mustManage();
      if (denied) return denied;
      var entry = state.masterItems.filter(function (item) { return item.id === id; })[0];
      if (!entry) return fail("required");
      entry.archivedAt = restore ? null : now();
      audit(restore ? "master_item_restored" : "master_item_archived", "master_item", id, {});
      if (!persist()) return fail("storage");
      notify();
      return success(restore ? "Item restaurado." : "Item arquivado. Versões já publicadas continuam com a cópia.");
    });
  }

  function addMasterMedia(itemId, file, meta) {
    return enqueue(async function () {
      var denied = mustManage();
      if (denied) return denied;
      var entry = state.masterItems.filter(function (item) { return item.id === itemId; })[0];
      if (!entry) return fail("required");
      var stored = await putFile(file);
      if (!stored.ok) return stored;
      var kind = kindFor(file.type || file.mime, file.name);
      entry.media = entry.media || [];
      entry.media.push({
        id: uid(),
        kind: kind === "video" ? "video" : "image",
        fileId: stored.id,
        src: "",
        caption: String((meta && meta.caption) || file.name || "").trim(),
        example: (meta && meta.example) || "how"
      });
      audit("master_media_added", "master_item", itemId, { fileName: file.name });
      if (!persist()) return fail("storage");
      notify();
      return success("Mídia anexada ao item. Abra a miniatura para ver como é feito.");
    });
  }

  function removeMasterMedia(itemId, mediaId) {
    return enqueue(function () {
      var denied = mustManage();
      if (denied) return denied;
      var entry = state.masterItems.filter(function (item) { return item.id === itemId; })[0];
      if (!entry) return fail("required");
      entry.media = (entry.media || []).filter(function (media) { return media.id !== mediaId; });
      audit("master_media_removed", "master_item", itemId, { mediaId: mediaId });
      if (!persist()) return fail("storage");
      notify();
      return success("Mídia retirada deste item. O arquivo não é apagado se uma versão publicada ainda o usa.");
    });
  }

  function createTemplate(drawingTypeId, activityKind) {
    return enqueue(function () {
      var denied = mustManage();
      if (denied) return denied;
      var exists = state.templates.some(function (template) {
        return template.drawingTypeId === drawingTypeId && template.activityKind === activityKind && !template.archivedAt;
      });
      if (exists) return fail("duplicate", { message: "Este tipo já tem mini-checklist dessa atividade." });
      var type = state.drawingTypes.filter(function (entry) { return entry.id === drawingTypeId; })[0];
      if (!type) return fail("required");
      var templateId = uid();
      var versionId = uid();
      var activityLabel = activityKind === "conferencia" ? "conferência" : "produção";
      state.templateVersions.push({
        id: versionId,
        templateId: templateId,
        versionNumber: 1,
        status: "draft",
        publishedAt: null,
        publishedBy: null,
        snapshotNote: "",
        sections: [],
        items: []
      });
      state.templates.push({
        id: templateId,
        name: type.name + " — " + activityLabel,
        drawingTypeId: drawingTypeId,
        activityKind: activityKind,
        status: "draft",
        currentVersionId: null,
        archivedAt: null,
        didactic: false
      });
      audit("template_created", "template", templateId, { activityKind: activityKind });
      if (!persist()) return fail("storage");
      notify();
      return success("Mini-checklist criado em rascunho.", { id: templateId });
    });
  }

  function ensureDraft(templateOrId) {
    var template = typeof templateOrId === "string"
      ? state.templates.filter(function (entry) { return entry.id === templateOrId; })[0]
      : templateOrId;
    if (!template) return null;
    var draft = draftVersion(template);
    if (draft) return draft;
    var source = publishedVersion(template);
    var versionId = uid();
    var number = source ? source.versionNumber + 1 : 1;
    var sections = [];
    var items = [];
    if (source) {
      var map = {};
      source.sections.forEach(function (section) {
        var id = uid();
        map[section.id] = id;
        sections.push({ id: id, sourceId: section.sourceId || section.id, title: section.title, sortOrder: section.sortOrder });
      });
      source.items.forEach(function (item) {
        var copy = JSON.parse(JSON.stringify(item));
        copy.id = uid();
        copy.sectionId = map[item.sectionId] || item.sectionId;
        items.push(copy);
      });
    }
    draft = {
      id: versionId,
      templateId: template.id,
      versionNumber: number,
      status: "draft",
      publishedAt: null,
      publishedBy: null,
      snapshotNote: "",
      sections: sections,
      items: items
    };
    state.templateVersions.push(draft);
    return draft;
  }

  function addMasterItemToDraft(templateId, masterItemId) {
    return enqueue(function () {
      var denied = mustManage();
      if (denied) return denied;
      var template = state.templates.filter(function (entry) { return entry.id === templateId; })[0];
      var master = state.masterItems.filter(function (entry) { return entry.id === masterItemId && !entry.archivedAt; })[0];
      if (!template || !master) return fail("required");
      var draft = ensureDraft(template);
      if (draft.items.some(function (item) { return item.masterItemId === master.id; })) {
        return fail("duplicate", { message: "Este item já está no mini-checklist." });
      }
      var section = state.masterSections.filter(function (entry) { return entry.id === master.sectionId; })[0];
      var draftSection = draft.sections.filter(function (entry) { return entry.sourceId === master.sectionId; })[0];
      if (!draftSection && section) {
        draftSection = { id: uid(), sourceId: section.id, title: section.title, sortOrder: draft.sections.length };
        draft.sections.push(draftSection);
      }
      var copy = JSON.parse(JSON.stringify(master));
      copy.masterItemId = master.id;
      copy.sourceItemId = master.id;
      copy.id = uid();
      copy.sectionId = draftSection ? draftSection.id : master.sectionId;
      copy.sortOrder = draft.items.length;
      draft.items.push(copy);
      audit("draft_item_added", "template_version", draft.id, { code: master.code });
      if (!persist()) return fail("storage");
      notify();
      return success("Item incluído no rascunho. Publique para as próximas pranchas usarem esta composição.");
    });
  }

  function addCustomDraftItem(templateId, input) {
    return enqueue(function () {
      var denied = mustManage();
      if (denied) return denied;
      var template = state.templates.filter(function (entry) { return entry.id === templateId; })[0];
      if (!template) return fail("required");
      var title = String(input.title || "").trim();
      var code = String(input.code || "").trim();
      if (!title || !code) return fail("required");
      var draft = ensureDraft(template);
      var section = draft.sections.filter(function (entry) { return entry.sourceId === "custom"; })[0];
      if (!section) {
        section = { id: uid(), sourceId: "custom", title: "Itens deste tipo", sortOrder: draft.sections.length };
        draft.sections.push(section);
      }
      draft.items.push({
        id: uid(),
        masterItemId: null,
        sectionId: section.id,
        code: code,
        title: title,
        objective: String(input.objective || "").trim(),
        steps: "",
        verifiableParameter: "",
        acceptanceCriteria: "",
        technicalReference: { norm: "", edition: "", item: "", note: "" },
        priority: input.priority || "media",
        isBlocking: !!input.isBlocking,
        requiredEvidence: !!input.requiredEvidence,
        instructions: "",
        didactic: false,
        media: [],
        sortOrder: draft.items.length
      });
      audit("draft_custom_item", "template_version", draft.id, { code: code });
      if (!persist()) return fail("storage");
      notify();
      return success("Item próprio deste mini-checklist.");
    });
  }

  function removeDraftItem(templateId, itemId) {
    return enqueue(function () {
      var denied = mustManage();
      if (denied) return denied;
      var template = state.templates.filter(function (entry) { return entry.id === templateId; })[0];
      var draft = template && draftVersion(template);
      if (!draft) return fail("need_new_version");
      draft.items = draft.items.filter(function (item) { return item.id !== itemId; });
      audit("draft_item_removed", "template_version", draft.id, { itemId: itemId });
      if (!persist()) return fail("storage");
      notify();
      return success("Item retirado do rascunho.");
    });
  }

  function moveDraftItem(templateId, itemId, direction) {
    return enqueue(function () {
      var denied = mustManage();
      if (denied) return denied;
      var template = state.templates.filter(function (entry) { return entry.id === templateId; })[0];
      var draft = template && draftVersion(template);
      if (!draft) return fail("need_new_version");
      var items = draft.items.slice().sort(function (a, b) { return a.sortOrder - b.sortOrder; });
      var index = items.findIndex(function (item) { return item.id === itemId; });
      var swap = index + direction;
      if (index < 0 || swap < 0 || swap >= items.length) return success("");
      var order = items[index].sortOrder;
      items[index].sortOrder = items[swap].sortOrder;
      items[swap].sortOrder = order;
      if (!persist()) return fail("storage");
      notify();
      return success("");
    });
  }

  function refreshDraftItemFromMaster(templateId, itemId) {
    return enqueue(function () {
      var denied = mustManage();
      if (denied) return denied;
      var template = state.templates.filter(function (entry) { return entry.id === templateId; })[0];
      var draft = template && draftVersion(template);
      if (!draft) return fail("need_new_version");
      var item = draft.items.filter(function (entry) { return entry.id === itemId; })[0];
      if (!item || !item.masterItemId) return fail("required");
      var master = state.masterItems.filter(function (entry) { return entry.id === item.masterItemId; })[0];
      if (!master) return fail("required");
      var keepId = item.id;
      var keepSection = item.sectionId;
      var keepOrder = item.sortOrder;
      var copy = JSON.parse(JSON.stringify(master));
      copy.id = keepId;
      copy.masterItemId = master.id;
      copy.sectionId = keepSection;
      copy.sortOrder = keepOrder;
      var index = draft.items.findIndex(function (entry) { return entry.id === itemId; });
      draft.items[index] = copy;
      audit("draft_item_refreshed", "template_version", draft.id, { code: master.code });
      if (!persist()) return fail("storage");
      notify();
      return success("Texto atual do checklist geral copiado para o rascunho.");
    });
  }

  function publishDraft(templateId, note) {
    return enqueue(function () {
      var denied = mustManage();
      if (denied) return denied;
      var template = state.templates.filter(function (entry) { return entry.id === templateId; })[0];
      if (!template) return fail("required");
      var draft = draftVersion(template);
      if (!draft) return fail("need_new_version");
      if (!draft.items.length) return fail("empty_template");
      state.templateVersions.forEach(function (version) {
        if (version.templateId === template.id && version.status === "published") version.status = "superseded";
      });
      draft.status = "published";
      draft.publishedAt = now();
      draft.publishedBy = state.currentUserId;
      draft.snapshotNote = String(note || "").trim();
      template.status = "published";
      template.currentVersionId = draft.id;
      audit("template_published", "template_version", draft.id, { versionNumber: draft.versionNumber });
      if (!persist()) return fail("storage");
      notify();
      return success("Versão " + draft.versionNumber + " publicada. Checklists já abertos continuam com a cópia anterior.");
    });
  }

  function startNewVersion(templateId) {
    return enqueue(function () {
      var denied = mustManage();
      if (denied) return denied;
      var template = state.templates.filter(function (entry) { return entry.id === templateId; })[0];
      if (!template) return fail("required");
      if (draftVersion(template)) return success("Já existe um rascunho desta composição.");
      ensureDraft(template);
      audit("template_new_version", "template", template.id, {});
      if (!persist()) return fail("storage");
      notify();
      return success("Nova versão em rascunho. A publicada segue valendo até você publicar esta.");
    });
  }

  function createProject(input) {
    return enqueue(function () {
      var denied = mustWrite();
      if (denied) return denied;
      var who = actor();
      if (["admin", "coordenador", "desenhista"].indexOf(who.role) < 0) return fail("consulta");
      var code = String(input.code || "").trim();
      var name = String(input.name || "").trim();
      if (!code || !name) return fail("required");
      if (state.projects.some(function (project) { return project.code.toLowerCase() === code.toLowerCase() && !project.archivedAt; })) {
        return fail("duplicate");
      }
      var id = uid();
      state.projects.push({
        id: id, code: code, name: name, description: String(input.description || "").trim(),
        status: "active", archivedAt: null, createdBy: who.id, createdAt: now(), didactic: false
      });
      audit("project_created", "project", id, { code: code });
      if (!persist()) return fail("storage");
      notify();
      return success("Projeto criado.", { id: id });
    });
  }

  function archiveProject(id, restore) {
    return enqueue(function () {
      var denied = mustManage();
      if (denied) return denied;
      var project = state.projects.filter(function (entry) { return entry.id === id; })[0];
      if (!project) return fail("required");
      project.archivedAt = restore ? null : now();
      project.status = restore ? "active" : "archived";
      audit(restore ? "project_restored" : "project_archived", "project", id, {});
      if (!persist()) return fail("storage");
      notify();
      return success(restore ? "Projeto restaurado." : "Projeto arquivado. Pranchas e revisões aprovadas continuam no navegador.");
    });
  }

  function createDrawing(input) {
    return enqueue(function () {
      var denied = mustWrite();
      if (denied) return denied;
      var number = String(input.number || "").trim();
      var title = String(input.title || "").trim();
      if (["admin", "coordenador", "desenhista"].indexOf(actor().role) < 0) return fail("role_cannot_edit_production");
      if (!number || !title || !input.projectId || !input.drawingTypeId) return fail("required");
      var duplicate = state.drawings.some(function (drawing) {
        return drawing.projectId === input.projectId && drawing.number.toLowerCase() === number.toLowerCase();
      });
      if (duplicate) return fail("duplicate");
      var id = uid();
      state.drawings.push({
        id: id,
        projectId: input.projectId,
        drawingTypeId: input.drawingTypeId,
        number: number,
        title: title,
        structureLabel: String(input.structureLabel || "").trim(),
        levelLabel: String(input.levelLabel || "").trim(),
        createdBy: state.currentUserId,
        createdAt: now()
      });
      var revisionId = uid();
      state.revisions.push({
        id: revisionId,
        drawingId: id,
        revisionCode: "R00",
        workflowStatus: "rascunho",
        productionOwnerId: null,
        reviewerId: null,
        approvedAt: null,
        approvedBy: null,
        immutable: false,
        archivedAt: null,
        archiveReason: "",
        pdfFileId: null,
        pdfFileName: "",
        formalExceptions: [],
        previousRevisionId: null,
        createdAt: now()
      });
      audit("drawing_created", "drawing", id, { number: number, revisionId: revisionId });
      if (!persist()) return fail("storage");
      notify();
      return success("Prancha criada com revisão R00.", { id: id, revisionId: revisionId });
    });
  }

  function newRevision(drawingId, code) {
    return enqueue(function () {
      var denied = mustWrite();
      if (denied) return denied;
      var who = actor();
      if (["admin", "coordenador", "desenhista"].indexOf(who.role) < 0) return fail("role_cannot_edit_production");
      var drawing = state.drawings.filter(function (entry) { return entry.id === drawingId; })[0];
      if (!drawing) return fail("required");
      var existing = state.revisions.filter(function (revision) { return revision.drawingId === drawingId; });
      var revisionCode = String(code || "").trim() || D.nextRevisionCode(existing.map(function (revision) { return revision.revisionCode; }));
      if (existing.some(function (revision) { return revision.revisionCode.toLowerCase() === revisionCode.toLowerCase(); })) {
        return fail("duplicate");
      }
      var previous = existing.slice().sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); })[0];
      var id = uid();
      state.revisions.push({
        id: id,
        drawingId: drawingId,
        revisionCode: revisionCode,
        workflowStatus: "rascunho",
        productionOwnerId: null,
        reviewerId: null,
        approvedAt: null,
        approvedBy: null,
        immutable: false,
        archivedAt: null,
        archiveReason: "",
        pdfFileId: null,
        pdfFileName: "",
        formalExceptions: [],
        previousRevisionId: previous ? previous.id : null,
        createdAt: now()
      });
      audit("revision_created", "revision", id, { revisionCode: revisionCode });
      if (!persist()) return fail("storage");
      notify();
      return success("Nova revisão " + revisionCode + ". A anterior permanece como estava.", { id: id });
    });
  }

  function startProduction(revisionId) {
    return enqueue(function () {
      var revision = findRevision(revisionId);
      var who = actor();
      var allowed = D.canEditRun(who, revision, "producao");
      if (!allowed.ok && allowed.code !== "production_locked") {
        if (revision && revision.workflowStatus === "rascunho") {
          /* owner not set yet; desenhista may start */
        } else return fail(allowed.code);
      }
      if (!who || who.role === "consulta") return fail("consulta");
      if (["desenhista", "coordenador", "admin"].indexOf(who.role) < 0) return fail("role_cannot_edit_production");
      if (revision.workflowStatus !== "rascunho" && revision.workflowStatus !== "em_producao") return fail("production_locked");
      if (findRun(revision.id, "producao")) {
        revision.workflowStatus = "em_producao";
        if (!persist()) return fail("storage");
        notify();
        return success("Produção já estava aberta.");
      }
      var drawing = state.drawings.filter(function (entry) { return entry.id === revision.drawingId; })[0];
      var template = latestTemplate(drawing.drawingTypeId, "producao");
      if (!template) return fail("no_template");
      var version = publishedVersion(template);
      if (!version) return fail("no_template");
      var runId = uid();
      state.runs.push({
        id: runId,
        revisionId: revision.id,
        templateVersionId: version.id,
        activityKind: "producao",
        status: "em_andamento",
        assigneeId: who.id,
        templateSnapshot: D.cloneSnapshot(version, template, uid),
        startedAt: now(),
        completedAt: null,
        createdBy: who.id
      });
      revision.workflowStatus = "em_producao";
      revision.productionOwnerId = revision.productionOwnerId || who.id;
      audit("production_started", "checklist_run", runId, { versionNumber: version.versionNumber });
      if (!persist()) return fail("storage");
      notify();
      return success("Produção iniciada com a versão " + version.versionNumber + " publicada. Você é o autor desta revisão e não poderá aprová-la.");
    });
  }

  function startConference(revisionId) {
    return enqueue(function () {
      var revision = findRevision(revisionId);
      var who = actor();
      if (!revision || !who) return fail("required");
      if (who.role === "consulta" || who.role === "desenhista") return fail("role_cannot_edit_review");
      if (who.id === revision.productionOwnerId) return fail("author_cannot_review");
      if (["aguardando_conferencia", "aguardando_reconferencia", "em_conferencia"].indexOf(revision.workflowStatus) < 0) {
        return fail("wrong_status", { message: "A conferência abre quando a produção foi encaminhada." });
      }
      var existing = findRun(revision.id, "conferencia");
      if (!existing) {
        var drawing = state.drawings.filter(function (entry) { return entry.id === revision.drawingId; })[0];
        var template = latestTemplate(drawing.drawingTypeId, "conferencia");
        if (!template) return fail("no_template");
        var version = publishedVersion(template);
        if (!version) return fail("no_template");
        existing = {
          id: uid(),
          revisionId: revision.id,
          templateVersionId: version.id,
          activityKind: "conferencia",
          status: "em_andamento",
          assigneeId: who.id,
          templateSnapshot: D.cloneSnapshot(version, template, uid),
          startedAt: now(),
          completedAt: null,
          createdBy: who.id
        };
        state.runs.push(existing);
      }
      revision.workflowStatus = "em_conferencia";
      revision.reviewerId = who.id;
      audit("conference_started", "checklist_run", existing.id, {});
      if (!persist()) return fail("storage");
      notify();
      return success("Conferência aberta. O checklist ficou congelado nesta versão.");
    });
  }

  function saveResponse(runId, itemId, status, comment) {
    return enqueue(function () {
      var run = state.runs.filter(function (entry) { return entry.id === runId; })[0];
      if (!run) return fail("no_run");
      var revision = findRevision(run.revisionId);
      var allowed = D.canEditRun(actor(), revision, run.activityKind);
      if (!allowed.ok) return fail(allowed.code);
      var item = run.templateSnapshot.items.filter(function (entry) { return entry.id === itemId; })[0];
      if (!item) return fail("required");
      var valid = D.validateResponse(status, comment);
      if (!valid.ok) return fail(valid.code);
      var response = state.responses.filter(function (entry) {
        return entry.runId === runId && entry.runItemId === itemId;
      })[0];
      if (!response) {
        response = {
          id: uid(),
          runId: runId,
          runItemId: itemId,
          evidence: [],
          answeredBy: null,
          answeredAt: null
        };
        state.responses.push(response);
      }
      response.status = status;
      response.comment = String(comment || "").trim();
      response.answeredBy = state.currentUserId;
      response.answeredAt = now();
      if (run.activityKind === "conferencia" && status === "nao_conforme") {
        var issue = state.issues.filter(function (entry) {
          return entry.runItemId === itemId && entry.status !== "resolvida";
        })[0];
        if (!issue) {
          var projectId = state.drawings.filter(function (drawing) { return drawing.id === revision.drawingId; })[0].projectId;
          var count = state.issues.length + 1;
          issue = {
            id: uid(),
            code: "NC-" + String(count).padStart(3, "0"),
            title: item.code + " — " + item.title,
            description: response.comment,
            runId: runId,
            runItemId: itemId,
            revisionId: revision.id,
            projectId: projectId,
            priority: item.priority,
            assigneeId: revision.productionOwnerId,
            status: "aberta",
            openedBy: state.currentUserId,
            openedAt: now(),
            resolvedAt: null,
            resolvedBy: null,
            events: []
          };
          issue.events.push({
            id: uid(), type: "opened", payload: { comment: response.comment }, actorId: state.currentUserId, createdAt: now()
          });
          state.issues.push(issue);
        } else {
          issue.description = response.comment;
          issue.status = issue.status === "resolvida" ? "reaberta" : issue.status;
          issue.events.push({
            id: uid(), type: "comment", payload: { comment: response.comment }, actorId: state.currentUserId, createdAt: now()
          });
        }
      }
      if (run.activityKind === "conferencia" && status === "conforme") {
        state.issues.forEach(function (issue) {
          if (issue.runItemId === itemId && issue.status !== "resolvida") {
            issue.status = "resolvida";
            issue.resolvedAt = now();
            issue.resolvedBy = state.currentUserId;
            issue.events.push({
              id: uid(), type: "status_change", payload: { status: "resolvida" }, actorId: state.currentUserId, createdAt: now()
            });
          }
        });
      }
      audit("response_saved", "response", response.id, { status: status, itemId: itemId });
      if (!persist()) return fail("storage");
      notify();
      return success("Resposta guardada.");
    });
  }

  function addEvidence(runId, itemId, file) {
    return enqueue(async function () {
      var run = state.runs.filter(function (entry) { return entry.id === runId; })[0];
      if (!run) return fail("no_run");
      var revision = findRevision(run.revisionId);
      var allowed = D.canEditRun(actor(), revision, run.activityKind);
      if (!allowed.ok) return fail(allowed.code);
      var stored = await putFile(file);
      if (!stored.ok) return stored;
      var response = state.responses.filter(function (entry) {
        return entry.runId === runId && entry.runItemId === itemId;
      })[0];
      if (!response) {
        response = {
          id: uid(), runId: runId, runItemId: itemId, status: "nao_iniciado", comment: "",
          evidence: [], answeredBy: state.currentUserId, answeredAt: now()
        };
        state.responses.push(response);
      }
      response.evidence.push({
        id: uid(),
        fileId: stored.id,
        fileName: file.name || "arquivo",
        mime: file.type || file.mime || "",
        uploadedBy: state.currentUserId,
        createdAt: now()
      });
      audit("evidence_added", "response", response.id, { fileName: file.name });
      if (!persist()) return fail("storage");
      notify();
      return success("Evidência anexada.");
    });
  }

  function removeEvidence(runId, itemId, evidenceId) {
    return enqueue(function () {
      var run = state.runs.filter(function (entry) { return entry.id === runId; })[0];
      if (!run) return fail("no_run");
      var revision = findRevision(run.revisionId);
      var allowed = D.canEditRun(actor(), revision, run.activityKind);
      if (!allowed.ok) return fail(allowed.code);
      var response = state.responses.filter(function (entry) {
        return entry.runId === runId && entry.runItemId === itemId;
      })[0];
      if (!response) return fail("required");
      response.evidence = response.evidence.filter(function (entry) { return entry.id !== evidenceId; });
      audit("evidence_removed", "response", response.id, { evidenceId: evidenceId });
      if (!persist()) return fail("storage");
      notify();
      return success("Evidência retirada da resposta. O histórico de auditoria permanece.");
    });
  }

  function forwardProduction(revisionId) {
    return enqueue(function () {
      var revision = findRevision(revisionId);
      var who = actor();
      var allowed = D.canEditRun(who, revision, "producao");
      if (!allowed.ok) return fail(allowed.code);
      var run = findRun(revisionId, "producao");
      if (!run) return fail("no_run");
      var map = responseMap(run.id);
      var invalid = null;
      run.templateSnapshot.items.forEach(function (item) {
        if (invalid) return;
        var response = map[item.id];
        var status = response ? response.status : "nao_iniciado";
        if (status === "nao_iniciado") invalid = fail("incomplete");
        else {
          var check = D.validateResponse(status, response.comment);
          if (!check.ok) invalid = fail(check.code);
        }
      });
      if (invalid) return invalid;
      revision.workflowStatus = "aguardando_conferencia";
      run.status = "encaminhado";
      run.completedAt = now();
      audit("production_forwarded", "revision", revision.id, {});
      if (!persist()) return fail("storage");
      notify();
      return success("Produção encaminhada para conferência.");
    });
  }

  function returnWithPending(revisionId) {
    return enqueue(function () {
      var revision = findRevision(revisionId);
      var who = actor();
      if (!revision || !who) return fail("required");
      if (who.id === revision.productionOwnerId) return fail("author_cannot_review");
      if (revision.workflowStatus !== "em_conferencia") return fail("review_locked");
      var run = findRun(revision.id, "conferencia");
      if (!run) return fail("no_run");
      var openNc = state.responses.some(function (response) {
        return response.runId === run.id && response.status === "nao_conforme";
      });
      if (!openNc) return fail("no_nc");
      revision.workflowStatus = "com_pendencias";
      audit("returned_with_issues", "revision", revision.id, {});
      if (!persist()) return fail("storage");
      notify();
      return success("Revisão devolvida com pendências.");
    });
  }

  function startCorrection(revisionId) {
    return enqueue(function () {
      var revision = findRevision(revisionId);
      var who = actor();
      if (!revision || !who) return fail("required");
      if (who.role === "consulta") return fail("consulta");
      if (revision.immutable) return fail("immutable");
      if (revision.workflowStatus !== "com_pendencias") return fail("wrong_status", { message: "A correção começa quando há pendências devolvidas." });
      if (who.role === "desenhista" && who.id !== revision.productionOwnerId) return fail("not_production_owner");
      revision.workflowStatus = "em_correcao";
      state.issues.forEach(function (issue) {
        if (issue.revisionId === revision.id && (issue.status === "aberta" || issue.status === "reaberta")) {
          issue.status = "em_correcao";
          issue.events.push({ id: uid(), type: "status_change", payload: { status: "em_correcao" }, actorId: who.id, createdAt: now() });
        }
      });
      audit("correction_started", "revision", revision.id, {});
      if (!persist()) return fail("storage");
      notify();
      return success("Correção iniciada.");
    });
  }

  function addIssueNote(issueId, text, file) {
    return enqueue(async function () {
      var denied = mustWrite();
      if (denied) return denied;
      var issue = state.issues.filter(function (entry) { return entry.id === issueId; })[0];
      if (!issue) return fail("required");
      var revision = findRevision(issue.revisionId);
      if (revision.immutable) return fail("immutable");
      var note = String(text || "").trim();
      if (!note && !file) return fail("required");
      var fileId = null;
      if (file) {
        var stored = await putFile(file);
        if (!stored.ok) return stored;
        fileId = stored.id;
      }
      issue.events.push({
        id: uid(),
        type: fileId ? "evidence" : "comment",
        payload: { comment: note, fileId: fileId, fileName: file ? file.name : "" },
        actorId: state.currentUserId,
        createdAt: now()
      });
      audit("issue_note", "issue", issue.id, {});
      if (!persist()) return fail("storage");
      notify();
      return success("Registro incluído na pendência. O histórico não se apaga.");
    });
  }

  function sendToRecheck(revisionId) {
    return enqueue(function () {
      var revision = findRevision(revisionId);
      var who = actor();
      if (!revision || !who) return fail("required");
      if (revision.workflowStatus !== "em_correcao") return fail("wrong_status", { message: "Peça a reconferência durante a correção." });
      if (who.role === "desenhista" && who.id !== revision.productionOwnerId) return fail("not_production_owner");
      var pending = state.issues.filter(function (issue) {
        return issue.revisionId === revision.id && issue.status !== "resolvida";
      });
      var missing = pending.some(function (issue) {
        return !issue.events.some(function (event) {
          if (event.type !== "comment" && event.type !== "evidence") return false;
          if (!event.payload) return false;
          var wrote = String(event.payload.comment || "").trim() || event.payload.fileId;
          if (!wrote) return false;
          return event.actorId === revision.productionOwnerId || event.actorId === state.currentUserId;
        });
      });
      if (missing) return fail("correction_incomplete");
      pending.forEach(function (issue) {
        issue.status = "aguardando_reconferencia";
        issue.events.push({
          id: uid(), type: "status_change", payload: { status: "aguardando_reconferencia" }, actorId: who.id, createdAt: now()
        });
      });
      revision.workflowStatus = "aguardando_reconferencia";
      audit("recheck_requested", "revision", revision.id, {});
      if (!persist()) return fail("storage");
      notify();
      return success("Reconferência pedida.");
    });
  }

  function recordException(revisionId, runItemId, reason) {
    return enqueue(function () {
      var revision = findRevision(revisionId);
      var who = actor();
      if (!revision || !who) return fail("required");
      if (who.id === revision.productionOwnerId) return fail("self_approval");
      if (["conferente", "coordenador", "admin"].indexOf(who.role) < 0) return fail("role_cannot_approve");
      if (revision.immutable) return fail("immutable");
      if (revision.workflowStatus !== "em_conferencia") return fail("review_locked");
      var text = String(reason || "").trim();
      if (!text) return fail("exception_needs_reason");
      var run = findRun(revision.id, "conferencia");
      if (!run) return fail("no_run");
      var item = run.templateSnapshot.items.filter(function (entry) { return entry.id === runItemId; })[0];
      if (!item) return fail("required");
      if (!D.isBlockingItem(item)) return fail("exception_only_blocking");
      var response = state.responses.filter(function (entry) {
        return entry.runId === run.id && entry.runItemId === runItemId;
      })[0];
      if (!response || response.status !== "nao_conforme") {
        return fail("open_nc", { message: "Registre o item como não conforme antes da exceção. A exceção não vira conformidade." });
      }
      revision.formalExceptions = revision.formalExceptions || [];
      var existing = revision.formalExceptions.filter(function (entry) { return entry.runItemId === runItemId; })[0];
      if (existing) {
        existing.reason = text;
        existing.recordedBy = who.id;
        existing.recordedAt = now();
      } else {
        revision.formalExceptions.push({
          id: uid(), runItemId: runItemId, reason: text, recordedBy: who.id, recordedAt: now()
        });
      }
      audit("formal_exception", "revision", revision.id, { runItemId: runItemId });
      if (!persist()) return fail("storage");
      notify();
      return success(D.message("exception_not_compliance"));
    });
  }

  function approve(revisionId, notes) {
    return enqueue(function () {
      var revision = findRevision(revisionId);
      var who = actor();
      var run = revision && findRun(revision.id, "conferencia");
      if (!run) return fail("no_run", { message: "Abra a conferência antes de aprovar." });
      var decision = D.canApprove(who, revision, run.templateSnapshot.items, responseMap(run.id), exceptionMap(revision));
      if (!decision.ok) {
        if (decision.blockers && decision.blockers.length) {
          var titles = decision.blockers.map(function (blocker) {
            var item = run.templateSnapshot.items.filter(function (entry) { return entry.id === blocker.itemId; })[0];
            return (item ? item.code : "Item") + ": " + D.message(blocker.code);
          });
          return fail("has_blockers", { message: titles.slice(0, 4).join(" ") });
        }
        return fail(decision.code);
      }
      revision.workflowStatus = "aprovado_para_emissao";
      revision.immutable = true;
      revision.approvedAt = now();
      revision.approvedBy = who.id;
      run.status = "concluido";
      run.completedAt = now();
      state.approvals.push({
        id: uid(),
        revisionId: revision.id,
        decision: "aprovado_emissao",
        decidedBy: who.id,
        decidedAt: now(),
        notes: String(notes || "").trim(),
        exceptionRecords: JSON.parse(JSON.stringify(revision.formalExceptions || []))
      });
      audit("revision_approved", "revision", revision.id, {});
      if (!persist()) return fail("storage");
      notify();
      return success("Aprovado para emissão interna. Esta revisão ficou imutável. Não é assinatura digital.");
    });
  }

  function archiveRevision(revisionId, reason) {
    return enqueue(function () {
      var denied = mustManage();
      if (denied) return denied;
      var revision = findRevision(revisionId);
      if (!revision) return fail("required");
      var text = String(reason || "").trim();
      if (!text) return fail("required", { message: "Arquivar exige uma justificativa." });
      revision.archivedAt = now();
      revision.archiveReason = text;
      audit("revision_archived", "revision", revision.id, { reason: text });
      if (!persist()) return fail("storage");
      notify();
      return success("Revisão arquivada. Respostas, pendências e auditoria continuam neste navegador.");
    });
  }

  function restoreRevision(revisionId) {
    return enqueue(function () {
      var denied = mustManage();
      if (denied) return denied;
      var revision = findRevision(revisionId);
      if (!revision) return fail("required");
      revision.archivedAt = null;
      audit("revision_restored", "revision", revision.id, {});
      if (!persist()) return fail("storage");
      notify();
      return success("Revisão de volta à lista ativa.");
    });
  }

  function attachPdf(revisionId, file) {
    return enqueue(async function () {
      var denied = mustWrite();
      if (denied) return denied;
      var revision = findRevision(revisionId);
      if (!revision) return fail("required");
      if (revision.immutable) return fail("immutable");
      var who = actor();
      if (who.role === "consulta") return fail("consulta");
      var stored = await putFile(file);
      if (!stored.ok) return stored;
      revision.pdfFileId = stored.id;
      revision.pdfFileName = file.name || "prancha.pdf";
      audit("pdf_attached", "revision", revision.id, { fileName: revision.pdfFileName });
      if (!persist()) return fail("storage");
      notify();
      return success("PDF disponível para leitura. O que falta continua no checklist, não numa leitura do desenho.");
    });
  }

  function createStandardSheet(input, file) {
    return enqueue(async function () {
      var denied = mustManage();
      if (denied) return denied;
      var title = String(input.title || "").trim();
      if (!title) return fail("required");
      var fileId = null;
      var src = "";
      var mime = "";
      var fileName = "";
      if (file) {
        var stored = await putFile(file);
        if (!stored.ok) return stored;
        fileId = stored.id;
        mime = file.type || file.mime || "";
        fileName = file.name || "";
      }
      var id = uid();
      state.standardSheets.push({
        id: id,
        title: title,
        revisionLabel: String(input.revisionLabel || "").trim(),
        description: String(input.description || "").trim(),
        drawingTypeId: input.drawingTypeId || null,
        status: "published",
        src: src,
        fileName: fileName,
        mime: mime,
        fileId: fileId,
        archivedAt: null,
        didactic: false,
        createdBy: state.currentUserId,
        createdAt: now()
      });
      audit("standard_sheet_created", "standard_sheet", id, { title: title });
      if (!persist()) return fail("storage");
      notify();
      return success("Modelo de prancha incluído na biblioteca.", { id: id });
    });
  }

  function archiveStandardSheet(id, restore) {
    return enqueue(function () {
      var denied = mustManage();
      if (denied) return denied;
      var sheet = state.standardSheets.filter(function (entry) { return entry.id === id; })[0];
      if (!sheet) return fail("required");
      sheet.archivedAt = restore ? null : now();
      audit(restore ? "standard_sheet_restored" : "standard_sheet_archived", "standard_sheet", id, {});
      if (!persist()) return fail("storage");
      notify();
      return success(restore ? "Modelo restaurado." : "Modelo arquivado.");
    });
  }

  root.LunardeliStore = {
    init: init,
    getState: function () { return state; },
    subscribe: function (fn) { listeners.push(fn); },
    currentUser: actor,
    setCurrentUser: setCurrentUser,
    resetSeed: resetSeed,
    exportJson: exportJson,
    importJson: importJson,
    putFile: function (file) { return enqueue(function () { return putFile(file); }); },
    getFile: getFile,
    createDrawingType: createDrawingType,
    archiveDrawingType: archiveDrawingType,
    createSection: createSection,
    saveMasterItem: saveMasterItem,
    archiveMasterItem: archiveMasterItem,
    addMasterMedia: addMasterMedia,
    removeMasterMedia: removeMasterMedia,
    createTemplate: createTemplate,
    addMasterItemToDraft: addMasterItemToDraft,
    addCustomDraftItem: addCustomDraftItem,
    removeDraftItem: removeDraftItem,
    moveDraftItem: moveDraftItem,
    refreshDraftItemFromMaster: refreshDraftItemFromMaster,
    publishDraft: publishDraft,
    startNewVersion: startNewVersion,
    createProject: createProject,
    archiveProject: archiveProject,
    createDrawing: createDrawing,
    newRevision: newRevision,
    startProduction: startProduction,
    startConference: startConference,
    saveResponse: saveResponse,
    addEvidence: addEvidence,
    removeEvidence: removeEvidence,
    forwardProduction: forwardProduction,
    returnWithPending: returnWithPending,
    startCorrection: startCorrection,
    addIssueNote: addIssueNote,
    sendToRecheck: sendToRecheck,
    recordException: recordException,
    approve: approve,
    archiveRevision: archiveRevision,
    restoreRevision: restoreRevision,
    attachPdf: attachPdf,
    createStandardSheet: createStandardSheet,
    archiveStandardSheet: archiveStandardSheet
  };
})(typeof window !== "undefined" ? window : globalThis);
