/* Screen controller. Copy shown to people is pt-BR. */
(function () {
  "use strict";

  var D = window.LunardeliDomain;
  var store = window.LunardeliStore;
  var pdf = window.LunardeliPdf;
  var main = document.getElementById("main");
  var view = {
    q: "",
    itemFilter: "todos",
    activity: {},
    selected: {},
    pane: "itens",
    pdfPage: {},
    showArchived: false,
    context: null
  };
  var lastRouteKey = "";
  var searchTimer = 0;
  var toastTimer = 0;

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function auditLabel(action) {
    var labels = {
      seed_loaded: "Exemplo didático carregado",
      seed_reset: "Exemplo didático restaurado",
      state_imported: "JSON importado",
      drawing_type_created: "Tipo de projeto criado",
      drawing_type_archived: "Tipo arquivado",
      drawing_type_restored: "Tipo restaurado",
      section_created: "Seção criada",
      master_item_created: "Item do checklist geral criado",
      master_item_updated: "Item do checklist geral atualizado",
      master_item_archived: "Item arquivado",
      master_item_restored: "Item restaurado",
      master_media_added: "Mídia anexada ao item",
      master_media_removed: "Mídia retirada do item",
      template_created: "Mini-checklist criado",
      draft_item_added: "Item incluído no rascunho",
      draft_custom_item: "Item próprio incluído",
      draft_item_removed: "Item retirado do rascunho",
      draft_item_refreshed: "Item atualizado a partir do geral",
      template_published: "Versão publicada",
      template_new_version: "Nova versão aberta",
      project_created: "Projeto criado",
      project_archived: "Projeto arquivado",
      project_restored: "Projeto restaurado",
      drawing_created: "Prancha criada",
      revision_created: "Revisão criada",
      production_started: "Produção iniciada",
      conference_started: "Conferência iniciada",
      response_saved: "Resposta guardada",
      evidence_added: "Evidência anexada",
      evidence_removed: "Evidência retirada",
      production_forwarded: "Produção encaminhada",
      returned_with_issues: "Devolvida com pendências",
      correction_started: "Correção iniciada",
      issue_note: "Nota na pendência",
      recheck_requested: "Reconferência pedida",
      formal_exception: "Exceção formal registrada",
      revision_approved: "Revisão aprovada para emissão interna",
      revision_archived: "Revisão arquivada",
      revision_restored: "Revisão restaurada",
      pdf_attached: "PDF anexado",
      standard_sheet_created: "Modelo de prancha incluído",
      standard_sheet_archived: "Modelo arquivado",
      standard_sheet_restored: "Modelo restaurado",
      opened: "Pendência aberta",
      comment: "Comentário",
      evidence: "Arquivo",
      status_change: "Situação alterada"
    };
    return labels[action] || "Registro";
  }

  function icon(name) {
    var paths = {
      check: '<path d="M4 12l5 5L20 6"/>',
      x: '<path d="M6 6l12 12M18 6L6 18"/>',
      minus: '<path d="M5 12h14"/>',
      clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v5l3 2"/>',
      alert: '<path d="M12 3l9 16H3L12 3z"/><path d="M12 9v5M12 17h.01"/>',
      play: '<path d="M8 5v14l11-7L8 5z"/>'
    };
    return '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (paths[name] || paths.minus) + "</svg>";
  }

  function chip(kind, label) {
    return '<span class="chip chip-' + kind + '">' + icon(kind === "ok" || kind === "info" ? "check" : kind === "nc" || kind === "block" ? "x" : kind === "pending" || kind === "open" ? "clock" : "minus") + esc(label) + "</span>";
  }

  function responseChip(status) {
    var kind = { conforme: "ok", nao_conforme: "nc", nao_aplicavel: "na", pendente_verificacao: "pending" }[status] || "open";
    return chip(kind, D.responseLabel(status || "nao_iniciado"));
  }

  function workflowChip(status) {
    var kind = status === "aprovado_para_emissao" ? "ok" : (status === "com_pendencias" || status === "em_correcao" ? "nc" : "info");
    return chip(kind, D.workflowLabel(status));
  }

  function pct(value) {
    if (value == null || isNaN(value)) return "—";
    return Math.round(value * 100) + "%";
  }

  function formatWhen(iso) {
    if (!iso) return "—";
    var date = new Date(iso);
    if (isNaN(date.getTime())) return "—";
    return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  }

  function byId(list, id) {
    return (list || []).filter(function (entry) { return entry.id === id; })[0] || null;
  }

  function userName(state, id) {
    var user = byId(state.users, id);
    return user ? user.fullName : "—";
  }

  function typeName(state, id) {
    var type = byId(state.drawingTypes, id);
    return type ? type.name : "—";
  }

  function toast(message, kind) {
    var el = document.getElementById("toast");
    if (!message) return;
    el.className = "toast " + (kind === "err" ? "err" : "ok");
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 4600);
  }

  function flash(result) {
    if (result && result.message) toast(result.message, result.ok ? "ok" : "err");
    return result;
  }

  function parseHash() {
    var parts = (location.hash || "#/").replace(/^#/, "").split("/").filter(Boolean);
    var head = parts[0] || "inicio";
    if (head === "inicio") return { name: "home" };
    if (head === "projetos" && parts[1]) return { name: "project", projectId: parts[1] };
    if (head === "projetos") return { name: "projects" };
    if (head === "revisao" && parts[1]) return { name: "revision", revisionId: parts[1] };
    if (head === "geral" && parts[1] === "novo") return { name: "master-edit", itemId: null };
    if (head === "geral" && parts[1]) return { name: "master-edit", itemId: parts[1] };
    if (head === "geral") return { name: "master" };
    if (head === "tipos" && parts[1]) return { name: "composer", templateId: parts[1] };
    if (head === "tipos") return { name: "types" };
    if (head === "modelos") return { name: "models" };
    if (head === "pendencias" && parts[1]) return { name: "issue", issueId: parts[1] };
    if (head === "pendencias") return { name: "issues" };
    return { name: "home" };
  }

  function routeKey(route) {
    return [route.name, route.projectId, route.revisionId, route.itemId, route.templateId, route.issueId].join(":");
  }

  function page(title, crumbs, body, actions) {
    return '<div class="page"><div class="page-head"><div><p class="crumbs">' + crumbs + '</p><h1>' + title + '</h1></div><div class="page-actions">' + (actions || "") + '</div></div>' + body + "</div>";
  }

  function stepsHtml(text) {
    var lines = String(text || "").split("\n").map(function (line) { return line.trim(); }).filter(Boolean);
    if (!lines.length) return '<p class="hint">Sem passo a passo neste item.</p>';
    return "<ol>" + lines.map(function (line) { return "<li>" + esc(line) + "</li>"; }).join("") + "</ol>";
  }

  function refHtml(ref) {
    ref = ref || {};
    return ["Norma", "Edição", "Item", "Observação"].map(function (label, index) {
      var value = [ref.norm, ref.edition, ref.item, ref.note][index];
      return "<p><strong>" + label + ":</strong> " + esc(value || "não informado") + "</p>";
    }).join("") + '<p class="hint">Campo configurável. O exemplo didático não traz prescrição normativa.</p>';
  }

  function responseMap(state, runId) {
    var map = {};
    state.responses.forEach(function (response) {
      if (response.runId === runId) map[response.runItemId] = response;
    });
    return map;
  }

  function findRun(state, revisionId, kind) {
    return state.runs.filter(function (run) {
      return run.revisionId === revisionId && run.activityKind === kind;
    })[0] || null;
  }

  function captureFocus() {
    var el = document.activeElement;
    if (!el || !el.dataset || !el.dataset.keepfocus) return null;
    return { key: el.dataset.keepfocus, value: el.value, start: el.selectionStart };
  }

  function restoreFocus(saved) {
    if (!saved) return;
    var el = document.querySelector('[data-keepfocus="' + saved.key + '"]');
    if (!el) return;
    el.focus();
    if ("value" in el) el.value = saved.value;
    if (el.setSelectionRange && saved.start != null) {
      try { el.setSelectionRange(saved.start, saved.start); } catch (error) { /* number inputs */ }
    }
  }

  function syncChrome(state, route) {
    var select = document.getElementById("current-user");
    var signature = state.users.map(function (user) { return user.id + user.role; }).join("|");
    if (select.dataset.sig !== signature) {
      select.innerHTML = state.users.map(function (user) {
        return '<option value="' + esc(user.id) + '">' + esc(user.fullName) + " · " + esc(D.roleLabel(user.role)) + "</option>";
      }).join("");
      select.dataset.sig = signature;
    }
    if (select.value !== state.currentUserId) select.value = state.currentUserId;
    var nav = {
      home: "home", projects: "projetos", project: "projetos", revision: "projetos",
      master: "geral", "master-edit": "geral", types: "tipos", composer: "tipos",
      models: "modelos", issues: "pendencias", issue: "pendencias"
    }[route.name] || "home";
    document.querySelectorAll(".nav a").forEach(function (link) {
      var on = link.dataset.nav === nav;
      link.classList.toggle("is-active", on);
      if (on) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    var openIssues = state.issues.filter(function (issue) { return issue.status !== "resolvida"; }).length;
    var badge = document.getElementById("pending-count");
    badge.hidden = openIssues === 0;
    badge.textContent = String(openIssues);
  }

  function renderHome(state) {
    var who = byId(state.users, state.currentUserId);
    var activeProjects = state.projects.filter(function (project) { return !project.archivedAt; }).length;
    var openRevisions = state.revisions.filter(function (revision) {
      return !revision.archivedAt && revision.workflowStatus !== "aprovado_para_emissao";
    });
    var openIssues = state.issues.filter(function (issue) { return issue.status !== "resolvida"; }).length;
    var cards = openRevisions.map(function (revision) {
      var drawing = byId(state.drawings, revision.drawingId);
      var project = drawing && byId(state.projects, drawing.projectId);
      var run = findRun(state, revision.id, "producao");
      var stats = run ? D.indicators(run.templateSnapshot.items, responseMap(state, run.id)) : null;
      return '<a class="card" href="#/revisao/' + esc(revision.id) + '"><strong>' + esc(project ? project.code : "") + " · " + esc(drawing ? drawing.number : "") + " " + esc(revision.revisionCode) + "</strong><p>" + esc(drawing ? drawing.title : "") + "</p><p>" + workflowChip(revision.workflowStatus) + (stats ? " " + esc(stats.answered + " de " + stats.total + " respondidos") : "") + "</p></a>";
    }).join("");
    var recent = state.audit.slice(-6).reverse().map(function (event) {
      return "<li><strong>" + esc(auditLabel(event.action)) + "</strong> · " + esc(userName(state, event.actorId)) + " · " + esc(formatWhen(event.createdAt)) + "</li>";
    }).join("");
    var admin = who && (who.role === "admin" || who.role === "coordenador");
    var tools = admin ? '<section class="card"><h2>Dados deste navegador</h2><p class="hint">O JSON leva os checklists. Arquivos grandes ficam no IndexedDB e não acompanham o backup.</p><div class="inline-actions"><button type="button" class="btn" data-action="export-json">Exportar JSON</button><label class="btn">Importar JSON<input id="import-file" data-action="import-json" type="file" accept="application/json" hidden></label></div><form data-action="reset-seed"><label class="checkline"><input type="checkbox" name="sure"> Substituir tudo pelo exemplo didático</label><button class="btn btn-danger" type="submit">Restaurar exemplo</button></form></section>' : "";
    return page("Início", "Lunardeli | Qualidade",
      '<section class="banner"><strong>Protótipo no navegador, com exemplo didático.</strong><p>As pessoas marcam o que já está feito na prancha. Dá para montar o checklist geral, compor um mini-checklist por tipo de projeto e cruzar um PDF com o que ainda não foi marcado. Isso não verifica norma sozinho e não é assinatura digital.</p><p>Você está como <strong>' + esc(who ? who.fullName : "") + "</strong> (" + esc(who ? D.roleLabel(who.role) : "") + "). Troque a pessoa no topo para simular desenho e conferência.</p></section>" +
      '<section class="grid-stats"><article class="stat"><b>' + activeProjects + '</b><span>Projetos ativos</span></article><article class="stat"><b>' + openRevisions.length + '</b><span>Revisões em aberto</span></article><article class="stat"><b>' + openIssues + '</b><span>Pendências abertas</span></article><article class="stat"><b>' + state.masterItems.filter(function (item) { return !item.archivedAt; }).length + '</b><span>Itens no checklist geral</span></article></section>' +
      '<div class="grid-2"><section class="stack"><h2>Continuar</h2>' + (cards || '<p class="empty">Nenhuma revisão em aberto.</p>') + '</section><section class="stack"><section class="card"><h2>Atividade recente</h2><ul class="timeline">' + (recent || "<li>Sem eventos.</li>") + "</ul><p class=\"hint\">A auditoria só recebe eventos novos. Não há exclusão.</p></section>" + tools + "</section></div>"
    );
  }

  function renderProjects(state) {
    var list = state.projects.filter(function (project) { return view.showArchived || !project.archivedAt; }).map(function (project) {
      var count = state.drawings.filter(function (drawing) { return drawing.projectId === project.id; }).length;
      return "<tr><td><a href=\"#/projetos/" + esc(project.id) + "\">" + esc(project.code) + "</a>" + (project.didactic ? " " + chip("didactic", "Exemplo didático") : "") + "</td><td>" + esc(project.name) + "</td><td>" + count + "</td><td>" + (project.archivedAt ? "Arquivado" : "Ativo") + "</td></tr>";
    }).join("");
    return page("Projetos", '<a href="#/">Início</a>',
      '<div class="grid-2"><section class="card"><div class="inline-actions"><button type="button" class="btn" data-action="toggle-archived">' + (view.showArchived ? "Ocultar arquivados" : "Mostrar arquivados") + '</button></div><table class="table"><thead><tr><th>Código</th><th>Nome</th><th>Pranchas</th><th>Situação</th></tr></thead><tbody>' + (list || '<tr><td colspan="4">Nenhum projeto.</td></tr>') + "</tbody></table></section>" +
      '<form class="card" data-action="create-project"><h2>Novo projeto</h2><label class="field">Código<input name="code" required></label><label class="field">Nome<input name="name" required></label><label class="field">Descrição<textarea name="description"></textarea></label><button class="btn btn-primary" type="submit">Criar projeto</button></form></div>'
    );
  }

  function renderProject(state, projectId) {
    var project = byId(state.projects, projectId);
    if (!project) return page("Projeto", '<a href="#/projetos">Projetos</a>', '<p class="empty">Projeto não encontrado.</p>');
    var drawings = state.drawings.filter(function (drawing) { return drawing.projectId === project.id; }).map(function (drawing) {
      var revisions = state.revisions.filter(function (revision) { return revision.drawingId === drawing.id; });
      var links = revisions.map(function (revision) {
        return '<a href="#/revisao/' + esc(revision.id) + '">' + esc(revision.revisionCode) + "</a> " + workflowChip(revision.workflowStatus);
      }).join(" · ");
      return "<tr><td>" + esc(drawing.number) + "</td><td>" + esc(drawing.title) + "<br><span class=\"hint\">" + esc(drawing.structureLabel || "sem bloco") + " · " + esc(drawing.levelLabel || "sem pavimento") + "</span></td><td>" + esc(typeName(state, drawing.drawingTypeId)) + "</td><td>" + links + '</td><td><button type="button" class="btn" data-action="new-revision" data-drawing="' + esc(drawing.id) + '">Nova revisão</button></td></tr>';
    }).join("");
    var options = state.drawingTypes.filter(function (type) { return !type.archivedAt; }).map(function (type) {
      return '<option value="' + esc(type.id) + '">' + esc(type.name) + "</option>";
    }).join("");
    var archive = project.archivedAt
      ? '<button type="button" class="btn" data-action="restore-project" data-id="' + esc(project.id) + '">Restaurar</button>'
      : '<button type="button" class="btn" data-action="archive-project" data-id="' + esc(project.id) + '">Arquivar projeto</button>';
    return page(esc(project.code) + " — " + esc(project.name), '<a href="#/">Início</a> / <a href="#/projetos">Projetos</a>',
      '<p>' + esc(project.description || "") + " " + (project.didactic ? chip("didactic", "Exemplo didático") : "") + "</p>" +
      '<section class="card"><h2>Pranchas</h2><table class="table"><thead><tr><th>Número</th><th>Título</th><th>Tipo</th><th>Revisões</th><th></th></tr></thead><tbody>' + (drawings || '<tr><td colspan="5">Nenhuma prancha ainda.</td></tr>') + "</tbody></table></section>" +
      '<form class="card" data-action="create-drawing"><h2>Nova prancha</h2><input type="hidden" name="projectId" value="' + esc(project.id) + '"><div class="form-grid"><label class="field">Tipo<select name="drawingTypeId">' + options + '</select></label><label class="field">Número<input name="number" required placeholder="VIG-02"></label><label class="field">Título<input name="title" required></label><label class="field">Torre ou bloco<input name="structureLabel"></label><label class="field">Pavimento<input name="levelLabel"></label></div><button class="btn btn-primary" type="submit">Criar prancha e R00</button></form><div class="inline-actions">' + archive + "</div>",
      "");
  }

  function visibleItems(items, map, filter, q) {
    return items.filter(function (item) {
      var response = map[item.id] || { status: "nao_iniciado", evidence: [] };
      var blob = (item.code + " " + item.title).toLowerCase();
      if (q && blob.indexOf(q.toLowerCase()) < 0) return false;
      if (filter === "abertos" && response.status !== "nao_iniciado") return false;
      if (filter === "bloqueantes" && !D.isBlockingItem(item)) return false;
      if (filter === "sem-evidencia") {
        if (!item.requiredEvidence || response.status === "nao_aplicavel" || (response.evidence || []).length) return false;
      }
      return true;
    });
  }

  function renderRevision(state, revisionId) {
    var revision = byId(state.revisions, revisionId);
    if (!revision) return page("Revisão", '<a href="#/projetos">Projetos</a>', '<p class="empty">Revisão não encontrada.</p>');
    var drawing = byId(state.drawings, revision.drawingId);
    var project = drawing && byId(state.projects, drawing.projectId);
    if (!drawing || !project) return page("Revisão", '<a href="#/projetos">Projetos</a>', '<p class="empty">Prancha não encontrada.</p>');
    var who = byId(state.users, state.currentUserId);
    var activity = view.activity[revision.id] || ((revision.workflowStatus === "rascunho" || revision.workflowStatus === "em_producao") ? "producao" : "conferencia");
    var run = findRun(state, revision.id, activity);
    var other = activity === "producao" ? "conferencia" : "producao";
    var map = run ? responseMap(state, run.id) : {};
    var items = run ? run.templateSnapshot.items.slice().sort(function (a, b) { return a.sortOrder - b.sortOrder; }) : [];
    var shown = visibleItems(items, map, view.itemFilter, view.q);
    var selectedKey = revision.id + ":" + activity;
    var selectedId = view.selected[selectedKey];
    if (!shown.some(function (item) { return item.id === selectedId; })) {
      var gapList = run ? D.checklistGaps(items, map) : [];
      selectedId = (gapList[0] && gapList[0].itemId) || (shown[0] && shown[0].id) || (items[0] && items[0].id) || null;
      view.selected[selectedKey] = selectedId;
    }
    var selected = items.filter(function (item) { return item.id === selectedId; })[0] || null;
    var response = selected && map[selected.id] ? map[selected.id] : { status: "nao_iniciado", comment: "", evidence: [] };
    var edit = run ? D.canEditRun(who, revision, activity) : { ok: false, code: "no_run" };
    view.context = { revisionId: revision.id, runId: run && run.id, itemId: selected && selected.id, activity: activity };
    var stats = run ? D.indicators(items, map) : null;
    var gaps = run ? D.checklistGaps(items, map) : [];
    var gapCopy = {
      unchecked: "Ainda não marcado",
      pending: "Pendente de verificação",
      nonconform: "Não conforme em aberto",
      no_evidence: "Sem evidência",
      na_needs_justification: "Não aplicável sem justificativa"
    };
    var sections = run ? run.templateSnapshot.sections.slice().sort(function (a, b) { return a.sortOrder - b.sortOrder; }) : [];
    var listHtml = "";
    sections.forEach(function (section) {
      var group = shown.filter(function (item) { return item.sectionId === section.id; });
      if (!group.length) return;
      listHtml += '<p class="section-label">' + esc(section.title) + "</p>";
      group.forEach(function (item) {
        var itemResponse = map[item.id] || { status: "nao_iniciado" };
        var locked = !edit.ok || itemResponse.status === "nao_conforme" || itemResponse.status === "nao_aplicavel";
        listHtml += '<li class="item-row' + (item.id === selectedId ? " is-current" : "") + '"><input type="checkbox" data-action="tick" data-run="' + esc(run.id) + '" data-item="' + esc(item.id) + '" aria-label="Marcar ' + esc(item.code) + ' como conforme"' + (itemResponse.status === "conforme" ? " checked" : "") + (locked ? " disabled" : "") + '><button type="button" class="item-open" data-action="select-item" data-item="' + esc(item.id) + '"><span class="code">' + esc(item.code) + (item.didactic ? " · exemplo didático" : "") + '</span>' + esc(item.title) + "<br>" + responseChip(itemResponse.status) + (D.isBlockingItem(item) ? " " + chip("block", "Bloqueante") : "") + "</button></li>";
      });
    });
    var mediaHtml = selected ? (selected.media || []).map(function (media) {
      var src = media.poster || media.src || "";
      var preview = src ? '<img alt="" src="' + esc(src) + '">' : '<span class="hint">Arquivo</span>';
      return '<button type="button" class="thumb" data-action="open-media" data-run="' + esc(run.id) + '" data-item="' + esc(selected.id) + '" data-media="' + esc(media.id) + '">' + preview + "<span>" + icon("play") + " " + esc(media.kind === "video" ? "Abrir vídeo" : "Abrir figura") + "</span></button>";
    }).join("") : "";
    var evidenceHtml = (response.evidence || []).map(function (file) {
      return '<li>' + esc(file.fileName) + ' <button type="button" class="btn" data-action="open-file" data-file="' + esc(file.fileId) + '" data-name="' + esc(file.fileName) + '">Abrir</button>' + (edit.ok ? ' <button type="button" class="btn" data-action="remove-evidence" data-run="' + esc(run.id) + '" data-item="' + esc(selected.id) + '" data-evidence="' + esc(file.id) + '">Retirar</button>' : "") + "</li>";
    }).join("");
    var exception = (revision.formalExceptions || []).filter(function (entry) { return selected && entry.runItemId === selected.id; })[0];
    var currentPublished = null;
    if (run) {
      var template = byId(state.templates, run.templateSnapshot.templateId);
      currentPublished = template && state.templateVersions.filter(function (version) { return version.id === template.currentVersionId; })[0];
    }
    var versionNote = "";
    if (run && currentPublished && currentPublished.versionNumber !== run.templateSnapshot.versionNumber) {
      versionNote = " A versão publicada agora é a v" + currentPublished.versionNumber + ". Esta revisão continua na cópia v" + run.templateSnapshot.versionNumber + ".";
    }
    var sheets = state.standardSheets.filter(function (sheet) {
      return !sheet.archivedAt && drawing && (!sheet.drawingTypeId || sheet.drawingTypeId === drawing.drawingTypeId);
    }).map(function (sheet) {
      return '<button type="button" class="btn" data-action="open-sheet" data-sheet="' + esc(sheet.id) + '">' + esc(sheet.title) + "</button>";
    }).join("");
    var issueNotes = "";
    if (revision.workflowStatus === "em_correcao" || revision.workflowStatus === "com_pendencias") {
      issueNotes = state.issues.filter(function (issue) { return issue.revisionId === revision.id && issue.status !== "resolvida"; }).map(function (issue) {
        return '<article class="card"><h3>' + esc(issue.code) + " · " + esc(issue.title) + "</h3><p>" + chip("open", D.issueLabel(issue.status)) + '</p><p><a href="#/pendencias/' + esc(issue.id) + '">Abrir histórico</a></p>' +
          (revision.workflowStatus === "em_correcao" ? '<form data-action="issue-note"><input type="hidden" name="issueId" value="' + esc(issue.id) + '"><label class="field">O que foi corrigido<textarea name="text" required></textarea></label><label class="field">Arquivo da correção<input type="file" name="file" accept="image/*,video/mp4,video/webm,application/pdf"></label><button class="btn" type="submit">Registrar correção</button></form>' : "") +
          "</article>";
      }).join("");
    }
    var actions = "";
    if (who.role !== "consulta") {
      if (revision.workflowStatus === "rascunho" || (revision.workflowStatus === "em_producao" && !findRun(state, revision.id, "producao"))) {
        actions += '<button type="button" class="btn btn-primary" data-action="start-production" data-revision="' + esc(revision.id) + '">Iniciar produção</button>';
      }
      if (revision.workflowStatus === "em_producao") actions += '<button type="button" class="btn btn-primary" data-action="forward" data-revision="' + esc(revision.id) + '">Encaminhar para conferência</button>';
      if (revision.workflowStatus === "aguardando_conferencia" || revision.workflowStatus === "aguardando_reconferencia") {
        actions += '<button type="button" class="btn btn-primary" data-action="start-conference" data-revision="' + esc(revision.id) + '">Iniciar conferência</button>';
      }
      if (revision.workflowStatus === "em_conferencia") {
        actions += '<button type="button" class="btn" data-action="return-pending" data-revision="' + esc(revision.id) + '">Devolver com pendências</button>';
      }
      if (revision.workflowStatus === "com_pendencias") actions += '<button type="button" class="btn btn-primary" data-action="start-correction" data-revision="' + esc(revision.id) + '">Iniciar correção</button>';
      if (revision.workflowStatus === "em_correcao") actions += '<button type="button" class="btn btn-primary" data-action="send-recheck" data-revision="' + esc(revision.id) + '">Pedir reconferência</button>';
      if (revision.immutable) actions += '<button type="button" class="btn btn-primary" data-action="new-revision" data-drawing="' + esc(drawing.id) + '">Nova revisão</button>';
    }
    var approveBox = "";
    if (revision.workflowStatus === "em_conferencia" && who.role !== "consulta") {
      var conferenceRun = findRun(state, revision.id, "conferencia");
      var decision = conferenceRun
        ? D.canApprove(who, revision, conferenceRun.templateSnapshot.items, responseMap(state, conferenceRun.id), exceptionMap(revision))
        : { ok: false, code: "no_run" };
      approveBox = '<form class="card" data-action="approve"><h2>Aprovação interna</h2><p class="hint">Quem produziu esta revisão (' + esc(userName(state, revision.productionOwnerId)) + ') não pode aprová-la. Exceção formal não vira conformidade. Isto não é assinatura digital.</p><label class="field">Observação<textarea name="notes"></textarea></label><button class="btn btn-primary" type="submit" data-revision="' + esc(revision.id) + '">Aprovar para emissão interna</button>' + (decision.ok ? "" : '<p class="hint">' + esc(D.message(decision.code)) + "</p>") + "</form>";
    }
    var paneClass = function (name) { return view.pane === name ? " is-on" : ""; };
    var detail = "";
    if (!run) {
      detail = '<div class="empty"><p>Este lado ainda não tem checklist aplicado.</p><p class="hint">Produção e conferência usam mini-checklists publicados e guardam uma cópia. Publicar outra versão depois não altera esta revisão.</p></div>';
    } else if (!selected) {
      detail = '<p class="empty">Nenhum item com este filtro.</p>';
    } else {
      detail = '<p class="chips">' + responseChip(response.status) + (selected.didactic ? chip("didactic", "Exemplo didático") : "") + (D.isBlockingItem(selected) ? chip("block", "Bloqueante") : "") + (selected.requiredEvidence ? chip("info", "Pede evidência") : "") + (exception ? chip("pending", "Exceção formal — não é conformidade") : "") + "</p>" +
        "<h2>" + esc(selected.code) + " — " + esc(selected.title) + "</h2>" +
        "<h3>O que verificar</h3><p>" + esc(selected.objective || "Sem objetivo descrito.") + "</p><p><strong>Parâmetro:</strong> " + esc(selected.verifiableParameter || "não informado") + "</p>" +
        "<h3>Como executar</h3>" + stepsHtml(selected.steps) +
        "<h3>Padrão deste exemplo</h3><p>" + esc(selected.acceptanceCriteria || "Sem critério escrito.") + "</p>" +
        (selected.instructions ? "<p>" + esc(selected.instructions) + "</p>" : "") +
        (edit.ok ? "" : '<p class="hint">' + esc(D.message(edit.code)) + "</p>") +
        '<form data-action="save-response"><input type="hidden" name="runId" value="' + esc(run.id) + '"><input type="hidden" name="itemId" value="' + esc(selected.id) + '"><input type="hidden" name="status" value="' + esc(response.status || "nao_iniciado") + '"><div class="status-picker" role="group" aria-label="Resposta do item">' +
        ["conforme", "nao_conforme", "nao_aplicavel", "pendente_verificacao"].map(function (status) {
          return '<button type="button" class="btn' + (response.status === status ? " is-selected" : "") + '" data-action="pick-status" data-status="' + status + '">' + esc(D.responseLabel(status)) + "</button>";
        }).join("") +
        '</div><label class="field" for="response-comment">Comentário ou justificativa<textarea id="response-comment" name="comment">' + esc(response.comment || "") + '</textarea></label><p class="hint">Não aplicável exige justificativa. Não conforme exige comentário.</p><button class="btn btn-primary" type="submit"' + (edit.ok ? "" : " disabled") + ">Salvar resposta</button></form>" +
        '<h3>Evidências</h3><ul>' + (evidenceHtml || "<li>Nenhum arquivo ainda.</li>") + '</ul>' +
        (edit.ok ? '<label class="btn">Anexar evidência<input data-action="add-evidence" data-run="' + esc(run.id) + '" data-item="' + esc(selected.id) + '" type="file" accept="image/*,video/mp4,video/webm,application/pdf" hidden></label>' : "") +
        (edit.ok && activity === "conferencia" && D.isBlockingItem(selected) && response.status === "nao_conforme" ? '<form data-action="record-exception"><input type="hidden" name="revisionId" value="' + esc(revision.id) + '"><input type="hidden" name="itemId" value="' + esc(selected.id) + '"><label class="field">Exceção formal<textarea name="reason" required>' + esc(exception ? exception.reason : "") + '</textarea></label><p class="hint">A exceção libera o bloqueio da aprovação e não marca o item como conforme.</p><button class="btn" type="submit">Registrar exceção formal</button></form>' : "") +
        (exception ? "<p><strong>Exceção registrada:</strong> " + esc(exception.reason) + " · " + esc(userName(state, exception.recordedBy)) + " · " + esc(formatWhen(exception.recordedAt)) + "</p>" : "");
    }
    var gapsHtml = gaps.map(function (gap) {
      var item = items.filter(function (entry) { return entry.id === gap.itemId; })[0];
      var extra = gap.code === "unchecked" && gap.needsEvidence ? " · pede evidência" : "";
      return '<li><button type="button" data-action="select-item" data-item="' + esc(gap.itemId) + '"><strong>' + esc(item ? item.code : "") + "</strong> " + esc(gapCopy[gap.code] || gap.code) + esc(extra) + "</button></li>";
    }).join("");
    var pdfBlock = revision.pdfFileId
      ? '<div id="pdf-slot" class="pdf-frame" data-file="' + esc(revision.pdfFileId) + '" data-page="' + esc(view.pdfPage[revision.id] || 1) + '"></div><div class="pdf-toolbar"><button type="button" class="btn" data-action="pdf-prev" data-revision="' + esc(revision.id) + '">Página anterior</button><span id="pdf-page-label">Página</span><button type="button" class="btn" data-action="pdf-next" data-revision="' + esc(revision.id) + '">Próxima página</button></div>'
      : '<p class="empty">Nenhum PDF nesta revisão.</p>';
    var ownerLine = "Produção: " + esc(userName(state, revision.productionOwnerId)) + " · Conferência: " + esc(userName(state, revision.reviewerId));
    return page(esc(drawing.number) + " · " + esc(revision.revisionCode),
      '<a href="#/projetos/' + esc(project.id) + '">' + esc(project.code) + "</a> / " + esc(drawing.structureLabel || "sem bloco") + " / " + esc(drawing.levelLabel || "sem pavimento"),
      (revision.immutable ? '<section class="banner"><strong>Revisão aprovada para emissão interna. Está imutável.</strong><p>Respostas, evidências e o checklist congelado não mudam. Para alterar, abra uma nova revisão. Não é assinatura digital.</p></section>' : "") +
      (revision.archivedAt ? '<section class="banner"><strong>Arquivada.</strong><p>' + esc(revision.archiveReason) + " Os dados continuam neste navegador.</p></section>" : "") +
      '<section class="banner"><p>' + workflowChip(revision.workflowStatus) + " " + ownerLine + "</p><p>" + (run ? "Checklist ativo: <strong>" + esc(run.templateSnapshot.templateName) + " · v" + esc(run.templateSnapshot.versionNumber) + "</strong>." + esc(versionNote) : "Nenhum checklist ativo neste lado.") + '</p><div class="inline-actions">' + actions + '</div><p class="hint">Atalhos: <kbd>J</kbd><kbd>K</kbd> itens · <kbd>C</kbd> conforme · <kbd>N</kbd> não conforme · <kbd>A</kbd> não aplicável · <kbd>P</kbd> pendente</p></section>' +
      '<div class="pane-switch" role="tablist"><button type="button" class="btn' + (view.pane === "itens" ? " is-selected" : "") + '" data-action="pane" data-pane="itens">Itens</button><button type="button" class="btn' + (view.pane === "resposta" ? " is-selected" : "") + '" data-action="pane" data-pane="resposta">Resposta</button><button type="button" class="btn' + (view.pane === "referencia" ? " is-selected" : "") + '" data-action="pane" data-pane="referencia">Referência e PDF</button></div>' +
      '<div class="workspace"><section class="pane pane-side' + paneClass("itens") + '"><div class="inline-actions"><button type="button" class="btn' + (activity === "producao" ? " is-selected" : "") + '" data-action="switch-activity" data-kind="producao">Produção</button><button type="button" class="btn' + (activity === "conferencia" ? " is-selected" : "") + '" data-action="switch-activity" data-kind="conferencia">Conferência</button></div>' +
      (stats ? '<p>' + stats.answered + " de " + stats.total + ' respondidos</p><div class="progress" role="progressbar" aria-valuenow="' + stats.answered + '" aria-valuemin="0" aria-valuemax="' + stats.total + '" aria-label="Itens respondidos"><span style="width:' + (stats.total ? (stats.answered / stats.total * 100) : 0) + '%"></span></div><p class="hint">Conformidade ' + pct(stats.rate) + " · cobertura " + pct(stats.coverage) + ". A taxa usa só conforme e não conforme. A cobertura conta o que já foi avaliado entre os aplicáveis.</p>" : "") +
      '<label class="field">Buscar<input type="search" data-keepfocus="item-search" value="' + esc(view.q) + '"></label><div class="filters"><button type="button" class="btn' + (view.itemFilter === "todos" ? " is-selected" : "") + '" data-action="item-filter" data-filter="todos">Todos</button><button type="button" class="btn' + (view.itemFilter === "abertos" ? " is-selected" : "") + '" data-action="item-filter" data-filter="abertos">Sem resposta</button><button type="button" class="btn' + (view.itemFilter === "bloqueantes" ? " is-selected" : "") + '" data-action="item-filter" data-filter="bloqueantes">Bloqueantes</button><button type="button" class="btn' + (view.itemFilter === "sem-evidencia" ? " is-selected" : "") + '" data-action="item-filter" data-filter="sem-evidencia">Sem evidência</button></div><ul class="item-list">' + (listHtml || "<li>Nenhum item.</li>") + "</ul></section>" +
      '<section class="pane pane-main' + paneClass("resposta") + '">' + detail + issueNotes + approveBox + "</section>" +
      '<aside class="pane pane-ref' + paneClass("referencia") + '"><h2 id="gaps-title">O que falta <span class="chip">' + gaps.length + '</span></h2><p class="hint">Itens obrigatórios ainda não marcados e itens que pedem evidência. Não é conformidade automática.</p><ul class="gaps" aria-labelledby="gaps-title">' + (run ? (gapsHtml || "<li>Nada pendente neste checklist ativo.</li>") : "<li>Nenhum checklist ativo neste lado.</li>") + "</ul>" +
      '<h2>PDF da prancha</h2><p class="hint">Cruzamento com o checklist ativo. O PDF é para leitura humana: o programa não detecta o que foi desenhado e não avalia norma.</p>' + pdfBlock +
      (who.role !== "consulta" && !revision.immutable ? '<div class="inline-actions"><label class="btn">Enviar PDF<input data-action="attach-pdf" data-revision="' + esc(revision.id) + '" type="file" accept="application/pdf" hidden></label><button type="button" class="btn" data-action="demo-pdf" data-revision="' + esc(revision.id) + '">Usar PDF didático</button></div>' : '<p class="hint">' + esc(revision.pdfFileName || "") + "</p>") +
      '<h2>Como é feito</h2><div class="thumbs">' + (mediaHtml || '<p class="hint">Este item ainda não tem figura ou vídeo. Dá para anexar no checklist geral.</p>') + '</div><h2>Referência</h2>' + (selected ? refHtml(selected.technicalReference) : "") +
      '<h2>Modelos deste tipo</h2><div class="inline-actions">' + (sheets || '<a href="#/modelos">Enviar um modelo</a>') + "</div>" +
      ((who.role === "admin" || who.role === "coordenador") ? (revision.archivedAt ? '<button type="button" class="btn" data-action="restore-revision" data-revision="' + esc(revision.id) + '">Restaurar da lista</button>' : '<details><summary>Arquivar revisão</summary><form data-action="archive-revision"><input type="hidden" name="revisionId" value="' + esc(revision.id) + '"><label class="field">Justificativa<textarea name="reason" required></textarea></label><button class="btn" type="submit">Arquivar</button></form></details>') : "") +
      "</aside></div>"
    );
  }

  function exceptionMap(revision) {
    var map = {};
    (revision.formalExceptions || []).forEach(function (entry) { map[entry.runItemId] = entry; });
    return map;
  }

  function renderMaster(state) {
    var q = view.q.toLowerCase();
    var sections = state.masterSections.filter(function (section) { return !section.archivedAt; });
    var html = sections.map(function (section) {
      var items = state.masterItems.filter(function (item) {
        if (item.sectionId !== section.id) return false;
        if (!view.showArchived && item.archivedAt) return false;
        var blob = (item.code + " " + item.title).toLowerCase();
        return !q || blob.indexOf(q) >= 0;
      });
      if (!items.length) return "";
      return "<section class=\"card\"><h2>" + esc(section.title) + "</h2><ul class=\"item-list\">" + items.map(function (item) {
        return '<li class="item-row"><a href="#/geral/' + esc(item.id) + '"><strong>' + esc(item.code) + "</strong> " + esc(item.title) + "</a> " + (item.didactic ? chip("didactic", "Exemplo didático") : "") + (D.isBlockingItem(item) ? chip("block", "Bloqueante") : "") + (item.archivedAt ? chip("na", "Arquivado") : "") + "</li>";
      }).join("") + "</ul></section>";
    }).join("");
    return page("Checklist geral", '<a href="#/">Início</a>',
      '<section class="banner"><strong>Lista mestre, editável aqui.</strong><p>Ela pode crescer sem publicar nada. Mini-checklists de Forma, Vigas e Lajes copiam os itens quando você publica. Conferências já abertas ficam com a cópia antiga.</p></section>' +
      '<div class="inline-actions"><a class="btn btn-primary" href="#/geral/novo">Novo item</a><button type="button" class="btn" data-action="toggle-archived">' + (view.showArchived ? "Ocultar arquivados" : "Mostrar arquivados") + '</button></div><label class="field">Buscar<input type="search" data-keepfocus="master-search" value="' + esc(view.q) + '"></label>' +
      html +
      '<form class="card" data-action="create-section"><h2>Nova seção</h2><label class="field">Título<input name="title" required></label><button class="btn" type="submit">Criar seção</button></form>'
    );
  }

  function renderMasterEdit(state, itemId) {
    var item = itemId ? byId(state.masterItems, itemId) : null;
    if (itemId && !item) return page("Item", '<a href="#/geral">Checklist geral</a>', '<p class="empty">Item não encontrado.</p>');
    item = item || { code: "", title: "", sectionId: state.masterSections[0] && state.masterSections[0].id, objective: "", steps: "", verifiableParameter: "", acceptanceCriteria: "", instructions: "", priority: "media", isBlocking: false, requiredEvidence: false, technicalReference: { norm: "", edition: "", item: "", note: "" }, media: [] };
    var ref = item.technicalReference || {};
    var options = state.masterSections.filter(function (section) { return !section.archivedAt; }).map(function (section) {
      return '<option value="' + esc(section.id) + '"' + (section.id === item.sectionId ? " selected" : "") + ">" + esc(section.title) + "</option>";
    }).join("");
    var priorities = ["baixa", "media", "alta", "critica"].map(function (priority) {
      return '<option value="' + priority + '"' + (item.priority === priority ? " selected" : "") + ">" + esc(D.priorityLabel(priority)) + "</option>";
    }).join("");
    var media = (item.media || []).map(function (entry) {
      return '<li>' + esc(entry.caption || entry.kind) + ' <button type="button" class="btn" data-action="open-media" data-master="' + esc(item.id) + '" data-media="' + esc(entry.id) + '">Abrir</button> <button type="button" class="btn" data-action="remove-master-media" data-item="' + esc(item.id) + '" data-media="' + esc(entry.id) + '">Retirar</button></li>';
    }).join("");
    return page(item.id ? "Editar item" : "Novo item", '<a href="#/geral">Checklist geral</a>',
      '<form class="card" data-action="save-master-item"><input type="hidden" name="id" value="' + esc(item.id || "") + '"><div class="form-grid"><label class="field">Código<input name="code" required value="' + esc(item.code) + '"></label><label class="field">Seção<select name="sectionId">' + options + '</select></label><label class="field full">Título<input name="title" required value="' + esc(item.title) + '"></label><label class="field">Prioridade<select name="priority">' + priorities + '</select></label><label class="field full">O que verificar<textarea name="objective">' + esc(item.objective) + '</textarea></label><label class="field full">Como executar<textarea name="steps">' + esc(item.steps) + '</textarea></label><label class="field full">Parâmetro verificável<textarea name="verifiableParameter">' + esc(item.verifiableParameter) + '</textarea></label><label class="field full">Padrão esperado neste escritório<textarea name="acceptanceCriteria">' + esc(item.acceptanceCriteria) + '</textarea></label><label class="field full">Instrução interna<textarea name="instructions">' + esc(item.instructions) + '</textarea></label></div><label class="checkline"><input type="checkbox" name="isBlocking"' + (item.isBlocking ? " checked" : "") + "> Item bloqueante</label><label class=\"checkline\"><input type=\"checkbox\" name=\"requiredEvidence\"" + (item.requiredEvidence ? " checked" : "") + "> Exigir evidência</label><h2>Referência técnica</h2><p class=\"hint\">Preencha só o que a equipe já usa. Não invente texto de norma aqui.</p><div class=\"form-grid\"><label class=\"field\">Norma<input name=\"norm\" value=\"" + esc(ref.norm || "") + "\"></label><label class=\"field\">Edição<input name=\"edition\" value=\"" + esc(ref.edition || "") + "\"></label><label class=\"field\">Item<input name=\"item\" value=\"" + esc(ref.item || "") + "\"></label><label class=\"field full\">Observação<textarea name=\"note\">" + esc(ref.note || "") + "</textarea></label></div><button class=\"btn btn-primary\" type=\"submit\">Guardar no checklist geral</button></form>" +
      (item.id ? '<section class="card"><h2>Figura e vídeo</h2><p class="hint">Clique em Abrir para ver como é feito, em tamanho grande. Vídeo MP4 ou WebM abre no player.</p><ul>' + (media || "<li>Sem mídia.</li>") + '</ul><label class="btn">Anexar imagem ou vídeo<input data-action="add-master-media" data-item="' + esc(item.id) + '" type="file" accept="image/*,video/mp4,video/webm" hidden></label></section>' + (item.archivedAt ? '<button type="button" class="btn" data-action="restore-master" data-item="' + esc(item.id) + '">Restaurar item</button>' : '<button type="button" class="btn" data-action="archive-master" data-item="' + esc(item.id) + '">Arquivar item</button>') : '<p class="hint">Guarde o item uma vez para então anexar a mídia.</p>')
    );
  }

  function renderTypes(state) {
    var types = state.drawingTypes.filter(function (type) { return view.showArchived || !type.archivedAt; }).map(function (type) {
      function link(kind, label) {
        var template = state.templates.filter(function (entry) {
          return entry.drawingTypeId === type.id && entry.activityKind === kind && !entry.archivedAt;
        })[0];
        if (!template) return '<button type="button" class="btn" data-action="create-template" data-type="' + esc(type.id) + '" data-kind="' + kind + '">Criar ' + label + "</button>";
        var version = state.templateVersions.filter(function (entry) { return entry.id === template.currentVersionId; })[0];
        return '<a class="btn" href="#/tipos/' + esc(template.id) + '">' + label + (version ? " · v" + version.versionNumber : " · rascunho") + "</a>";
      }
      return "<tr><td>" + esc(type.code) + " · " + esc(type.name) + (type.didactic ? " " + chip("didactic", "Exemplo didático") : "") + "</td><td>" + link("producao", "Produção") + "</td><td>" + link("conferencia", "Conferência") + '</td><td><button type="button" class="btn" data-action="' + (type.archivedAt ? "restore-type" : "archive-type") + '" data-id="' + esc(type.id) + '">' + (type.archivedAt ? "Restaurar" : "Arquivar") + "</button></td></tr>";
    }).join("");
    return page("Mini-checklists por tipo", '<a href="#/">Início</a>',
      '<section class="banner"><strong>Componha o checklist do tipo a partir do geral.</strong><p>Forma, Vigas e Lajes já vêm como exemplo didático. Dá para criar outro tipo e outro mini-checklist sem mexer no código.</p></section>' +
      '<section class="card"><table class="table"><thead><tr><th>Tipo de projeto</th><th>Produção</th><th>Conferência</th><th></th></tr></thead><tbody>' + types + '</tbody></table></section>' +
      '<form class="card" data-action="create-type"><h2>Novo tipo</h2><div class="form-grid"><label class="field">Código<input name="code" required placeholder="PILARES"></label><label class="field">Nome<input name="name" required></label></div><button class="btn btn-primary" type="submit">Criar tipo</button></form>'
    );
  }

  function renderComposer(state, templateId) {
    var template = byId(state.templates, templateId);
    if (!template) return page("Mini-checklist", '<a href="#/tipos">Mini-checklists</a>', '<p class="empty">Não encontrado.</p>');
    var draft = state.templateVersions.filter(function (version) { return version.templateId === template.id && version.status === "draft"; })[0];
    var published = state.templateVersions.filter(function (version) { return version.id === template.currentVersionId; })[0];
    var editing = draft || null;
    var shown = editing || published;
    var items = shown ? shown.items.slice().sort(function (a, b) { return a.sortOrder - b.sortOrder; }) : [];
    var rows = items.map(function (item) {
      var buttons = editing ? '<button type="button" class="btn" data-action="move-draft" data-template="' + esc(template.id) + '" data-item="' + esc(item.id) + '" data-dir="-1">Subir</button> <button type="button" class="btn" data-action="move-draft" data-template="' + esc(template.id) + '" data-item="' + esc(item.id) + '" data-dir="1">Descer</button> <button type="button" class="btn" data-action="remove-draft" data-template="' + esc(template.id) + '" data-item="' + esc(item.id) + '">Retirar</button>' + (item.masterItemId ? ' <button type="button" class="btn" data-action="refresh-draft" data-template="' + esc(template.id) + '" data-item="' + esc(item.id) + '">Trazer texto do geral</button>' : "") : "";
      return "<li class=\"item-row\"><div><strong>" + esc(item.code) + "</strong> " + esc(item.title) + "<br>" + (D.isBlockingItem(item) ? chip("block", "Bloqueante") : chip("info", D.priorityLabel(item.priority))) + "</div><div class=\"inline-actions\">" + buttons + "</div></li>";
    }).join("");
    var master = state.masterItems.filter(function (item) { return !item.archivedAt; }).map(function (item) {
      var already = shown && shown.items.some(function (entry) { return entry.masterItemId === item.id; });
      return '<li class="item-row"><span><strong>' + esc(item.code) + "</strong> " + esc(item.title) + '</span>' + (already ? '<span class="hint">já incluído</span>' : '<button type="button" class="btn" data-action="add-master-to-draft" data-template="' + esc(template.id) + '" data-item="' + esc(item.id) + '">Incluir</button>') + "</li>";
    }).join("");
    var history = state.templateVersions.filter(function (version) { return version.templateId === template.id; }).sort(function (a, b) { return a.versionNumber - b.versionNumber; }).map(function (version) {
      return "<li>v" + version.versionNumber + " · " + esc(version.status === "published" ? "publicada" : version.status === "draft" ? "rascunho" : "substituída") + "</li>";
    }).join("");
    return page(esc(template.name), '<a href="#/tipos">Mini-checklists</a>',
      '<section class="banner"><strong>' + esc(typeName(state, template.drawingTypeId)) + " · " + esc(template.activityKind === "conferencia" ? "Conferência" : "Produção") + '.</strong><p>Publicar congela esta versão. Uma revisão que já usou a anterior guarda o snapshot e não acompanha a edição.</p></section>' +
      '<div class="inline-actions">' + (editing ? "" : '<button type="button" class="btn btn-primary" data-action="new-version" data-template="' + esc(template.id) + '">Criar nova versão para editar</button>') + "</div>" +
      '<div class="grid-2"><section class="card"><h2>Checklist geral</h2><ul class="item-list">' + master + '</ul><form data-action="custom-draft-item"><h3>Item só deste mini-checklist</h3><input type="hidden" name="templateId" value="' + esc(template.id) + '"><label class="field">Código<input name="code" required></label><label class="field">Título<input name="title" required></label><label class="checkline"><input type="checkbox" name="isBlocking"> Bloqueante</label><label class="checkline"><input type="checkbox" name="requiredEvidence"> Pede evidência</label><button class="btn" type="submit">Incluir item próprio</button></form></section>' +
      '<section class="card"><h2>' + (editing ? "Rascunho v" + editing.versionNumber : "Publicada v" + (published ? published.versionNumber : "—")) + '</h2><ul class="item-list">' + (rows || "<li>Nenhum item.</li>") + "</ul>" +
      (editing ? '<form data-action="publish-draft"><input type="hidden" name="templateId" value="' + esc(template.id) + '"><label class="field">Nota da versão<input name="note"></label><button class="btn btn-primary" type="submit">Publicar versão</button></form>' : '<p class="hint">Esta composição publicada está congelada.</p>') +
      "<h3>Versões</h3><ul>" + history + "</ul></section></div>"
    );
  }

  function renderModels(state) {
    var cards = state.standardSheets.filter(function (sheet) { return view.showArchived || !sheet.archivedAt; }).map(function (sheet) {
      var src = sheet.src || "";
      return '<article class="card"><button type="button" class="thumb" data-action="open-sheet" data-sheet="' + esc(sheet.id) + '">' + (src ? '<img alt="" src="' + esc(src) + '">' : "<span>Abrir arquivo</span>") + "<span>" + icon("play") + " Abrir</span></button><h2>" + esc(sheet.title) + "</h2><p>" + esc(sheet.description || "") + "</p><p>" + (sheet.didactic ? chip("didactic", "Exemplo didático") : "") + " " + esc(typeName(state, sheet.drawingTypeId)) + "</p>" +
        '<button type="button" class="btn" data-action="' + (sheet.archivedAt ? "restore-sheet" : "archive-sheet") + '" data-id="' + esc(sheet.id) + '">' + (sheet.archivedAt ? "Restaurar" : "Arquivar") + "</button></article>";
    }).join("");
    var options = state.drawingTypes.filter(function (type) { return !type.archivedAt; }).map(function (type) {
      return '<option value="' + esc(type.id) + '">' + esc(type.name) + "</option>";
    }).join("");
    return page("Modelos de prancha", '<a href="#/">Início</a>',
      '<section class="banner"><strong>Pranchas já usadas como referência.</strong><p>Anexe PDF ou imagem. Abrir mostra a folha — não é um arquivo decorativo.</p></section><div class="grid-2">' + (cards || '<p class="empty">Nenhum modelo.</p>') + "</div>" +
      '<form class="card" data-action="create-sheet"><h2>Novo modelo</h2><div class="form-grid"><label class="field">Título<input name="title" required></label><label class="field">Revisão do modelo<input name="revisionLabel"></label><label class="field">Tipo<select name="drawingTypeId"><option value="">Qualquer</option>' + options + '</select></label><label class="field full">Descrição<textarea name="description"></textarea></label><label class="field full">Arquivo<input type="file" name="file" accept="image/*,application/pdf"></label></div><button class="btn btn-primary" type="submit">Incluir na biblioteca</button></form>'
    );
  }

  function renderIssues(state) {
    var rows = state.issues.filter(function (issue) {
      if (view.itemFilter !== "todos" && issue.status !== view.itemFilter) return false;
      var blob = (issue.code + " " + issue.title).toLowerCase();
      return !view.q || blob.indexOf(view.q.toLowerCase()) >= 0;
    }).map(function (issue) {
      return "<tr><td><a href=\"#/pendencias/" + esc(issue.id) + "\">" + esc(issue.code) + "</a></td><td>" + esc(issue.title) + "</td><td>" + chip("open", D.issueLabel(issue.status)) + "</td><td>" + esc(userName(state, issue.assigneeId)) + "</td><td>" + esc(formatWhen(issue.openedAt)) + "</td></tr>";
    }).join("");
    var filters = ["todos", "aberta", "em_correcao", "aguardando_reconferencia", "resolvida", "reaberta"].map(function (status) {
      var label = status === "todos" ? "Todas" : D.issueLabel(status);
      return '<button type="button" class="btn' + (view.itemFilter === status ? " is-selected" : "") + '" data-action="issue-filter" data-filter="' + status + '">' + esc(label) + "</button>";
    }).join("");
    return page("Pendências", '<a href="#/">Início</a>',
      '<div class="filters">' + filters + '</div><label class="field">Buscar<input type="search" data-keepfocus="issue-search" value="' + esc(view.q) + '"></label><table class="table"><thead><tr><th>Código</th><th>Item</th><th>Situação</th><th>Responsável</th><th>Aberta em</th></tr></thead><tbody>' + (rows || '<tr><td colspan="5">Nenhuma pendência.</td></tr>') + "</tbody></table>"
    );
  }

  function renderIssue(state, issueId) {
    var issue = byId(state.issues, issueId);
    if (!issue) return page("Pendência", '<a href="#/pendencias">Pendências</a>', '<p class="empty">Não encontrada.</p>');
    var events = (issue.events || []).map(function (event) {
      var file = event.payload && event.payload.fileId ? ' <button type="button" class="btn" data-action="open-file" data-file="' + esc(event.payload.fileId) + '" data-name="' + esc(event.payload.fileName || "arquivo") + '">Abrir arquivo</button>' : "";
      return "<li><strong>" + esc(auditLabel(event.type)) + "</strong> · " + esc(userName(state, event.actorId)) + " · " + esc(formatWhen(event.createdAt)) + "<br>" + esc(event.payload && event.payload.comment || event.payload && event.payload.status || "") + file + "</li>";
    }).join("");
    return page(esc(issue.code), '<a href="#/pendencias">Pendências</a> / <a href="#/revisao/' + esc(issue.revisionId) + '">Revisão</a>',
      "<p>" + esc(issue.title) + "</p><p>" + chip("open", D.issueLabel(issue.status)) + " " + chip("info", D.priorityLabel(issue.priority)) + "</p><p>" + esc(issue.description || "") + "</p>" +
      '<section class="card"><h2>Histórico</h2><ul class="timeline">' + events + '</ul><p class="hint">Eventos não são apagados.</p><form data-action="issue-note"><input type="hidden" name="issueId" value="' + esc(issue.id) + '"><label class="field">Comentário<textarea name="text"></textarea></label><label class="field">Arquivo<input type="file" name="file" accept="image/*,video/mp4,video/webm,application/pdf"></label><button class="btn" type="submit">Acrescentar ao histórico</button></form></section>'
    );
  }

  function render() {
    var state = store.getState();
    if (!state) return;
    var route = parseHash();
    var key = routeKey(route);
    var routeChanged = key !== lastRouteKey;
    if (routeChanged) {
      view.q = "";
      view.itemFilter = "todos";
      lastRouteKey = key;
    }
    var focus = captureFocus();
    var html = "";
    if (route.name === "home") html = renderHome(state);
    else if (route.name === "projects") html = renderProjects(state);
    else if (route.name === "project") html = renderProject(state, route.projectId);
    else if (route.name === "revision") html = renderRevision(state, route.revisionId);
    else if (route.name === "master") html = renderMaster(state);
    else if (route.name === "master-edit") html = renderMasterEdit(state, route.itemId);
    else if (route.name === "types") html = renderTypes(state);
    else if (route.name === "composer") html = renderComposer(state, route.templateId);
    else if (route.name === "models") html = renderModels(state);
    else if (route.name === "issues") html = renderIssues(state);
    else if (route.name === "issue") html = renderIssue(state, route.issueId);
    main.innerHTML = html;
    syncChrome(state, route);
    if (routeChanged) window.scrollTo(0, 0);
    restoreFocus(focus);
    paintPdf();
  }

  async function paintPdf() {
    var slot = document.getElementById("pdf-slot");
    if (!slot) return;
    var fileId = slot.dataset.file;
    var pageNumber = Number(slot.dataset.page) || 1;
    var file = await store.getFile(fileId);
    if (!file || !slot.isConnected) return;
    try {
      var info = await pdf.renderInto(slot, fileId, file, pageNumber);
      var label = document.getElementById("pdf-page-label");
      if (label && info) label.textContent = "Página " + info.page + " de " + info.pages;
      view.pdfPages = info && info.pages;
    } catch (error) {
      var url = file.dataUrl || URL.createObjectURL(file.blob);
      slot.replaceChildren();
      var embed = document.createElement("embed");
      embed.type = "application/pdf";
      embed.src = url;
      embed.style.width = "100%";
      embed.style.height = "420px";
      var note = document.createElement("p");
      note.className = "hint";
      note.textContent = "A pré-visualização página a página não carregou. O leitor do navegador mostra o arquivo. A lista do que falta continua no checklist.";
      slot.appendChild(embed);
      slot.appendChild(note);
    }
  }

  function closeLightbox() {
    var box = document.getElementById("lightbox");
    var video = box.querySelector("video");
    if (video) video.pause();
    box.hidden = true;
  }

  async function openMedia(media) {
    if (!media) { toast("Não encontrei esta mídia.", "err"); return; }
    var box = document.getElementById("lightbox");
    var body = document.getElementById("lightbox-body");
    var title = document.getElementById("lightbox-title");
    title.textContent = media.caption || "Como é feito";
    body.replaceChildren();
    var url = media.src || "";
    var mime = media.mime || "";
    if (media.fileId) {
      var file = await store.getFile(media.fileId);
      if (!file) { toast("O arquivo não está mais neste navegador.", "err"); return; }
      mime = file.mime || mime;
      url = file.dataUrl || URL.createObjectURL(file.blob);
    }
    var isVideo = media.kind === "video" || mime.indexOf("video/") === 0;
    var isPdf = mime === "application/pdf" || /\.pdf($|\?)/i.test(url) || /\.pdf$/i.test(media.fileName || "");
    if (isVideo) {
      var video = document.createElement("video");
      video.controls = true;
      video.playsInline = true;
      if (media.poster) video.poster = media.poster;
      video.src = url;
      body.appendChild(video);
      video.play().catch(function () {});
    } else if (isPdf) {
      var frame = document.createElement("div");
      frame.className = "pdf-frame";
      body.appendChild(frame);
      try {
        await pdf.renderInto(frame, media.fileId || url, media.fileId ? await store.getFile(media.fileId) : { dataUrl: url }, 1);
      } catch (error) {
        var embed = document.createElement("embed");
        embed.type = "application/pdf";
        embed.src = url;
        embed.style.width = "100%";
        embed.style.height = "480px";
        frame.appendChild(embed);
      }
    } else {
      var img = document.createElement("img");
      img.src = url;
      img.alt = media.caption || "Figura do item";
      body.appendChild(img);
    }
    if (media.steps) {
      var how = document.createElement("div");
      how.innerHTML = "<h3>Como executar</h3>" + stepsHtml(media.steps);
      body.appendChild(how);
    } else if (media.caption) {
      var cap = document.createElement("p");
      cap.textContent = media.caption;
      body.appendChild(cap);
    }
    box.hidden = false;
    document.getElementById("lightbox-close").focus();
  }

  function mediaFrom(state, dataset) {
    if (dataset.sheet) {
      var sheet = byId(state.standardSheets, dataset.sheet);
      if (!sheet) return null;
      return { kind: sheet.mime && sheet.mime.indexOf("pdf") >= 0 ? "attachment" : "image", src: sheet.src, fileId: sheet.fileId, mime: sheet.mime, caption: sheet.title + (sheet.description ? " — " + sheet.description : ""), fileName: sheet.fileName };
    }
    if (dataset.master) {
      var master = byId(state.masterItems, dataset.master);
      var found = master && (master.media || []).filter(function (media) { return media.id === dataset.media; })[0];
      if (!found) return null;
      return Object.assign({ steps: master.steps }, found);
    }
    var run = byId(state.runs, dataset.run);
    var item = run && run.templateSnapshot.items.filter(function (entry) { return entry.id === dataset.item; })[0];
    var media = item && (item.media || []).filter(function (entry) { return entry.id === dataset.media; })[0];
    if (!media) return null;
    return Object.assign({ steps: item.steps }, media);
  }

  function valuesFrom(form) {
    var data = {};
    if (!form) return data;
    form.querySelectorAll("[name]").forEach(function (el) {
      if (el.type === "file") data[el.name] = el.files && el.files[0];
      else if (el.type === "checkbox") data[el.name] = el.checked;
      else data[el.name] = el.value;
    });
    return data;
  }

  async function onTick(el) {
    var state = store.getState();
    var response = state.responses.filter(function (entry) {
      return entry.runId === el.dataset.run && entry.runItemId === el.dataset.item;
    })[0];
    var status = el.checked ? "conforme" : "nao_iniciado";
    var saved = await store.saveResponse(el.dataset.run, el.dataset.item, status, response ? response.comment : "");
    flash(saved);
    if (!saved.ok) el.checked = !el.checked;
  }

  function moveSelection(delta) {
    var buttons = Array.prototype.slice.call(document.querySelectorAll("[data-action=select-item]"));
    if (!buttons.length || !view.context) return;
    var index = buttons.findIndex(function (button) { return button.dataset.item === view.context.itemId; });
    var next = buttons[Math.min(buttons.length - 1, Math.max(0, index + delta))];
    if (!next) return;
    view.selected[view.context.revisionId + ":" + view.context.activity] = next.dataset.item;
    view.pane = "resposta";
    render();
  }

  async function handle(el, event, form) {
    var action = el.dataset.action || (form && form.dataset.action);
    var state = store.getState();
    var data = valuesFrom(form || el.closest("form"));
    if (action === "close-lightbox") { closeLightbox(); return; }
    if (action === "toggle-nav") {
      var open = document.body.classList.toggle("nav-open");
      document.getElementById("nav-toggle").setAttribute("aria-expanded", open ? "true" : "false");
      return;
    }
    if (action === "toggle-archived") { view.showArchived = !view.showArchived; render(); return; }
    if (action === "pane") { view.pane = el.dataset.pane; render(); return; }
    if (action === "item-filter" || action === "issue-filter") { view.itemFilter = el.dataset.filter; render(); return; }
    if (action === "switch-activity") {
      if (view.context) view.activity[view.context.revisionId] = el.dataset.kind;
      view.pane = "itens";
      render();
      return;
    }
    if (action === "select-item") {
      if (view.context) view.selected[view.context.revisionId + ":" + view.context.activity] = el.dataset.item;
      view.pane = "resposta";
      render();
      return;
    }
    if (action === "pick-status") {
      var hidden = document.querySelector('form[data-action="save-response"] [name="status"]');
      if (hidden) hidden.value = el.dataset.status;
      document.querySelectorAll(".status-picker button").forEach(function (button) {
        button.classList.toggle("is-selected", button === el);
      });
      if (el.dataset.status === "nao_conforme" || el.dataset.status === "nao_aplicavel") {
        var area = document.getElementById("response-comment");
        if (area) area.focus();
      }
      return;
    }
    if (action === "open-media" || action === "open-sheet") { await openMedia(mediaFrom(state, el.dataset)); return; }
    if (action === "open-file") {
      await openMedia({ fileId: el.dataset.file, caption: el.dataset.name || "Arquivo", fileName: el.dataset.name || "" });
      return;
    }
    if (action === "export-json") {
      var blob = new Blob([store.exportJson()], { type: "application/json" });
      var link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "lunardeli-checklist.json";
      link.click();
      toast("JSON gerado neste computador.");
      return;
    }
    if (action === "pdf-prev" || action === "pdf-next") {
      var current = view.pdfPage[el.dataset.revision] || 1;
      var pages = view.pdfPages || 1;
      view.pdfPage[el.dataset.revision] = action === "pdf-next" ? Math.min(pages, current + 1) : Math.max(1, current - 1);
      render();
      return;
    }
    if (action === "demo-pdf") {
      var file = new File([pdf.buildDidacticPdfBlob()], "exemplo-didatico.pdf", { type: "application/pdf" });
      flash(await store.attachPdf(el.dataset.revision, file));
      return;
    }
    if (action === "start-production") { flash(await store.startProduction(el.dataset.revision)); return; }
    if (action === "start-conference") {
      view.activity[el.dataset.revision] = "conferencia";
      flash(await store.startConference(el.dataset.revision));
      return;
    }
    if (action === "forward") { flash(await store.forwardProduction(el.dataset.revision)); return; }
    if (action === "return-pending") { flash(await store.returnWithPending(el.dataset.revision)); return; }
    if (action === "start-correction") { flash(await store.startCorrection(el.dataset.revision)); return; }
    if (action === "send-recheck") { flash(await store.sendToRecheck(el.dataset.revision)); return; }
    if (action === "new-revision") {
      var created = await store.newRevision(el.dataset.drawing);
      flash(created);
      if (created.ok) location.hash = "#/revisao/" + created.id;
      return;
    }
    if (action === "archive-project") { flash(await store.archiveProject(el.dataset.id, false)); return; }
    if (action === "restore-project") { flash(await store.archiveProject(el.dataset.id, true)); return; }
    if (action === "archive-type") { flash(await store.archiveDrawingType(el.dataset.id, false)); return; }
    if (action === "restore-type") { flash(await store.archiveDrawingType(el.dataset.id, true)); return; }
    if (action === "archive-master") { flash(await store.archiveMasterItem(el.dataset.item, false)); return; }
    if (action === "restore-master") { flash(await store.archiveMasterItem(el.dataset.item, true)); return; }
    if (action === "remove-master-media") { flash(await store.removeMasterMedia(el.dataset.item, el.dataset.media)); return; }
    if (action === "remove-evidence") { flash(await store.removeEvidence(el.dataset.run, el.dataset.item, el.dataset.evidence)); return; }
    if (action === "create-template") {
      var made = await store.createTemplate(el.dataset.type, el.dataset.kind);
      flash(made);
      if (made.ok) location.hash = "#/tipos/" + made.id;
      return;
    }
    if (action === "add-master-to-draft") { flash(await store.addMasterItemToDraft(el.dataset.template, el.dataset.item)); return; }
    if (action === "remove-draft") { flash(await store.removeDraftItem(el.dataset.template, el.dataset.item)); return; }
    if (action === "move-draft") { await store.moveDraftItem(el.dataset.template, el.dataset.item, Number(el.dataset.dir)); return; }
    if (action === "refresh-draft") { flash(await store.refreshDraftItemFromMaster(el.dataset.template, el.dataset.item)); return; }
    if (action === "new-version") { flash(await store.startNewVersion(el.dataset.template)); return; }
    if (action === "archive-sheet") { flash(await store.archiveStandardSheet(el.dataset.id, false)); return; }
    if (action === "restore-sheet") { flash(await store.archiveStandardSheet(el.dataset.id, true)); return; }
    if (action === "restore-revision") { flash(await store.restoreRevision(el.dataset.revision)); return; }
    if (action === "create-project") {
      var project = await store.createProject(data);
      flash(project);
      if (project.ok) location.hash = "#/projetos/" + project.id;
      return;
    }
    if (action === "create-drawing") {
      var drawing = await store.createDrawing(data);
      flash(drawing);
      if (drawing.ok) location.hash = "#/revisao/" + drawing.revisionId;
      return;
    }
    if (action === "create-type") { flash(await store.createDrawingType(data)); return; }
    if (action === "create-section") { flash(await store.createSection(data.title)); return; }
    if (action === "save-master-item") {
      var saved = await store.saveMasterItem(data);
      flash(saved);
      if (saved.ok && saved.id) location.hash = "#/geral/" + saved.id;
      return;
    }
    if (action === "save-response") {
      flash(await store.saveResponse(data.runId, data.itemId, data.status, data.comment));
      return;
    }
    if (action === "record-exception") { flash(await store.recordException(data.revisionId, data.itemId, data.reason)); return; }
    if (action === "approve") {
      var revisionId = (form && form.querySelector("[data-revision]") && form.querySelector("[data-revision]").dataset.revision) || (view.context && view.context.revisionId);
      flash(await store.approve(revisionId, data.notes));
      return;
    }
    if (action === "archive-revision") { flash(await store.archiveRevision(data.revisionId, data.reason)); return; }
    if (action === "publish-draft") { flash(await store.publishDraft(data.templateId, data.note)); return; }
    if (action === "custom-draft-item") { flash(await store.addCustomDraftItem(data.templateId, data)); return; }
    if (action === "create-sheet") { flash(await store.createStandardSheet(data, data.file)); return; }
    if (action === "issue-note") { flash(await store.addIssueNote(data.issueId, data.text, data.file)); return; }
    if (action === "reset-seed") {
      if (!data.sure) { toast("Marque a confirmação para substituir os dados deste navegador.", "err"); return; }
      flash(await store.resetSeed());
      return;
    }
  }

  document.addEventListener("click", function (event) {
    var link = event.target.closest(".nav a");
    if (link) document.body.classList.remove("nav-open");
    var el = event.target.closest("[data-action]");
    if (!el || el.type === "submit") return;
    if (el.dataset.action === "nav-toggle") return;
    handle(el, event);
  });

  document.addEventListener("submit", function (event) {
    event.preventDefault();
    var submitter = event.submitter;
    handle(submitter || event.target, event, event.target);
  });

  document.addEventListener("change", function (event) {
    var el = event.target;
    if (el.id === "current-user") { store.setCurrentUser(el.value); return; }
    if (el.dataset.action === "tick") { onTick(el); return; }
    if (el.dataset.action === "add-evidence") {
      if (el.files && el.files[0]) store.addEvidence(el.dataset.run, el.dataset.item, el.files[0]).then(flash);
      return;
    }
    if (el.dataset.action === "add-master-media") {
      if (el.files && el.files[0]) store.addMasterMedia(el.dataset.item, el.files[0], { caption: el.files[0].name }).then(flash);
      return;
    }
    if (el.dataset.action === "attach-pdf") {
      if (el.files && el.files[0]) {
        var previous = byId(store.getState().revisions, el.dataset.revision);
        if (previous && previous.pdfFileId) pdf.forget(previous.pdfFileId);
        store.attachPdf(el.dataset.revision, el.files[0]).then(flash);
      }
      return;
    }
    if (el.dataset.action === "import-json") {
      var file = el.files && el.files[0];
      if (!file) return;
      file.text().then(function (text) { return store.importJson(text); }).then(flash);
    }
  });

  document.addEventListener("input", function (event) {
    if (!event.target.dataset.keepfocus) return;
    view.q = event.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(render, 160);
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") closeLightbox();
    var tag = document.activeElement && document.activeElement.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (parseHash().name !== "revision" || !view.context) return;
    if (event.key === "j" || event.key === "ArrowDown") { moveSelection(1); event.preventDefault(); }
    if (event.key === "k" || event.key === "ArrowUp") { moveSelection(-1); event.preventDefault(); }
    if (event.key === "c" || event.key === "C") {
      var box = document.querySelector('[data-action="tick"][data-item="' + view.context.itemId + '"]');
      if (box && !box.disabled) { box.checked = true; onTick(box); }
    }
    if (event.key === "n" || event.key === "N" || event.key === "a" || event.key === "A" || event.key === "p" || event.key === "P") {
      var status = (event.key === "n" || event.key === "N") ? "nao_conforme" : (event.key === "a" || event.key === "A") ? "nao_aplicavel" : "pendente_verificacao";
      var hidden = document.querySelector('form[data-action="save-response"] [name="status"]');
      if (hidden) hidden.value = status;
      var area = document.getElementById("response-comment");
      if (area) area.focus();
    }
  });

  document.getElementById("nav-toggle").addEventListener("click", function () {
    var open = document.body.classList.toggle("nav-open");
    this.setAttribute("aria-expanded", open ? "true" : "false");
  });

  window.addEventListener("hashchange", render);

  store.init().then(function () {
    store.subscribe(render);
    render();
  }).catch(function () {
    main.innerHTML = '<p class="page">Não foi possível abrir os dados neste navegador.</p>';
  });
})();
