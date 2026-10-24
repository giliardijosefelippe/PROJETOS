/* Motor de cálculo de estacas — apoio à decisão.
   Coeficientes somente de fontes publicadas. Não inventar F1, F2, K, α, β. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.Estacas = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const FONTES = {
    aokiK:
      "Aoki e Velloso (1975), K em kPa e α em %; reproduzido por Cintra e Aoki e por Velloso e Lopes.",
    aokiF:
      "F1 e F2: tabela atualizada de Cintra e Aoki (2010), Fundações por estacas. F2 = 2·F1. A tabela original de 1975 não traz hélice contínua, raiz nem ômega.",
    aokiFpre:
      "Pré-moldada cravada: F1 = 1 + D/0,80 (D em metros), F2 = 2·F1. Cintra e Aoki (2010). Velloso e Lopes (2010) também publicam o par fixo 1,75 / 3,50; este aplicativo usa a fórmula de Cintra e Aoki.",
    decourtK:
      "Décourt e Quaresma (1978): K da ponta. Argila 120 kPa, silte argiloso 200 kPa, silte arenoso 250 kPa, areia 400 kPa.",
    decourtAB:
      "α e β: Décourt (1996), tabela por tipo de estaca e de solo, com os valores marcados pelo autor como orientativos (*) quando os dados eram poucos. Para pré-moldada, metálica e Franki, α = β = 1.",
    fs:
      "ABNT NBR 6122:2019, item 6.2.1.2.1: método semiempírico, FSg = 2,0 (ponderador 1,4 para a força resistente de cálculo). Item 6.2.1.2.2: prova de carga estática na fase de projeto, FSg = 1,6.",
    pontaHelice:
      "ABNT NBR 6122:2019, item 8.2.1.2: hélice contínua e escavada com fluido. Se a ponta for considerada e o contato do Anexo N (ou J) estiver assegurado, Rp ≤ Rl e Padm = (Rp + Rl)/2. Sem esse contato, Rp = 0 e Padm = Rl/2. A menção à ponta tem de ser explícita no projeto.",
    tracao:
      "ABNT NBR 6122:2019, item 8.4.1: o atrito lateral à tração pode diferir do atrito à compressão. A norma não publica um redutor numérico. Hipótese deste aplicativo, declarada: atrito último de tração = atrito de compressão do fuste (sem ponta), mais o peso da estaca.",
    estrutural:
      "ABNT NBR 6122:2019, item 8.6.3 e Tabela 4 (γc, tensão máxima sem armadura de fuste, armadura mínima). fcd = fck/γc. γs = 1,15 e γf = 1,4. Parcela de concreto com o coeficiente 0,85 do diagrama da NBR 6118. Emenda 1 (25/03/2022) não altera a Tabela 4; altera a dosagem dos Anexos J, N, O e P (cimento mínimo 350 kg/m³).",
    espacamento:
      "ABNT NBR 6122:2019, item 8.3, não fixa um mínimo geométrico numérico. O mínimo numérico está na sequência executiva: Anexo N.7 (hélice), O.7, P.7, J.6, K.7, G.6 e H.7 — 5 diâmetros em intervalo menor que 12 h; Anexo I.6 (escavada sem fluido) — 3 diâmetros.",
    spt:
      "ABNT NBR 6484: NSPT é o número de golpes para os últimos 30 cm (2.º e 3.º trechos de 15 cm). O boletim Palmar cita a NBR 6484/2001 no texto e a NBR 6484/2020 na nota de impenetrável. A edição vigente consultada como referência de leitura é a de 2020; a definição dos 30 cm finais permanece.",
    bloco:
      "Reação em bloco rígido, estacas de mesma rigidez, eixos na origem do centroide: Ri = N/n + Mx·yi/Σyj² + My·xi/Σxj². Critério geométrico de bloco rígido usado aqui (biela a 45°, d ≥ x) é prática associada ao modelo de bielas da NBR 6118; o texto da NBR 6118 não foi aberto nesta versão e o limite de 45° fica marcado como não confirmado na norma.",
    group:
      "ABNT NBR 6122:2019, item 8.3: a carga do grupo não pode superar a de uma sapata hipotética apoiada a L/3 acima da ponta, na camada de suporte. Este aplicativo não calcula essa sapata (faltaria o método de fundação rasa). O efeito é apenas lembrado.",
  };

  const SOLOS = {
    areia: { nome: "Areia", K: 1000, alphaPct: 1.4, decK: 400, decCol: "areia" },
    areia_siltosa: { nome: "Areia siltosa", K: 800, alphaPct: 2.0, decK: 400, decCol: "areia" },
    areia_siltoargilosa: { nome: "Areia siltoargilosa", K: 700, alphaPct: 2.4, decK: 400, decCol: "inter" },
    areia_argilosa: { nome: "Areia argilosa", K: 600, alphaPct: 3.0, decK: 400, decCol: "inter" },
    areia_argilossiltosa: { nome: "Areia argilossiltosa", K: 500, alphaPct: 2.8, decK: 400, decCol: "inter" },
    silte: { nome: "Silte", K: 400, alphaPct: 3.0, decK: 200, decCol: "inter" },
    silte_arenoso: { nome: "Silte arenoso", K: 550, alphaPct: 2.2, decK: 250, decCol: "inter" },
    silte_arenoargiloso: { nome: "Silte arenoargiloso", K: 450, alphaPct: 2.8, decK: 250, decCol: "inter" },
    silte_argiloso: { nome: "Silte argiloso", K: 230, alphaPct: 3.4, decK: 200, decCol: "inter" },
    silte_argiloarenoso: { nome: "Silte argiloarenoso", K: 250, alphaPct: 3.0, decK: 200, decCol: "inter" },
    argila: { nome: "Argila", K: 200, alphaPct: 6.0, decK: 120, decCol: "argila" },
    argila_arenosa: { nome: "Argila arenosa", K: 350, alphaPct: 2.4, decK: 120, decCol: "argila" },
    argila_arenosiltosa: { nome: "Argila arenosiltosa", K: 300, alphaPct: 2.8, decK: 120, decCol: "argila" },
    argila_siltosa: { nome: "Argila siltosa", K: 220, alphaPct: 4.0, decK: 120, decCol: "argila" },
    argila_siltoarenosa: { nome: "Argila siltoarenosa", K: 330, alphaPct: 3.0, decK: 120, decCol: "argila" },
    impenetravel: { nome: "Impenetrável / recusa", K: null, alphaPct: null, decK: null, decCol: null },
  };

  /* α, β de Décourt (1996). * = orientativo na publicação original. */
  const DECOURT_AB = {
    franki: { argila: [1, 1], inter: [1, 1], areia: [1, 1], nota: "α = β = 1 para qualquer solo." },
    premoldada: { argila: [1, 1], inter: [1, 1], areia: [1, 1], nota: "α = β = 1 para qualquer solo." },
    metalica: { argila: [1, 1], inter: [1, 1], areia: [1, 1], nota: "α = β = 1 para qualquer solo." },
    escavada_seco: {
      argila: [0.85, 0.8], inter: [0.65, 0.65], areia: [0.5, 0.5],
      nota: "Linha «escavada em geral» de Décourt (1996). Strauss não tem linha própria; usa esta, com o aviso.",
    },
    strauss: {
      argila: [0.85, 0.8], inter: [0.65, 0.65], areia: [0.5, 0.5],
      nota: "Strauss não aparece separado em Décourt (1996). Adotada a linha «escavada em geral». Não é coeficiente próprio.",
    },
    escavada_fluido: {
      argila: [0.85, 0.9], inter: [0.6, 0.75], areia: [0.5, 0.6],
      nota: "Linha «escavada com bentonita» de Décourt (1996).",
    },
    helice: {
      argila: [0.3, 1], inter: [0.3, 1], areia: [0.3, 1],
      nota: "α = 0,30 (*) e β = 1,00 (*) para argila, solo intermediário e areia. Orientativo.",
    },
    raiz: {
      argila: [0.85, 1.5], inter: [0.6, 1.5], areia: [0.5, 1.5],
      nota: "Décourt (1996). Vários α são orientativos (*).",
    },
    omega: null,
  };

  const TIPOS = {
    helice: {
      nome: "Hélice contínua monitorada",
      f1: 2, f2modo: "2f1",
      decourt: "helice",
      ponta: "regra-helice",
      anexoEsp: "N.7", espD: 5,
      estrutural: { modo: "tabela4", caa12: { fckMin: 30, gc: 2.7, sigma: 6 }, caa34: { fckMin: 40, gc: 3.6, sigma: 6 }, asMin: 0.004, lArmMin: 4 },
    },
    omega: {
      nome: "Ômega (hélice de deslocamento)",
      f1: 2, f2modo: "2f1",
      decourt: null,
      ponta: "integral",
      anexoEsp: "O.7", espD: 5,
      estrutural: { modo: "tabela4", caa12: { fckMin: 30, gc: 2.7, sigma: 6 }, caa34: { fckMin: 40, gc: 3.6, sigma: 6 }, asMin: 0.004, lArmMin: 4 },
      nota: "F1 = 2 e F2 = 4 entram no grupo «raiz, hélice contínua e ômega» de Cintra e Aoki (2010). Décourt (1996) não publica α e β de ômega — o método fica indisponível. Hélice segmentada (Anexo P) não é o mesmo tipo e não entra aqui.",
    },
    escavada_fluido: {
      nome: "Escavada com fluido",
      f1: 3, f2modo: "2f1",
      decourt: "escavada_fluido",
      ponta: "regra-helice",
      anexoEsp: "J.6", espD: 5,
      estrutural: { modo: "tabela4", caa12: { fckMin: 30, gc: 2.7, sigma: 6 }, caa34: { fckMin: 40, gc: 3.6, sigma: 6 }, asMin: 0.004, lArmMin: 4 },
      nota: "Aoki-Velloso (Cintra e Aoki, 2010) não separa escavada com fluido e a seco: ambos usam F1 = 3 e F2 = 6 da linha «escavada».",
    },
    escavada_seco: {
      nome: "Escavada a seco",
      f1: 3, f2modo: "2f1",
      decourt: "escavada_seco",
      ponta: "integral",
      anexoEsp: "I.6", espD: 3,
      estrutural: { modo: "tabela4", caa12: { fckMin: 25, gc: 3.1, sigma: 5 }, caa34: { fckMin: 40, gc: 5.0, sigma: 5 }, asMin: 0.004, lArmMin: 2 },
      nota: "Mesma linha «escavada» de Cintra e Aoki (2010) para F1 e F2. No Décourt, linha «escavada em geral».",
    },
    raiz: {
      nome: "Raiz",
      f1: 2, f2modo: "2f1",
      decourt: "raiz",
      ponta: "integral",
      anexoEsp: "K.7", espD: 5,
      estrutural: { modo: "tabela4", caa12: { fckMin: 20, gc: 1.6, sigma: null }, caa34: { fckMin: 20, gc: 1.6, sigma: null }, asMin: 0.004, lArmMin: null },
    },
    strauss: {
      nome: "Strauss",
      f1: 3, f2modo: "2f1",
      decourt: "strauss",
      ponta: "integral",
      anexoEsp: "G.6", espD: 5,
      estrutural: { modo: "tabela4", caa12: { fckMin: 20, gc: 2.5, sigma: 5 }, caa34: { fckMin: 20, gc: 2.5, sigma: 5 }, asMin: 0.004, lArmMin: 2 },
      nota: "Não há F1/F2 publicados só para Strauss na tabela de Cintra e Aoki (2010). Usa-se a linha «escavada» (3 e 6), com este aviso.",
    },
    premoldada: {
      nome: "Pré-moldada de concreto cravada",
      f1: null, f2modo: "pre",
      decourt: "premoldada",
      ponta: "integral",
      anexoEsp: null, espD: null,
      estrutural: { modo: "nbr6118", gc: 1.4, sigma: null, asMin: 0.004, lArmMin: null },
      nota: "Estrutural de apoio com γc = 1,4 da NBR 6118. A NBR 16258 (pré-moldada) não foi aberta. Item 8.3 da NBR 6122:2019 não fixa mínimo geométrico para cravada.",
    },
    metalica: {
      nome: "Metálica",
      f1: 1.75, f2modo: "2f1",
      decourt: "metalica",
      ponta: "integral",
      anexoEsp: null, espD: null,
      estrutural: { modo: "nbr8800" },
      nota: "Geotecnia com o diâmetro do círculo circunscrito informado (área de ponta editável). Estrutura: NBR 8800, não calculada aqui — informe N estrutural admissível.",
    },
    franki: {
      nome: "Franki",
      f1: 2.5, f2modo: "2f1",
      decourt: "franki",
      ponta: "integral",
      anexoEsp: "H.7", espD: 5,
      estrutural: { modo: "tabela4", caa12: { fckMin: 20, gc: 1.8, sigma: null }, caa34: { fckMin: 20, gc: 1.8, sigma: null }, asMin: 0.004, lArmMin: null },
      nota: "Se a base alargada tiver diâmetro próprio, a ponta usa esse diâmetro e o fuste usa o diâmetro do tubo.",
    },
  };

  function solo(id) {
    return SOLOS[id] || null;
  }

  function fatoresAoki(tipoId, D) {
    const t = TIPOS[tipoId];
    if (!t) return null;
    if (t.f2modo === "pre") {
      const f1 = 1 + D / 0.8;
      return { f1, f2: 2 * f1, fonte: FONTES.aokiFpre };
    }
    return { f1: t.f1, f2: 2 * t.f1, fonte: FONTES.aokiF };
  }

  function nDoMetro(amostras, zMeio) {
    const k = Math.ceil(zMeio - 1e-9);
    const alvo = k < 1 ? 1 : k;
    const a = (amostras || []).find((s) => Math.abs(s.depth - alvo) < 1e-6);
    return { k: alvo, n: a ? a.n : null };
  }

  function soloEm(estratos, z) {
    for (const e of estratos) {
      if (z > e.z0 - 1e-9 && z <= e.z1 + 1e-9) return e;
    }
    return null;
  }

  function quebras(estratos, L) {
    const p = new Set([0, round6(L)]);
    for (const e of estratos) {
      if (e.z0 > 1e-9 && e.z0 < L - 1e-9) p.add(round6(e.z0));
      if (e.z1 > 1e-9 && e.z1 < L - 1e-9) p.add(round6(e.z1));
    }
    const kmax = Math.ceil(L - 1e-9);
    for (let k = 1; k < kmax; k += 1) {
      if (k < L - 1e-9) p.add(k);
    }
    return Array.from(p).sort((a, b) => a - b);
  }

  function round6(x) {
    return Math.round(x * 1e6) / 1e6;
  }

  function trechos(estratos, amostras, L) {
    const xs = quebras(estratos, L);
    const out = [];
    for (let i = 0; i < xs.length - 1; i += 1) {
      const a = xs[i];
      const b = xs[i + 1];
      const dl = b - a;
      if (dl < 1e-8) continue;
      const meio = (a + b) / 2;
      const est = soloEm(estratos, meio);
      const ns = nDoMetro(amostras, meio);
      out.push({
        z0: a,
        z1: b,
        dl,
        soloId: est ? est.solo : null,
        nota: est ? est.nota || "" : "",
        n: ns.n,
        metro: ns.k,
      });
    }
    return out;
  }

  function aoki(estratos, amostras, L, D, tipoId, dBase) {
    const fat = fatoresAoki(tipoId, D);
    const U = Math.PI * D;
    const Db = dBase && dBase > 0 ? dBase : D;
    const Ap = Math.PI * Db * Db / 4;
    const alertas = [];
    let Qs = 0;
    const linhas = [];
    for (const tr of trechos(estratos, amostras, L)) {
      const s = solo(tr.soloId);
      if (!s || s.K == null || tr.n == null) {
        alertas.push("Trecho " + tr.z0.toFixed(2) + "–" + tr.z1.toFixed(2) + " m sem NSPT ou sem coeficiente (solo " + (tr.soloId || "indefinido") + "). Atrito desse trecho não entrou.");
        linhas.push({ ...tr, ql: null, dQ: 0, omitido: true });
        continue;
      }
      const alpha = s.alphaPct / 100;
      const ql = (alpha * s.K * tr.n) / fat.f2;
      const dQ = U * ql * tr.dl;
      Qs += dQ;
      linhas.push({ ...tr, ql, dQ, K: s.K, alphaPct: s.alphaPct, omitido: false });
    }
    const kTip = Math.abs(L - Math.round(L)) < 1e-6 ? Math.round(L) : Math.ceil(L);
    const amTip = (amostras || []).find((s) => Math.abs(s.depth - kTip) < 1e-6);
    const estTip = soloEm(estratos, L);
    const sTip = estTip ? solo(estTip.solo) : null;
    let Qp = null;
    let qp = null;
    let np = amTip ? amTip.n : null;
    if (!sTip || sTip.K == null || np == null) {
      alertas.push("Ponta sem coeficiente ou sem NSPT (solo " + (estTip && estTip.solo) + ", metro " + kTip + "). Qp não calculado.");
    } else {
      qp = (sTip.K * np) / fat.f1;
      Qp = qp * Ap;
    }
    return {
      metodo: "Aoki-Velloso",
      f1: fat.f1,
      f2: fat.f2,
      fonteF: fat.fonte,
      fonteK: FONTES.aokiK,
      U, Ap, Db,
      linhas, Qs, Qp, qp, np, metroPonta: kTip,
      soloPonta: estTip ? estTip.solo : null,
      Qult: Qp == null ? null : Qp + Qs,
      alertas,
    };
  }

  function decourt(estratos, amostras, L, D, tipoId, dBase) {
    const tipo = TIPOS[tipoId];
    if (!tipo || !tipo.decourt || !DECOURT_AB[tipo.decourt]) {
      return {
        indisponivel: true,
        motivo: tipo && tipo.decourt === null
          ? "Décourt (1996) não publica α e β para este tipo. O método não é calculado."
          : "Tipo sem linha Décourt.",
      };
    }
    const tab = DECOURT_AB[tipo.decourt];
    const U = Math.PI * D;
    const Db = dBase && dBase > 0 ? dBase : D;
    const Ap = Math.PI * Db * Db / 4;
    const alertas = [];
    const kTip = Math.abs(L - Math.round(L)) < 1e-6 ? Math.round(L) : Math.ceil(L);
    const viz = [kTip - 1, kTip, kTip + 1];
    const ns = [];
    viz.forEach((k) => {
      const a = (amostras || []).find((s) => Math.abs(s.depth - k) < 1e-6);
      if (a && a.n != null) ns.push(a.n);
      else alertas.push("Décourt: falta NSPT no metro " + k + " para a média da ponta.");
    });
    const Np = ns.length ? ns.reduce((s, v) => s + v, 0) / ns.length : null;
    const estTip = soloEm(estratos, L);
    const sTip = estTip ? solo(estTip.solo) : null;
    let Qp = null;
    let qp = null;
    let alpha = null;
    let betaP = null;
    if (!sTip || sTip.decK == null || Np == null) {
      alertas.push("Ponta Décourt sem K ou sem Np.");
    } else {
      const ab = tab[sTip.decCol];
      alpha = ab[0];
      betaP = ab[1];
      qp = alpha * sTip.decK * Np;
      Qp = qp * Ap;
    }
    const Lf = Math.max(0, L - 1);
    let Qs = 0;
    const linhas = [];
    for (const tr of trechos(estratos, amostras, Lf)) {
      const s = solo(tr.soloId);
      if (!s || s.decK == null || tr.n == null) {
        alertas.push("Fuste Décourt " + tr.z0.toFixed(2) + "–" + tr.z1.toFixed(2) + " m omitido.");
        linhas.push({ ...tr, qs: null, dQ: 0, omitido: true });
        continue;
      }
      const beta = tab[s.decCol][1];
      const qs = beta * 10 * (tr.n / 3 + 1);
      const dQ = U * qs * tr.dl;
      Qs += dQ;
      linhas.push({ ...tr, qs, dQ, beta, omitido: false });
    }
    return {
      metodo: "Décourt-Quaresma",
      indisponivel: false,
      nota: tab.nota,
      fonteK: FONTES.decourtK,
      fonteAB: FONTES.decourtAB,
      U, Ap, Db,
      Np, ns, alpha, betaPonta: betaP,
      soloPonta: estTip ? estTip.solo : null,
      qp, Qp, Qs, linhas,
      Qult: Qp == null ? null : Qp + Qs,
      zonaPontaExcluida_m: 1,
      alertas,
    };
  }

  function paramsEstruturais(tipoId, caa) {
    const t = TIPOS[tipoId];
    if (!t) return null;
    const e = t.estrutural;
    if (e.modo === "nbr8800") {
      return { modo: "nbr8800", fonte: "NBR 6122:2019, item 8.6.7 — dimensionar pela NBR 8800. Não calculado neste aplicativo." };
    }
    if (e.modo === "nbr6118") {
      return { modo: "nbr6118", gc: e.gc, sigma: null, asMin: e.asMin, lArmMin: null, fckMin: null, fonte: t.nota };
    }
    const bloco = caa === "III" || caa === "IV" ? e.caa34 : e.caa12;
    return {
      modo: "tabela4",
      gc: bloco.gc,
      sigma: bloco.sigma,
      asMin: e.asMin,
      lArmMin: e.lArmMin,
      fckMin: bloco.fckMin,
      caaUsada: caa === "III" || caa === "IV" ? "III/IV" : "I/II",
      fonte: FONTES.estrutural,
    };
  }

  function areaAco(barras) {
    return (barras || []).reduce((s, b) => s + b.quantidade * Math.PI * Math.pow(b.diametro_mm / 2000, 2), 0);
  }

  function estrutural(tipoId, D, fckMPa, barras, caa, nAdmInformado) {
    const p = paramsEstruturais(tipoId, caa);
    const Ac = Math.PI * D * D / 4;
    const As = areaAco(barras);
    const alertas = [];
    if (!p || p.modo === "nbr8800") {
      return {
        Ac, As, p,
        NadmComp: nAdmInformado != null ? nAdmInformado : null,
        NadmTracao: nAdmInformado != null ? null : null,
        RdComp: null,
        RdTracao: null,
        alertas: ["Estaca metálica: informe a carga estrutural admissível. A NBR 8800 não foi aplicada numericamente."],
      };
    }
    if (p.fckMin && fckMPa + 1e-6 < p.fckMin) {
      alertas.push("fck = " + fckMPa + " MPa está abaixo do mínimo da Tabela 4 para esta classe de agressividade (" + p.fckMin + " MPa, CAA " + p.caaUsada + ").");
    }
    const fcd = (fckMPa * 1000) / p.gc;
    const fyd = (500 * 1000) / 1.15;
    const gf = 1.4;
    const RdComp = 0.85 * fcd * Ac + fyd * As;
    const NadmComp = RdComp / gf;
    const RdTracao = fyd * As;
    const NadmTracao = RdTracao / gf;
    const AsMin = p.asMin * Ac;
    if (As + 1e-10 < AsMin) {
      alertas.push("Armadura longitudinal (" + (As * 1e4).toFixed(2).replace(".", ",") + " cm²) abaixo do mínimo da Tabela 4 (" + (100 * p.asMin).toFixed(1).replace(".", ",") + "% de Ac = " + (AsMin * 1e4).toFixed(2).replace(".", ",") + " cm²).");
    }
    const NsemArmadura = p.sigma != null ? p.sigma * 1000 * Ac : null;
    return {
      Ac, As, AsMin, p, fcd_kPa: fcd, fyd_kPa: fyd, gf,
      RdComp, NadmComp, RdTracao, NadmTracao, NsemArmadura,
      alertas,
    };
  }

  function pesoEstaca(D, L, naProf) {
    const Ap = Math.PI * D * D / 4;
    if (naProf == null || !isFinite(naProf)) {
      return { kN: 25 * Ap * L, hipotese: "NA não informado: peso com 25 kN/m³ em todo o fuste." };
    }
    const seco = Math.max(0, Math.min(L, naProf));
    const sub = Math.max(0, L - naProf);
    return {
      kN: 25 * Ap * seco + 15 * Ap * sub,
      hipotese: "25 kN/m³ acima do NA e 15 kN/m³ abaixo. NA a " + naProf + " m da boca, estaca a partir da boca.",
    };
  }

  function admissivelDe(metodo, pontaModo, fs) {
    if (!metodo || metodo.indisponivel || metodo.Qp == null) return null;
    const Qp = metodo.Qp;
    const Qs = metodo.Qs;
    let Rp = Qp;
    let texto = "";
    if (pontaModo === "desprezada") {
      Rp = 0;
      texto = "Ponta desprezada (Rp = 0). Padm = Rl / FSg. NBR 6122:2019, item 8.2.1.2, quando o contato de ponta não é assegurado ou não foi declarado.";
    } else if (pontaModo === "limitada") {
      Rp = Math.min(Qp, Qs);
      texto = "Ponta limitada a Rl (Rp = min(Qp, Qs)). Padm = (Rp + Rl) / FSg. NBR 6122:2019, item 8.2.1.2, com menção explícita e contato assegurado.";
    } else {
      Rp = Qp;
      texto = "Ponta integral. Padm = (Qp + Qs) / FSg. Item 6.2.1.2.1, FSg = " + fs + ".";
    }
    const QultUsada = Rp + Qs;
    const Qadm = QultUsada / fs;
    return { Rp, Qs, QultUsada, Qadm, texto, fs };
  }

  function calcularEstaca(opts) {
    const D = opts.D;
    const L = opts.L;
    const tipoId = opts.tipo;
    const tipo = TIPOS[tipoId];
    const fs = opts.fs && opts.fs > 0 ? opts.fs : 2;
    const dBase = opts.dBase || D;
    const av = aoki(opts.estratos, opts.amostras, L, D, tipoId, dBase);
    const dq = decourt(opts.estratos, opts.amostras, L, D, tipoId, dBase);
    const est = estrutural(tipoId, D, opts.fck, opts.barras, opts.caa || "II", opts.nEstruturalInformado);
    const peso = pesoEstaca(D, L, opts.naProf);
    const modo = opts.pontaModo || (tipo && tipo.ponta === "regra-helice" ? "desprezada" : "integral");
    const admAv = admissivelDe(av, modo === "integral" && tipo.ponta === "regra-helice" ? "limitada" : modo, fs);
    /* Para tipos com regra de ponta, o modo "integral" do usuário vira a variante limitada,
       exceto se ele pedir explicitamente "integral-especial" (Anexo J especial). */
    let admAvF = admAv;
    if (tipo && tipo.ponta === "regra-helice") {
      if (opts.pontaModo === "integral-especial") admAvF = admissivelDe(av, "integral", fs);
      else if (opts.pontaModo === "limitada") admAvF = admissivelDe(av, "limitada", fs);
      else admAvF = admissivelDe(av, opts.pontaModo === "integral" ? "limitada" : (opts.pontaModo || "desprezada"), fs);
    }
    const modoDq = tipo && tipo.ponta === "regra-helice"
      ? (opts.pontaModo === "integral-especial" ? "integral" : (opts.pontaModo === "limitada" ? "limitada" : (opts.pontaModo || "desprezada")))
      : "integral";
    const admDq = admissivelDe(dq, modoDq === "desprezada" || modoDq === "limitada" || modoDq === "integral" ? modoDq : "integral", fs);

    function pacote(adm, rotulo) {
      if (!adm) return null;
      const geo = adm.Qadm;
      const estrut = est.NadmComp;
      const gov = estrut == null ? geo : Math.min(geo, estrut);
      const geoT = adm.Qs / fs + peso.kN;
      const estT = est.NadmTracao;
      const govT = estT == null ? geoT : Math.min(geoT, estT);
      return {
        rotulo,
        Qp: adm.Rp === 0 && opts.pontaModo !== "limitada" ? 0 : adm.Rp,
        Qs: adm.Qs,
        Qult: adm.QultUsada,
        QadmGeo: geo,
        QadmEst: estrut,
        QadmGov: gov,
        governa: estrut == null ? "geotécnica" : (geo <= estrut ? "geotécnica" : "estrutural"),
        QadmTracaoGeo: geoT,
        QadmTracaoEst: estT,
        QadmTracaoGov: govT,
        governaTracao: estT == null ? "geotécnica" : (geoT <= estT ? "geotécnica" : "estrutural"),
        texto: adm.texto,
      };
    }

    const alertas = []
      .concat(av.alertas || [])
      .concat((dq && dq.alertas) || [])
      .concat(est.alertas || []);
    if (tipo && tipo.nota) alertas.push(tipo.nota);
    if (dq && dq.nota) alertas.push("Décourt: " + dq.nota);

    return {
      tipo, D, L, fs, modoPonta: opts.pontaModo || modo,
      av, dq, est, peso,
      aokiAdm: pacote(admAvF, "Aoki-Velloso"),
      decourtAdm: pacote(admDq, "Décourt-Quaresma"),
      alertas,
    };
  }

  function reacoes(estacas, N, Mx, My) {
    const n = estacas.length;
    if (!n) return { Ri: [], alertas: ["Bloco sem estacas."] };
    const xg = estacas.reduce((s, p) => s + p.x, 0) / n;
    const yg = estacas.reduce((s, p) => s + p.y, 0) / n;
    const loc = estacas.map((p) => ({ id: p.id, x: p.x - xg, y: p.y - yg }));
    const sumX2 = loc.reduce((s, p) => s + p.x * p.x, 0);
    const sumY2 = loc.reduce((s, p) => s + p.y * p.y, 0);
    const alertas = [];
    if (Math.abs(My) > 1e-8 && sumX2 < 1e-10) alertas.push("My não é equilibrado: as estacas estão alinhadas em X (Σx² = 0).");
    if (Math.abs(Mx) > 1e-8 && sumY2 < 1e-10) alertas.push("Mx não é equilibrado: as estacas estão alinhadas em Y (Σy² = 0).");
    const Ri = loc.map((p) => {
      let r = N / n;
      if (sumY2 > 1e-10) r += (Mx * p.y) / sumY2;
      if (sumX2 > 1e-10) r += (My * p.x) / sumX2;
      return { id: p.id, x: p.x, y: p.y, Ri: r };
    });
    return { xg, yg, sumX2, sumY2, Ri, alertas, N, Mx, My };
  }

  function arranjo(n, s) {
    const p = [];
    const add = (x, y) => p.push({ id: "E" + (p.length + 1), x: round6(x), y: round6(y) });
    if (n <= 1) {
      add(0, 0);
      return p;
    }
    if (n === 2) {
      add(-s / 2, 0); add(s / 2, 0); return p;
    }
    if (n === 3) {
      const h = (s * Math.sqrt(3)) / 2;
      add(-s / 2, -h / 3); add(s / 2, -h / 3); add(0, (2 * h) / 3); return p;
    }
    if (n === 4) {
      add(-s / 2, -s / 2); add(s / 2, -s / 2); add(s / 2, s / 2); add(-s / 2, s / 2); return p;
    }
    if (n === 5) {
      const lado = s * Math.SQRT2;
      add(-lado / 2, -lado / 2); add(lado / 2, -lado / 2); add(lado / 2, lado / 2); add(-lado / 2, lado / 2); add(0, 0);
      return p;
    }
    if (n === 6) {
      for (let j = 0; j < 2; j += 1) for (let i = 0; i < 3; i += 1) add((i - 1) * s, (j - 0.5) * s);
      return p;
    }
    if (n === 7) {
      add(0, 0);
      for (let k = 0; k < 6; k += 1) add(s * Math.cos((k * Math.PI) / 3), s * Math.sin((k * Math.PI) / 3));
      return p;
    }
    if (n === 8) {
      for (let j = 0; j < 2; j += 1) for (let i = 0; i < 4; i += 1) add((i - 1.5) * s, (j - 0.5) * s);
      return p;
    }
    for (let j = 0; j < 3; j += 1) for (let i = 0; i < 3; i += 1) add((i - 1) * s, (j - 1) * s);
    return p;
  }

  function paresEspacamento(blocos, D, fator) {
    const globais = [];
    (blocos || []).forEach((b) => {
      const ang = ((b.rotacaoGraus || 0) * Math.PI) / 180;
      const c = Math.cos(ang);
      const si = Math.sin(ang);
      (b.estacas || []).forEach((e) => {
        const x = (b.X || 0) + e.x * c - e.y * si;
        const y = (b.Y || 0) + e.x * si + e.y * c;
        globais.push({ bloco: b.id, estaca: e.id, x, y });
      });
    });
    const pares = [];
    let menor = null;
    for (let i = 0; i < globais.length; i += 1) {
      for (let j = i + 1; j < globais.length; j += 1) {
        const dx = globais[i].x - globais[j].x;
        const dy = globais[i].y - globais[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (menor == null || dist < menor.dist) menor = { dist, a: globais[i], b: globais[j] };
        if (fator && dist + 1e-6 < fator * D) {
          pares.push({ dist, a: globais[i], b: globais[j], minimo: fator * D });
        }
      }
    }
    return { pares, menor, n: globais.length };
  }

  function rigidezBloco(estacas, ax, ay, d, cx, cy) {
    if (!(d > 0) || !(ax > 0) || !(ay > 0)) {
      return { aplicavel: false, motivo: "Informe altura útil do bloco e as dimensões do pilar para o critério geométrico." };
    }
    const itens = estacas.map((e) => {
      const vx = e.x - (cx || 0);
      const vy = e.y - (cy || 0);
      const dist = Math.hypot(vx, vy);
      if (dist < 1e-8) return { id: e.id, xFace: 0, theta: 90, rigido: true };
      const ux = vx / dist;
      const uy = vy / dist;
      const tx = Math.abs(ux) > 1e-9 ? (ax / 2) / Math.abs(ux) : Infinity;
      const ty = Math.abs(uy) > 1e-9 ? (ay / 2) / Math.abs(uy) : Infinity;
      const tFace = Math.min(tx, ty);
      const xFace = Math.max(0, dist - tFace);
      const theta = (Math.atan2(d, xFace) * 180) / Math.PI;
      return { id: e.id, xFace, theta, rigido: d + 1e-9 >= xFace };
    });
    return {
      aplicavel: true,
      itens,
      todosRigidos: itens.every((i) => i.rigido),
      fonte: FONTES.bloco,
    };
  }

  function classificarReacao(Ri, adm) {
    if (!adm) return { estado: "sem capacidade" };
    if (Ri >= 0) {
      const flags = [];
      if (Ri > adm.QadmGov + 1e-6) flags.push(adm.governa === "estrutural" ? "falha estrutural" : "falha geotécnica");
      if (adm.QadmEst != null && Ri > adm.QadmEst + 1e-6) flags.push("falha estrutural");
      if (Ri > adm.QadmGeo + 1e-6) flags.push("falha geotécnica");
      const uniq = Array.from(new Set(flags));
      return { estado: uniq.length ? uniq.join("; ") : "compressão atendida", compressao: true };
    }
    const T = -Ri;
    const flags = [];
    if (T > adm.QadmTracaoGov + 1e-6) flags.push(adm.governaTracao === "estrutural" ? "falha estrutural à tração" : "falha geotécnica à tração");
    if (adm.QadmTracaoEst != null && T > adm.QadmTracaoEst + 1e-6) flags.push("falha estrutural à tração");
    if (T > adm.QadmTracaoGeo + 1e-6) flags.push("falha geotécnica à tração");
    const uniq = Array.from(new Set(flags));
    return { estado: uniq.length ? uniq.join("; ") : "tração atendida", compressao: false };
  }

  return {
    FONTES, SOLOS, TIPOS, DECOURT_AB,
    solo, fatoresAoki, trechos, aoki, decourt, estrutural, pesoEstaca,
    calcularEstaca, reacoes, arranjo, paresEspacamento, rigidezBloco, classificarReacao,
    areaAco,
  };
});
