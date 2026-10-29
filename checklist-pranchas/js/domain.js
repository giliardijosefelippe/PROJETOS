/* Domain rules for the static checklist prototype.
   User-facing messages are pt-BR. Symbols and comments stay in English.
   This file does not invent normative limits. */
(function (root) {
  "use strict";

  var MESSAGES = {
    no_actor: "Selecione quem está usando o protótipo.",
    consulta: "Perfil Consulta só visualiza.",
    archived: "Este registro está arquivado.",
    immutable: "Revisão aprovada é imutável. Abra uma nova revisão para alterar.",
    na_needs_justification: "Não aplicável exige justificativa.",
    nc_needs_comment: "Não conforme exige comentário.",
    missing_evidence: "Este item pede evidência e ainda não tem arquivo.",
    incomplete: "Ainda há itens sem resposta ou pendentes de verificação.",
    open_nc: "Há não conformidade sem correção verificada.",
    blocking_open: "Item crítico ou bloqueante segue em aberto. Corrija e reconfera, ou registre exceção formal.",
    self_approval: "Quem produziu esta revisão não pode aprová-la.",
    author_cannot_review: "Quem produziu esta revisão não faz a conferência dela.",
    role_cannot_approve: "Este papel não aprova prancha.",
    role_cannot_edit_production: "Este papel não preenche a produção.",
    role_cannot_edit_review: "Este papel não preenche a conferência.",
    not_production_owner: "A produção desta revisão está com outra pessoa.",
    production_locked: "A produção desta revisão já foi encaminhada.",
    review_locked: "A conferência só é editada enquanto a revisão está em conferência.",
    wrong_status: "A aprovação só vale com a revisão em conferência.",
    has_blockers: "Ainda há itens que impedem a aprovação.",
    exception_needs_reason: "A exceção formal precisa de um motivo.",
    exception_only_blocking: "Exceção formal é para item crítico ou bloqueante.",
    exception_not_compliance: "Exceção registrada. O item continua não conforme — exceção não é conformidade.",
    need_new_version: "Versão publicada não se edita. Crie uma nova versão.",
    empty_template: "Inclua ao menos um item antes de publicar.",
    duplicate: "Já existe um registro com este código.",
    required: "Preencha os campos obrigatórios.",
    bad_file: "Arquivo não aceito. Use PDF, imagem (PNG, JPG, WEBP, GIF, SVG) ou vídeo MP4/WebM.",
    file_too_big: "Arquivo maior que o limite deste protótipo.",
    no_template: "Publique um mini-checklist deste tipo antes de iniciar.",
    no_run: "Ainda não há checklist aplicado nesta revisão.",
    no_nc: "Não há não conformidade para devolver.",
    correction_incomplete: "Registre a correção de cada pendência antes de pedir a reconferência.",
    storage: "Não foi possível gravar no navegador.",
    bad_import: "O arquivo não é um backup deste protótipo."
  };

  var ROLE_LABEL = {
    admin: "Administração",
    coordenador: "Coordenação",
    desenhista: "Desenho",
    conferente: "Conferência",
    consulta: "Consulta"
  };

  var WORKFLOW_LABEL = {
    rascunho: "Rascunho",
    em_producao: "Em produção",
    aguardando_conferencia: "Aguardando conferência",
    em_conferencia: "Em conferência",
    com_pendencias: "Com pendências",
    em_correcao: "Em correção",
    aguardando_reconferencia: "Aguardando reconferência",
    aprovado_para_emissao: "Aprovado para emissão",
    arquivado: "Arquivado"
  };

  var RESPONSE_LABEL = {
    nao_iniciado: "Não iniciado",
    conforme: "Conforme",
    nao_conforme: "Não conforme",
    nao_aplicavel: "Não aplicável",
    pendente_verificacao: "Pendente de verificação"
  };

  var PRIORITY_LABEL = {
    baixa: "Baixa",
    media: "Média",
    alta: "Alta",
    critica: "Crítica"
  };

  var ISSUE_LABEL = {
    aberta: "Aberta",
    em_correcao: "Em correção",
    aguardando_reconferencia: "Aguardando reconferência",
    resolvida: "Resolvida",
    reaberta: "Reaberta"
  };

  function message(code) {
    return MESSAGES[code] || "Não foi possível concluir.";
  }

  function isBlockingItem(item) {
    return !!(item && (item.isBlocking || item.priority === "critica"));
  }

  function responseOf(responsesByItemId, itemId) {
    return (responsesByItemId && responsesByItemId[itemId]) || {
      status: "nao_iniciado",
      comment: "",
      evidence: []
    };
  }

  function validateResponse(status, comment) {
    var text = String(comment || "").trim();
    if (status === "nao_aplicavel" && !text) return { ok: false, code: "na_needs_justification" };
    if (status === "nao_conforme" && !text) return { ok: false, code: "nc_needs_comment" };
    if (["nao_iniciado", "conforme", "nao_conforme", "nao_aplicavel", "pendente_verificacao"].indexOf(status) < 0) {
      return { ok: false, code: "required" };
    }
    return { ok: true };
  }

  function checklistGaps(items, responsesByItemId) {
    var gaps = [];
    (items || []).forEach(function (item) {
      var response = responseOf(responsesByItemId, item.id);
      var status = response.status || "nao_iniciado";
      var evidence = response.evidence || [];
      if (status === "nao_iniciado") {
        gaps.push({ code: "unchecked", itemId: item.id, needsEvidence: !!item.requiredEvidence });
      } else if (status === "pendente_verificacao") {
        gaps.push({ code: "pending", itemId: item.id });
      } else if (status === "nao_conforme") {
        gaps.push({ code: "nonconform", itemId: item.id });
      }
      if (status === "nao_aplicavel" && !String(response.comment || "").trim()) {
        gaps.push({ code: "na_needs_justification", itemId: item.id });
      }
      if (status !== "nao_iniciado" && status !== "nao_aplicavel" && item.requiredEvidence && !evidence.length) {
        gaps.push({ code: "no_evidence", itemId: item.id });
      }
    });
    return gaps;
  }

  function approvalBlockers(items, responsesByItemId, exceptionsByItemId) {
    var blockers = [];
    (items || []).forEach(function (item) {
      var response = responseOf(responsesByItemId, item.id);
      var status = response.status || "nao_iniciado";
      var comment = String(response.comment || "").trim();
      var exception = exceptionsByItemId && exceptionsByItemId[item.id];
      var hasException = !!(exception && String(exception.reason || "").trim());
      if (status === "nao_aplicavel") {
        if (!comment) blockers.push({ itemId: item.id, code: "na_needs_justification" });
        return;
      }
      if (status === "nao_iniciado" || status === "pendente_verificacao") {
        blockers.push({ itemId: item.id, code: "incomplete" });
        return;
      }
      if (status === "conforme") {
        if (item.requiredEvidence && !(response.evidence || []).length) {
          blockers.push({ itemId: item.id, code: "missing_evidence" });
        }
        return;
      }
      if (status === "nao_conforme") {
        if (!comment) {
          blockers.push({ itemId: item.id, code: "nc_needs_comment" });
          return;
        }
        if (hasException && isBlockingItem(item)) return;
        blockers.push({
          itemId: item.id,
          code: isBlockingItem(item) ? "blocking_open" : "open_nc"
        });
      }
    });
    return blockers;
  }

  function canApprove(actor, revision, items, responsesByItemId, exceptionsByItemId) {
    if (!actor) return { ok: false, code: "no_actor" };
    if (!revision) return { ok: false, code: "required" };
    if (revision.immutable || revision.workflowStatus === "aprovado_para_emissao") {
      return { ok: false, code: "immutable" };
    }
    if (actor.role === "consulta" || actor.role === "desenhista") {
      return { ok: false, code: "role_cannot_approve" };
    }
    if (["conferente", "coordenador", "admin"].indexOf(actor.role) < 0) {
      return { ok: false, code: "role_cannot_approve" };
    }
    if (actor.id && actor.id === revision.productionOwnerId) {
      return { ok: false, code: "self_approval" };
    }
    if (revision.workflowStatus !== "em_conferencia") {
      return { ok: false, code: "wrong_status" };
    }
    var blockers = approvalBlockers(items, responsesByItemId, exceptionsByItemId);
    if (blockers.length) return { ok: false, code: "has_blockers", blockers: blockers };
    return { ok: true };
  }

  function canEditRun(actor, revision, activityKind) {
    if (!actor) return { ok: false, code: "no_actor" };
    if (!revision) return { ok: false, code: "required" };
    if (actor.role === "consulta") return { ok: false, code: "consulta" };
    if (revision.archivedAt) return { ok: false, code: "archived" };
    if (revision.immutable || revision.workflowStatus === "aprovado_para_emissao") {
      return { ok: false, code: "immutable" };
    }
    if (activityKind === "producao") {
      if (["desenhista", "coordenador", "admin"].indexOf(actor.role) < 0) {
        return { ok: false, code: "role_cannot_edit_production" };
      }
      if (revision.workflowStatus !== "em_producao" && revision.workflowStatus !== "rascunho") {
        return { ok: false, code: "production_locked" };
      }
      if (revision.productionOwnerId && actor.role === "desenhista" && actor.id !== revision.productionOwnerId) {
        return { ok: false, code: "not_production_owner" };
      }
      return { ok: true };
    }
    if (activityKind === "conferencia") {
      if (["conferente", "coordenador", "admin"].indexOf(actor.role) < 0) {
        return { ok: false, code: "role_cannot_edit_review" };
      }
      if (actor.id === revision.productionOwnerId) return { ok: false, code: "author_cannot_review" };
      if (revision.workflowStatus !== "em_conferencia") return { ok: false, code: "review_locked" };
      return { ok: true };
    }
    return { ok: false, code: "required" };
  }

  function indicators(items, responsesByItemId) {
    var conforme = 0;
    var nc = 0;
    var na = 0;
    var pendente = 0;
    var naoIniciado = 0;
    (items || []).forEach(function (item) {
      var status = responseOf(responsesByItemId, item.id).status;
      if (status === "conforme") conforme += 1;
      else if (status === "nao_conforme") nc += 1;
      else if (status === "nao_aplicavel") na += 1;
      else if (status === "pendente_verificacao") pendente += 1;
      else naoIniciado += 1;
    });
    var total = (items || []).length;
    var denom = conforme + nc;
    var applicable = total - na;
    var covered = conforme + nc + pendente;
    return {
      conforme: conforme,
      nc: nc,
      na: na,
      pendente: pendente,
      naoIniciado: naoIniciado,
      total: total,
      answered: total - naoIniciado,
      rate: denom ? conforme / denom : null,
      coverage: applicable ? covered / applicable : null
    };
  }

  function nextRevisionCode(existingCodes) {
    var max = -1;
    (existingCodes || []).forEach(function (code) {
      var match = /^R(\d+)$/.exec(String(code || "").trim());
      if (match) max = Math.max(max, parseInt(match[1], 10));
    });
    var n = max + 1;
    return "R" + String(n).padStart(2, "0");
  }

  function cloneSnapshot(version, template, newId) {
    var sections = (version.sections || []).map(function (section) {
      return {
        id: newId(),
        sourceId: section.id,
        title: section.title,
        sortOrder: section.sortOrder
      };
    });
    var sectionMap = {};
    (version.sections || []).forEach(function (section, index) {
      sectionMap[section.id] = sections[index].id;
    });
    var items = (version.items || []).map(function (item) {
      var copy = JSON.parse(JSON.stringify(item));
      copy.sourceItemId = item.id;
      copy.id = newId();
      copy.sectionId = sectionMap[item.sectionId] || item.sectionId;
      return copy;
    });
    return {
      templateId: template.id,
      templateName: template.name,
      versionId: version.id,
      versionNumber: version.versionNumber,
      activityKind: template.activityKind,
      drawingTypeId: template.drawingTypeId,
      sections: sections,
      items: items
    };
  }

  root.LunardeliDomain = {
    MESSAGES: MESSAGES,
    message: message,
    roleLabel: function (role) { return ROLE_LABEL[role] || role; },
    workflowLabel: function (status) { return WORKFLOW_LABEL[status] || status; },
    responseLabel: function (status) { return RESPONSE_LABEL[status] || status; },
    priorityLabel: function (priority) { return PRIORITY_LABEL[priority] || priority; },
    issueLabel: function (status) { return ISSUE_LABEL[status] || status; },
    isBlockingItem: isBlockingItem,
    validateResponse: validateResponse,
    checklistGaps: checklistGaps,
    approvalBlockers: approvalBlockers,
    canApprove: canApprove,
    canEditRun: canEditRun,
    indicators: indicators,
    nextRevisionCode: nextRevisionCode,
    cloneSnapshot: cloneSnapshot
  };
})(typeof window !== "undefined" ? window : globalThis);
