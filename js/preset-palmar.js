/* Preset lido das pranchas Palmar / Palmas do Arvoredo.
   NSPT = coluna 2º+3º do boletim (últimos 30 cm, NBR 6484). */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.PresetPalmar = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function amostras(pares) {
    return pares.map(([depth, n]) => ({ depth, n }));
  }

  const SP01 = {
    id: "SP01",
    titulo: "SP-01 — JA Barossi, ref. 14219/2025",
    local: "Rua dos Juazeiros, Governador Celso Ramos/SC",
    cotaBoca_m: 0.8,
    naProf_m: 1.65,
    naNota: "O boletim escreve Prof. N.A. = −1,65 m e o croqui repete NA(m) = −1,65 ao lado da cota da boca +0,80 m. Leitura adotada: 1,65 m abaixo da boca (o texto do relatório mede o NA em relação à boca, 12 h depois). A leitura alternativa, NA como cota −1,65, poria a água a 2,45 m da boca. Aoki e Décourt não usam o NA na ruptura; o peso submerso muda poucos kN.",
    profundidade_m: 30.6,
    impenetravel: "30,60 m — impenetrável à percussão (matacão ou rocha), nota NBR 6484/2020.",
    amostras: amostras([
      [1, 11], [2, 31], [3, 9], [4, 5], [5, 6], [6, 12], [7, 7], [8, 7], [9, 5], [10, 6],
      [11, 8], [12, 15], [13, 22], [14, 10], [15, 13], [16, 11], [17, 8], [18, 9], [19, 6], [20, 18],
      [21, 6], [22, 7], [23, 9], [24, 11], [25, 6], [26, 6], [27, 18], [28, 13], [29, 15], [30, 19],
    ]),
    estratos: [
      { z0: 0, z1: 0.7, solo: "areia", nota: "Areia média cinza, sem compacidade no boletim." },
      { z0: 0.7, z1: 1.3, solo: "areia", nota: "" },
      { z0: 1.3, z1: 2.6, solo: "areia", nota: "" },
      { z0: 2.6, z1: 3.3, solo: "areia", nota: "" },
      { z0: 3.3, z1: 4.2, solo: "areia", nota: "" },
      { z0: 4.2, z1: 5.6, solo: "argila_siltoarenosa", nota: "Argila silte arenosa → argila siltoarenosa." },
      { z0: 5.6, z1: 6.3, solo: "silte_argiloarenoso", nota: "" },
      { z0: 6.3, z1: 6.8, solo: "areia", nota: "" },
      { z0: 6.8, z1: 8.65, solo: "argila_siltoarenosa", nota: "" },
      { z0: 8.65, z1: 11.65, solo: "argila_siltoarenosa", nota: "Consistência mole." },
      { z0: 11.65, z1: 13.3, solo: "areia_siltosa", nota: "Ponta dos 12 m cai nesta lente." },
      { z0: 13.3, z1: 13.6, solo: "areia", nota: "Areia com pedregulho: não há linha própria; usada areia." },
      { z0: 13.6, z1: 16.65, solo: "silte_argiloarenoso", nota: "" },
      { z0: 16.65, z1: 19.55, solo: "argila_siltoarenosa", nota: "" },
      { z0: 19.55, z1: 20.45, solo: "areia", nota: "" },
      { z0: 20.45, z1: 22.3, solo: "argila_siltoarenosa", nota: "" },
      { z0: 22.3, z1: 23.3, solo: "areia", nota: "" },
      { z0: 23.3, z1: 24.0, solo: "argila_arenosa", nota: "" },
      { z0: 24.0, z1: 24.8, solo: "areia", nota: "" },
      { z0: 24.8, z1: 26.3, solo: "argila_siltoarenosa", nota: "" },
      { z0: 26.3, z1: 27.0, solo: "areia", nota: "" },
      { z0: 27.0, z1: 27.5, solo: "areia", nota: "Areia com pedregulho tratada como areia." },
      { z0: 27.5, z1: 30.6, solo: "silte_argiloarenoso", nota: "" },
    ],
  };

  const SP02 = {
    id: "SP02",
    titulo: "SP-02 — JA Barossi, ref. 14219/2025",
    local: "Rua dos Juazeiros, Governador Celso Ramos/SC",
    cotaBoca_m: 0.7,
    naProf_m: 1.5,
    naNota: "Prof. N.A. = −1,50 m lido como 1,50 m abaixo da boca. Alternativa de cota: água a 2,20 m da boca.",
    profundidade_m: 28,
    impenetravel: "28,00 m — impenetrável (silte arenoso); avanço de lavagem de 1 cm em 10 min, três vezes, NBR 6484/2020.",
    amostras: amostras([
      [1, 14], [2, 51], [3, 12], [4, 3], [5, 4], [6, 6], [7, 16], [8, 9], [9, 7], [10, 13],
      [11, 9], [12, 6], [13, 7], [14, 4], [15, 2], [16, 2], [17, 6], [18, 8], [19, 8], [20, 11],
      [21, 7], [22, 6], [23, 6], [24, 6], [25, 7], [26, 19], [27, 44],
    ]),
    estratos: [
      { z0: 0, z1: 0.2, solo: "areia", nota: "Aterro com cascalho: não há K publicado. Tratado como areia só neste 0,20 m de fuste." },
      { z0: 0.2, z1: 1.0, solo: "areia", nota: "" },
      { z0: 1.0, z1: 1.45, solo: "argila_arenosa", nota: "" },
      { z0: 1.45, z1: 2.7, solo: "areia", nota: "" },
      { z0: 2.7, z1: 3.6, solo: "areia", nota: "" },
      { z0: 3.6, z1: 4.0, solo: "areia", nota: "" },
      { z0: 4.0, z1: 6.15, solo: "argila_siltoarenosa", nota: "Mole." },
      { z0: 6.15, z1: 7.0, solo: "areia", nota: "" },
      { z0: 7.0, z1: 8.3, solo: "silte_argiloarenoso", nota: "" },
      { z0: 8.3, z1: 9.8, solo: "argila_siltoarenosa", nota: "" },
      { z0: 9.8, z1: 11.0, solo: "silte_argiloarenoso", nota: "" },
      { z0: 11.0, z1: 11.6, solo: "areia_siltosa", nota: "" },
      { z0: 11.6, z1: 14.3, solo: "argila_siltoarenosa", nota: "Ponta dos 12 m nesta argila, NSPT do metro 12 = 6." },
      { z0: 14.3, z1: 16.6, solo: "argila", nota: "Argila marrom muito mole." },
      { z0: 16.6, z1: 17.7, solo: "argila_arenosa", nota: "" },
      { z0: 17.7, z1: 19.5, solo: "areia", nota: "" },
      { z0: 19.5, z1: 20.9, solo: "areia", nota: "" },
      { z0: 20.9, z1: 25.8, solo: "argila_arenosa", nota: "" },
      { z0: 25.8, z1: 26.9, solo: "areia", nota: "Areia com pedregulho tratada como areia." },
      { z0: 26.9, z1: 28.0, solo: "silte_arenoso", nota: "" },
    ],
  };

  /* Triângulo equilátero de lado 1,25 m, centroide na origem.
     h = 1,25·√3/2 = 1,08253 m; vértices a ±h/3. */
  const H = 1.25 * Math.sqrt(3) / 2;
  const TRI_CIMA = [
    { id: "E1", x: -0.625, y: round(-H / 3) },
    { id: "E2", x: 0.625, y: round(-H / 3) },
    { id: "E3", x: 0, y: round((2 * H) / 3) },
  ];
  const TRI_BAIXO = [
    { id: "E1", x: -0.625, y: round(H / 3) },
    { id: "E2", x: 0.625, y: round(H / 3) },
    { id: "E3", x: 0, y: round((-2 * H) / 3) },
  ];
  const PAR = [
    { id: "E1", x: 0, y: -0.625 },
    { id: "E2", x: 0, y: 0.625 },
  ];

  function round(v) {
    return Math.round(v * 10000) / 10000;
  }

  /* Cadeia de cotas lida na planta (cm → m): 770, 770, 705, 705, 150+150, 715, 695,5.
     Oito blocos, sete vãos. A fileira do eixo 2 repete a do eixo 1. */
  const XS = [0, 7.7, 15.4, 22.45, 29.5, 32.5, 39.65, 46.605];
  const EIXOS = ["A", "B", "C", "D", "E", "F", "G", "H"];
  const TIPOS_FILA = ["BL02", "BL03", "BL03", "BL03", "BL02", "BL02", "BL03", "BL02"];

  function bloco(fila, i) {
    const tipo = TIPOS_FILA[i];
    const y = fila === 1 ? 7.4 : 0;
    const tres = tipo === "BL03";
    return {
      id: "E" + fila + "-" + EIXOS[i],
      nome: "Eixo " + fila + " / " + EIXOS[i] + " — " + (tres ? "BL-03 (detalhe BL-04)" : "BL-02"),
      tipoBloco: tres ? "BL-03" : "BL-02",
      X: XS[i],
      Y: y,
      rotacaoGraus: 0,
      estacas: (tres ? (fila === 1 ? TRI_CIMA : TRI_BAIXO) : PAR).map((e) => ({ ...e })),
      N: 0,
      Mx: 0,
      My: 0,
      ex: 0,
      ey: 0,
      Hx: 0,
      Hy: 0,
      ax: 0,
      ay: 0,
      d: 0,
      cargaNota: "N, Mx e My não constam na prancha. Ficam em zero. Não são carga de projeto.",
    };
  }

  const blocos = [];
  for (let i = 0; i < 8; i += 1) {
    blocos.push(bloco(1, i));
    blocos.push(bloco(2, i));
  }

  const projeto = {
    titulo: "Palmar / Palmas do Arvoredo — tanque de aeração",
    fonte: "Prancha 01/08, locação da fundação e detalhamento dos blocos, RCA, dez/2025, revisão R00. Sondagem JA Barossi, ref. 14219/2025, novembro/2025.",
    tipo: "helice",
    D: 0.5,
    L: 12,
    dBase: 0.5,
    fck: 30,
    caa: "II",
    fs: 2,
    pontaModo: "desprezada",
    barras: [{ quantidade: 5, diametro_mm: 12.5 }],
    sondagemAtiva: "SP01",
    sondagens: [SP01, SP02],
    blocos,
    arranque_kN: 400,
    arranqueNota: "Nota 5 da prancha: ARRANQUE 400 kN, no mesmo bloco da nota de torque da estaca Ø50. Lido como esforço de tração por estaca. A prancha não diz se o valor é característico ou de cálculo.",
    torque_kNm: 80,
    premissas: [
      "Tipo, diâmetro, comprimento e quantidade vêm da prancha: 40 estacas hélice contínua, Ø 50 cm, L = 12 m (480 m de perfuração e 94,4 m³ teóricos fecham com π·0,25²·12·40).",
      "A nota 2 diz que os 12 m são estimados pelo relatório de sondagem e devem ser ajustados na execução.",
      "fck 30 MPa está na nota 3.1. A classe de agressividade não está escrita. O cálculo usa CAA I/II, compatível com o C30 da Tabela 4. A obra é na Praia de Palmas; CAA III/IV pediria C40.",
      "Armadura longitudinal: 5 barras na seção e na elevação, e 33 m de CA-50 Ø 12,5 por estaca no resumo (1 320 m / 40). As = 6,14 cm².",
      "Espaçamento entre eixos no bloco: 1,25 m (cotas 40+125+40 no bloco de 2 e lado 125 no triângulo de 3, com altura 108,25 = 125·√3/2).",
      "Carga de compressão N do pilar não está na prancha e não foi inventada.",
      "Os furos SP-01 e SP-02 não estão locados na planta de fundação. Os dois perfis são calculados; não há um furo por bloco.",
      "Ponta não é mencionada na prancha. Pelo item 8.2.1.2, o cenário governante despreza a ponta. O cenário com Rp limitada a Rl é mostrado à parte.",
    ],
  };

  return { projeto, SP01, SP02, XS, EIXOS, TIPOS_FILA };
});
