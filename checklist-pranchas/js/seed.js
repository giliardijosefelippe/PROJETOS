/* Didactic starter data. Editable in the app after load.
   Reference fields stay empty on purpose: do not invent norm text. */
(function (root) {
  "use strict";

  var EMPTY_REF = {
    norm: "",
    edition: "",
    item: "",
    note: "Campo livre para a equipe. Este exemplo didático não traz prescrição normativa."
  };

  function item(partial) {
    return {
      objective: "",
      steps: "",
      verifiableParameter: "",
      acceptanceCriteria: "",
      technicalReference: JSON.parse(JSON.stringify(EMPTY_REF)),
      priority: "media",
      isBlocking: false,
      requiredEvidence: false,
      instructions: "",
      didactic: true,
      archivedAt: null,
      media: [],
      sortOrder: 0,
      id: partial.id,
      sectionId: partial.sectionId,
      code: partial.code,
      title: partial.title,
      objective: partial.objective,
      steps: partial.steps,
      verifiableParameter: partial.verifiableParameter,
      acceptanceCriteria: partial.acceptanceCriteria,
      priority: partial.priority || "media",
      isBlocking: !!partial.isBlocking,
      requiredEvidence: !!partial.requiredEvidence,
      instructions: partial.instructions || "",
      media: partial.media || [],
      sortOrder: partial.sortOrder || 0
    };
  }

  function section(id, title, sortOrder) {
    return { id: id, title: title, sortOrder: sortOrder, archivedAt: null, didactic: true };
  }

  function compose(versionId, templateId, sectionIds, sections, masterItems, codes) {
    var included = masterItems.filter(function (entry) { return codes.indexOf(entry.code) >= 0; });
    var usedSections = {};
    var snapSections = [];
    included.forEach(function (entry) {
      if (!usedSections[entry.sectionId]) {
        var source = sections.filter(function (s) { return s.id === entry.sectionId; })[0];
        var copy = {
          id: versionId + "-" + source.id,
          sourceId: source.id,
          title: source.title,
          sortOrder: snapSections.length
        };
        usedSections[entry.sectionId] = copy.id;
        snapSections.push(copy);
      }
    });
    var snapItems = included.map(function (entry, index) {
      var copy = JSON.parse(JSON.stringify(entry));
      copy.sourceItemId = entry.id;
      copy.masterItemId = entry.id;
      copy.id = versionId + "-" + entry.code;
      copy.sectionId = usedSections[entry.sectionId];
      copy.sortOrder = index;
      return copy;
    });
    return { sections: snapSections, items: snapItems };
  }

  function template(id, name, drawingTypeId, activityKind, version) {
    return {
      id: id,
      name: name,
      drawingTypeId: drawingTypeId,
      activityKind: activityKind,
      status: "published",
      currentVersionId: version.id,
      archivedAt: null,
      didactic: true
    };
  }

  function version(id, templateId, content) {
    return {
      id: id,
      templateId: templateId,
      versionNumber: 1,
      status: "published",
      publishedAt: "2026-01-15T12:00:00.000Z",
      publishedBy: "user-admin",
      snapshotNote: "Versão didática inicial.",
      sections: content.sections,
      items: content.items
    };
  }

  function create() {
    var sections = [
      section("sec-id", "Identificação da prancha", 0),
      section("sec-forma", "Forma", 1),
      section("sec-vigas", "Vigas", 2),
      section("sec-lajes", "Lajes", 3),
      section("sec-entrega", "Entrega interna", 4)
    ];

    var masterItems = [
      item({
        id: "mi-id-01",
        sectionId: "sec-id",
        code: "ID-01",
        title: "Identificação do projeto, pavimento e revisão",
        objective: "Ver se o carimbo mostra o projeto, o pavimento e a revisão que a equipe está produzindo.",
        steps: "Abra o carimbo.\nCompare projeto, pavimento e revisão com o cadastro desta prancha.\nSe algo divergir, marque não conforme e descreva a diferença.",
        verifiableParameter: "Os três dados do carimbo batem com o cadastro da revisão.",
        acceptanceCriteria: "Projeto, pavimento e revisão aparecem e coincidem com o cadastro. Exemplo didático.",
        priority: "alta",
        sortOrder: 0
      }),
      item({
        id: "mi-for-01",
        sectionId: "sec-forma",
        code: "FOR-01",
        title: "Eixos, cotas e geometria legíveis",
        objective: "A folha precisa deixar eixos e cotas legíveis para quem vai construir e para quem vai conferir.",
        steps: "Percorra os eixos.\nVeja se as cotas principais estão escritas e se o desenho não está sobreposto.\nAnote o que ficou ilegível.",
        verifiableParameter: "Eixos e cotas principais podem ser lidos sem adivinhar.",
        acceptanceCriteria: "A equipe consegue apontar eixos e cotas na própria folha. Sem valor normativo neste exemplo.",
        priority: "alta",
        sortOrder: 1
      }),
      item({
        id: "mi-for-02",
        sectionId: "sec-forma",
        code: "FOR-02",
        title: "Pilares, vigas, lajes e aberturas representados",
        objective: "Checar se a planta mostra os elementos que esta folha se propõe a representar.",
        steps: "Liste pilares, vigas, lajes e aberturas que o pavimento deveria mostrar.\nMarque na prancha o que encontrou.\nO que faltar vira comentário.",
        verifiableParameter: "Cada elemento previsto nesta folha tem representação visível.",
        acceptanceCriteria: "Nada do que a própria folha promete ficou de fora. Exemplo de organização, não de norma.",
        priority: "alta",
        media: [
          {
            id: "media-for-02",
            kind: "image",
            src: "media/esquema-eixos.svg",
            caption: "Esquema didático: eixos, pilar e viga. Abra para ver como o exemplo marca o desenho.",
            example: "ok"
          },
          {
            id: "media-for-02-bad",
            kind: "image",
            src: "media/erro-numeracao.svg",
            caption: "Erro comum neste exemplo: o mesmo código em dois trechos.",
            example: "bad"
          }
        ],
        sortOrder: 2
      }),
      item({
        id: "mi-for-03",
        sectionId: "sec-forma",
        code: "FOR-03",
        title: "Numeração sem repetição indevida",
        objective: "Códigos de vigas, lajes e pilares desta folha não se repetem sem motivo registrado.",
        steps: "Leia os códigos da planta.\nRisque os repetidos.\nSe a repetição for proposital, explique no comentário ou use não aplicável com justificativa.",
        verifiableParameter: "Não há dois elementos diferentes com o mesmo código, salvo justificativa.",
        acceptanceCriteria: "A numeração desta folha pode ser seguida sem dúvida. A regra fina é da equipe.",
        priority: "alta",
        sortOrder: 3
      }),
      item({
        id: "mi-for-04",
        sectionId: "sec-forma",
        code: "FOR-04",
        title: "Correspondência entre planta e tabela de vigas",
        objective: "Os códigos da planta aparecem na tabela desta folha, e os da tabela aparecem na planta.",
        steps: "Escolha cada código da tabela.\nProcure o mesmo código na planta.\nAnote os que ficaram só de um lado.",
        verifiableParameter: "Conjunto de códigos da planta e da tabela é o mesmo nesta folha.",
        acceptanceCriteria: "Não sobra código órfão. Item bloqueante no exemplo: a aprovação espera correção conferida ou exceção formal.",
        priority: "critica",
        isBlocking: true,
        requiredEvidence: true,
        sortOrder: 4
      }),
      item({
        id: "mi-vig-01",
        sectionId: "sec-vigas",
        code: "VIG-01",
        title: "Tabela de vigas conferida em separado",
        objective: "A tabela foi relida, não só copiada de memória da planta.",
        steps: "Cubra a planta e leia a tabela.\nDepois volte na planta e cruze os códigos.\nGuarde um recorte ou uma foto como evidência.",
        verifiableParameter: "Há uma leitura da tabela independente da planta.",
        acceptanceCriteria: "A pessoa que produz consegue mostrar como cruzou tabela e planta. Exemplo didático.",
        priority: "alta",
        requiredEvidence: true,
        media: [
          {
            id: "media-vig-01",
            kind: "video",
            src: "media/exemplo-cruzar-tabela.mp4",
            poster: "media/exemplo-cruzar-tabela-poster.png",
            caption: "Animação didática: como cruzar a tabela com a planta. Não é vídeo de obra.",
            example: "how"
          }
        ],
        sortOrder: 5
      }),
      item({
        id: "mi-vig-02",
        sectionId: "sec-vigas",
        code: "VIG-02",
        title: "Seções indicadas de modo compatível com a forma",
        objective: "A seção escrita na folha de vigas conversa com a largura e a altura mostradas na forma.",
        steps: "Anote a seção de cada viga nesta folha.\nCompare com a forma do mesmo pavimento.\nDescreva divergências no comentário.",
        verifiableParameter: "Seção da viga e representação na forma não se contradizem.",
        acceptanceCriteria: "Onde as duas folhas existem, os nomes e as seções apontam para o mesmo elemento.",
        priority: "alta",
        sortOrder: 6
      }),
      item({
        id: "mi-vig-03",
        sectionId: "sec-vigas",
        code: "VIG-03",
        title: "Armaduras longitudinais positivas e negativas indicadas",
        objective: "A folha mostra, de um jeito que a equipe reconhece, a armadura inferior e a superior.",
        steps: "Localize a indicação de armadura positiva.\nLocalize a indicação de armadura negativa.\nSe a folha não usar esses nomes, descreva o que ela usa.",
        verifiableParameter: "Dá para apontar na folha onde está a armadura positiva e onde está a negativa.",
        acceptanceCriteria: "As duas indicações existem ou há justificativa de não aplicável. Este exemplo não define bitola nem quantidade.",
        priority: "alta",
        instructions: "Não preencha bitola, quantidade ou espaçamento como se fossem norma. Isso fica no projeto, não neste checklist.",
        sortOrder: 7
      }),
      item({
        id: "mi-vig-04",
        sectionId: "sec-vigas",
        code: "VIG-04",
        title: "Estribos, apoios e cortes indicados na folha",
        objective: "A folha mostra estribos, apoios e os cortes que o escritório espera nesta prancha.",
        steps: "Procure a indicação de estribos.\nVeja apoios e cortes.\nO que faltar entra no comentário.",
        verifiableParameter: "Estribos, apoios e cortes previstos para esta folha estão desenhados ou justificados.",
        acceptanceCriteria: "Quem confere encontra esses três grupos na própria prancha. Sem detalhe normativo neste exemplo.",
        priority: "media",
        sortOrder: 8
      }),
      item({
        id: "mi-vig-05",
        sectionId: "sec-vigas",
        code: "VIG-05",
        title: "Tabelas e quantitativos coerentes entre si",
        objective: "Os totais escritos nas tabelas desta folha não se contradizem.",
        steps: "Some uma amostra das linhas.\nCompare com o total impresso.\nSe não fechar, marque não conforme e anexe a conta.",
        verifiableParameter: "Totais da folha fecham com as linhas que os compõem.",
        acceptanceCriteria: "Não há total contraditório nesta folha. Item bloqueante do exemplo.",
        priority: "critica",
        isBlocking: true,
        requiredEvidence: true,
        sortOrder: 9
      }),
      item({
        id: "mi-laj-01",
        sectionId: "sec-lajes",
        code: "LAJ-01",
        title: "Identificação, espessura e nível lançados",
        objective: "Cada laje desta folha tem nome, espessura e nível escritos.",
        steps: "Percorra as lajes da folha.\nMarque as que não tiverem nome, espessura ou nível.\nUse não aplicável só com justificativa, se a folha não tratar de laje.",
        verifiableParameter: "Nome, espessura e nível estão na folha para cada laje representada.",
        acceptanceCriteria: "Não falta um dos três dados nas lajes desta prancha. Sem espessura mínima normativa aqui.",
        priority: "alta",
        sortOrder: 10
      }),
      item({
        id: "mi-laj-02",
        sectionId: "sec-lajes",
        code: "LAJ-02",
        title: "Compatibilidade com a forma",
        objective: "O contorno das lajes desta folha combina com a forma do mesmo pavimento.",
        steps: "Sobreponha o olhar: contorno, aberturas e apoios.\nAnote o que mudou de uma folha para a outra.",
        verifiableParameter: "Contorno e aberturas não contradizem a forma.",
        acceptanceCriteria: "As duas folhas contam a mesma geometria, no nível deste exemplo.",
        priority: "alta",
        sortOrder: 11
      }),
      item({
        id: "mi-laj-03",
        sectionId: "sec-lajes",
        code: "LAJ-03",
        title: "Armadura positiva e negativa indicada",
        objective: "A folha de lajes distingue armadura positiva e negativa do jeito que o escritório combina.",
        steps: "Aponte a armadura positiva.\nAponte a armadura negativa.\nSe a folha usar outro nome, escreva qual.",
        verifiableParameter: "As duas direções de armadura estão identificáveis.",
        acceptanceCriteria: "Dá para separar positivo e negativo na folha. Este item não fixa bitola nem espaçamento.",
        priority: "alta",
        sortOrder: 12
      }),
      item({
        id: "mi-laj-04",
        sectionId: "sec-lajes",
        code: "LAJ-04",
        title: "Reforços em aberturas quando a prancha os prevê",
        objective: "Se a própria folha mostra abertura com reforço, o reforço está desenhado. Se não há abertura, o item não se aplica.",
        steps: "Procure aberturas.\nSe não houver, marque não aplicável e escreva isso.\nSe houver, veja se o reforço previsto na folha está desenhado.",
        verifiableParameter: "Abertura sem o reforço que a própria folha anuncia não passa em branco.",
        acceptanceCriteria: "Ou o reforço está na folha, ou há justificativa de não aplicável.",
        priority: "alta",
        sortOrder: 13
      }),
      item({
        id: "mi-laj-05",
        sectionId: "sec-lajes",
        code: "LAJ-05",
        title: "Legibilidade para quem vai conferir",
        objective: "Textos, cotas e linhas desta folha podem ser lidos na escala em que a equipe plota.",
        steps: "Afaste um passo da tela ou da folha plotada.\nVeja o que some.\nDescreva o que precisa ser reorganizado.",
        verifiableParameter: "Textos principais continuam legíveis.",
        acceptanceCriteria: "A conferência não depende de adivinhar um número. Critério interno do exemplo.",
        priority: "media",
        sortOrder: 14
      }),
      item({
        id: "mi-ent-01",
        sectionId: "sec-entrega",
        code: "ENT-01",
        title: "Nome do arquivo e revisão no cadastro",
        objective: "O arquivo enviado corresponde à revisão cadastrada nesta tela.",
        steps: "Confira o nome do arquivo.\nConfira o código da revisão no cadastro.\nSe forem diferentes, não encaminhe.",
        verifiableParameter: "Arquivo e revisão cadastrada são o mesmo documento.",
        acceptanceCriteria: "Quem recebe abre o arquivo certo. Procedimento interno, não norma.",
        priority: "media",
        sortOrder: 15
      })
    ];

    var packs = {
      forma: ["ID-01", "FOR-01", "FOR-02", "FOR-03", "FOR-04", "ENT-01"],
      vigas: ["ID-01", "VIG-01", "VIG-02", "VIG-03", "VIG-04", "VIG-05", "ENT-01"],
      lajes: ["ID-01", "LAJ-01", "LAJ-02", "LAJ-03", "LAJ-04", "LAJ-05", "ENT-01"]
    };

    var templates = [];
    var templateVersions = [];
    [
      ["tpl-forma-prod", "Forma — produção", "dt-forma", "producao", "ver-forma-prod-1"],
      ["tpl-forma-conf", "Forma — conferência", "dt-forma", "conferencia", "ver-forma-conf-1"],
      ["tpl-vigas-prod", "Vigas — produção", "dt-vigas", "producao", "ver-vigas-prod-1"],
      ["tpl-vigas-conf", "Vigas — conferência", "dt-vigas", "conferencia", "ver-vigas-conf-1"],
      ["tpl-lajes-prod", "Lajes — produção", "dt-lajes", "producao", "ver-lajes-prod-1"],
      ["tpl-lajes-conf", "Lajes — conferência", "dt-lajes", "conferencia", "ver-lajes-conf-1"]
    ].forEach(function (row) {
      var key = row[2] === "dt-forma" ? "forma" : row[2] === "dt-vigas" ? "vigas" : "lajes";
      var content = compose(row[4], row[0], null, sections, masterItems, packs[key]);
      var ver = version(row[4], row[0], content);
      templateVersions.push(ver);
      templates.push(template(row[0], row[1], row[2], row[3], ver));
    });

    var prodItems = templateVersions.filter(function (v) { return v.id === "ver-vigas-prod-1"; })[0].items;
    var responses = [
      {
        id: "resp-id-01",
        runId: "run-vig-01-prod",
        runItemId: "ver-vigas-prod-1-ID-01",
        status: "conforme",
        comment: "Carimbo de exemplo confere com o cadastro.",
        evidence: [],
        answeredBy: "user-prod",
        answeredAt: "2026-02-02T14:00:00.000Z"
      },
      {
        id: "resp-vig-01",
        runId: "run-vig-01-prod",
        runItemId: "ver-vigas-prod-1-VIG-01",
        status: "conforme",
        comment: "Tabela lida, ainda sem arquivo de evidência — de propósito, para o painel do que falta.",
        evidence: [],
        answeredBy: "user-prod",
        answeredAt: "2026-02-02T14:10:00.000Z"
      },
      {
        id: "resp-vig-04",
        runId: "run-vig-01-prod",
        runItemId: "ver-vigas-prod-1-VIG-04",
        status: "pendente_verificacao",
        comment: "Aguardando a plotagem de exemplo.",
        evidence: [],
        answeredBy: "user-prod",
        answeredAt: "2026-02-02T14:20:00.000Z"
      }
    ];

    var vigasVersion = templateVersions.filter(function (v) { return v.id === "ver-vigas-prod-1"; })[0];

    return {
      schema: 1,
      organization: {
        id: "org-lunardeli",
        name: "Lunardeli Engenharia",
        slug: "lunardeli"
      },
      currentUserId: "user-prod",
      users: [
        { id: "user-admin", fullName: "Ana Lima", role: "admin" },
        { id: "user-coord", fullName: "Caio Mendes", role: "coordenador" },
        { id: "user-prod", fullName: "Paulo Ribeiro", role: "desenhista" },
        { id: "user-rev", fullName: "Helena Duarte", role: "conferente" },
        { id: "user-view", fullName: "Rita Nunes", role: "consulta" }
      ],
      drawingTypes: [
        { id: "dt-forma", code: "FORMA", name: "Forma", sortOrder: 0, active: true, archivedAt: null, didactic: true },
        { id: "dt-vigas", code: "VIGAS", name: "Vigas", sortOrder: 1, active: true, archivedAt: null, didactic: true },
        { id: "dt-lajes", code: "LAJES", name: "Lajes", sortOrder: 2, active: true, archivedAt: null, didactic: true }
      ],
      masterSections: sections,
      masterItems: masterItems,
      templates: templates,
      templateVersions: templateVersions,
      standardSheets: [
        {
          id: "sheet-vigas-exemplo",
          title: "Vigas executadas — exemplo didático",
          revisionLabel: "exemplo",
          description: "Folha desenhada só para treinar o olhar: planta simples, tabela e carimbo. Não é prancha de obra.",
          drawingTypeId: "dt-vigas",
          status: "published",
          src: "media/prancha-vigas-exemplo.svg",
          fileName: "prancha-vigas-exemplo.svg",
          mime: "image/svg+xml",
          fileId: null,
          archivedAt: null,
          didactic: true,
          createdBy: "user-admin",
          createdAt: "2026-01-20T12:00:00.000Z"
        }
      ],
      projects: [
        {
          id: "proj-demo",
          code: "DEMO-001",
          name: "Edifício exemplo (didático)",
          description: "Projeto de treino para a equipe alimentar checklists e cruzar uma prancha. Não é obra real.",
          status: "active",
          archivedAt: null,
          createdBy: "user-coord",
          createdAt: "2026-02-01T12:00:00.000Z",
          didactic: true
        }
      ],
      drawings: [
        {
          id: "dwg-vig-01",
          projectId: "proj-demo",
          drawingTypeId: "dt-vigas",
          number: "VIG-01",
          title: "Vigas — pavimento tipo",
          structureLabel: "Torre A",
          levelLabel: "Tipo",
          createdBy: "user-prod",
          createdAt: "2026-02-01T12:30:00.000Z"
        },
        {
          id: "dwg-for-01",
          projectId: "proj-demo",
          drawingTypeId: "dt-forma",
          number: "FOR-01",
          title: "Forma — pavimento tipo",
          structureLabel: "Torre A",
          levelLabel: "Tipo",
          createdBy: "user-prod",
          createdAt: "2026-02-01T12:40:00.000Z"
        }
      ],
      revisions: [
        {
          id: "rev-vig-01-r00",
          drawingId: "dwg-vig-01",
          revisionCode: "R00",
          workflowStatus: "em_producao",
          productionOwnerId: "user-prod",
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
          createdAt: "2026-02-02T13:00:00.000Z"
        },
        {
          id: "rev-for-01-r00",
          drawingId: "dwg-for-01",
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
          createdAt: "2026-02-02T13:05:00.000Z"
        }
      ],
      runs: [
        {
          id: "run-vig-01-prod",
          revisionId: "rev-vig-01-r00",
          templateVersionId: "ver-vigas-prod-1",
          activityKind: "producao",
          status: "em_andamento",
          assigneeId: "user-prod",
          templateSnapshot: {
            templateId: "tpl-vigas-prod",
            templateName: "Vigas — produção",
            versionId: vigasVersion.id,
            versionNumber: vigasVersion.versionNumber,
            activityKind: "producao",
            drawingTypeId: "dt-vigas",
            sections: JSON.parse(JSON.stringify(vigasVersion.sections)),
            items: JSON.parse(JSON.stringify(prodItems))
          },
          startedAt: "2026-02-02T13:10:00.000Z",
          completedAt: null,
          createdBy: "user-prod"
        }
      ],
      responses: responses,
      issues: [],
      approvals: [],
      audit: [
        {
          id: "audit-seed",
          actorId: "user-admin",
          action: "seed_loaded",
          entityType: "organization",
          entityId: "org-lunardeli",
          payload: { note: "Exemplo didático carregado no navegador." },
          createdAt: "2026-02-01T12:00:00.000Z"
        }
      ],
      inlineFiles: {}
    };
  }

  root.LunardeliSeed = { create: create };
})(typeof window !== "undefined" ? window : globalThis);
