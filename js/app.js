/* Interface em português. O motor está em engine.js. */
(function () {
  "use strict";
  const E = window.Estacas;
  const P = window.PresetPalmar;

  const fmt = (n, d) => {
    if (n == null || !isFinite(n)) return "—";
    return n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
  };
  const kn = (n) => fmt(n, 1) + " kN (" + fmt(n / 9.80665, 1) + " tf)";
  const num = (v) => {
    if (typeof v === "number") return v;
    const s = String(v == null ? "" : v).trim().replace(/\s/g, "").replace(",", ".");
    if (s === "" || s === "-" || s === ".") return 0;
    const n = Number(s);
    return isFinite(n) ? n : 0;
  };
  const esc = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  let state = null;

  function vazio() {
    return {
      titulo: "Projeto novo",
      tipo: "helice",
      D: 0.5,
      L: 12,
      dBase: 0.5,
      fck: 30,
      caa: "II",
      fs: 2,
      pontaModo: "desprezada",
      barras: [{ quantidade: 6, diametro_mm: 12.5 }],
      nEstruturalInformado: 0,
      sondagemAtiva: 0,
      sondagens: [{
        id: "SP1",
        titulo: "Sondagem 1",
        naProf_m: 2,
        amostras: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((d) => ({ depth: d, n: 8 })),
        estratos: [{ z0: 0, z1: 12, solo: "areia_siltosa", nota: "" }],
      }],
      blocoAtivo: 0,
      blocos: [{
        id: "B1", nome: "Bloco 1", tipoBloco: "", X: 0, Y: 0, rotacaoGraus: 0,
        estacas: E.arranjo(2, 1.25),
        N: 0, Mx: 0, My: 0, ex: 0, ey: 0, Hx: 0, Hy: 0, ax: 0.4, ay: 0.4, d: 0.6,
        usarExcentricidade: false,
      }],
      arranque_kN: 0,
      palmar: false,
      notas: [],
    };
  }

  function clonar(o) { return JSON.parse(JSON.stringify(o)); }

  function carregarPalmar() {
    const pr = clonar(P.projeto);
    state = {
      titulo: pr.titulo,
      tipo: pr.tipo,
      D: pr.D,
      L: pr.L,
      dBase: pr.dBase,
      fck: pr.fck,
      caa: pr.caa,
      fs: pr.fs,
      pontaModo: pr.pontaModo,
      barras: pr.barras,
      nEstruturalInformado: 0,
      sondagemAtiva: 0,
      sondagens: pr.sondagens,
      blocoAtivo: 0,
      blocos: pr.blocos.map((b) => Object.assign({ usarExcentricidade: false, ax: 0, ay: 0, d: 0 }, b)),
      arranque_kN: pr.arranque_kN,
      palmar: true,
      notas: pr.premissas.concat([pr.arranqueNota, pr.fonte]),
    };
    renderTudo();
    ativarAba("verif");
  }

  function sondagem() { return state.sondagens[state.sondagemAtiva]; }

  function calcularCom(sond, modo) {
    return E.calcularEstaca({
      tipo: state.tipo,
      D: state.D,
      L: state.L,
      dBase: state.tipo === "franki" ? state.dBase : state.D,
      fck: state.fck,
      caa: state.caa,
      fs: state.fs,
      pontaModo: modo || state.pontaModo,
      barras: state.barras,
      nEstruturalInformado: state.tipo === "metalica" ? state.nEstruturalInformado : null,
      estratos: sond.estratos,
      amostras: sond.amostras,
      naProf: sond.naProf_m,
    });
  }

  function momentosDoBloco(b) {
    if (b.usarExcentricidade) return { Mx: b.N * b.ey, My: b.N * b.ex, origem: "excentricidade" };
    return { Mx: b.Mx, My: b.My, origem: "momentos" };
  }

  function admGovernante(calc) {
    const a = calc.aokiAdm;
    const d = calc.decourtAdm;
    if (a && d) return a.QadmGov <= d.QadmGov ? a : d;
    return a || d;
  }

  function renderTudo() {
    renderSondagem();
    renderEstaca();
    renderBlocos();
    renderCoef();
    renderResultados();
    renderVerif();
  }

  function opcoesSolo(sel) {
    return Object.keys(E.SOLOS).map((id) => {
      const s = E.SOLOS[id];
      return "<option value=\"" + id + "\"" + (id === sel ? " selected" : "") + ">" + esc(s.nome) + "</option>";
    }).join("");
  }

  function renderSondagem() {
    const s = sondagem();
    const opts = state.sondagens.map((sd, i) =>
      "<option value=\"" + i + "\"" + (i === state.sondagemAtiva ? " selected" : "") + ">" + esc(sd.id + " — " + sd.titulo) + "</option>").join("");
    const am = s.amostras.map((a, i) =>
      "<tr><td><input data-k=\"am." + i + ".depth\" value=\"" + esc(a.depth) + "\"></td>" +
      "<td><input data-k=\"am." + i + ".n\" value=\"" + esc(a.n) + "\"></td>" +
      "<td><button type=\"button\" class=\"sec\" data-act=\"del-am\" data-i=\"" + i + "\">remover</button></td></tr>").join("");
    const es = s.estratos.map((e, i) =>
      "<tr><td><input data-k=\"es." + i + ".z0\" value=\"" + esc(e.z0) + "\"></td>" +
      "<td><input data-k=\"es." + i + ".z1\" value=\"" + esc(e.z1) + "\"></td>" +
      "<td><select data-k=\"es." + i + ".solo\">" + opcoesSolo(e.solo) + "</select></td>" +
      "<td><input data-k=\"es." + i + ".nota\" value=\"" + esc(e.nota || "") + "\"></td>" +
      "<td><button type=\"button\" class=\"sec\" data-act=\"del-es\" data-i=\"" + i + "\">remover</button></td></tr>").join("");
    document.getElementById("aba-sondagem").innerHTML =
      "<div class=\"grade\">" +
      "<div class=\"cartao\"><h2>Perfil SPT</h2>" +
      "<label>Sondagem</label><select data-k=\"sondagemAtiva\">" + opts + "</select>" +
      "<div class=\"linha\">" +
      "<div><label>Identificação</label><input data-k=\"sond.id\" value=\"" + esc(s.id) + "\"></div>" +
      "<div><label>Título</label><input data-k=\"sond.titulo\" value=\"" + esc(s.titulo) + "\"></div>" +
      "<div><label>NA abaixo da boca (m)</label><input data-k=\"sond.na\" value=\"" + esc(s.naProf_m) + "\"></div>" +
      "</div>" +
      "<p class=\"fonte\">" + esc(E.FONTES.spt) + " O NSPT digitado é o dos últimos 30 cm. No boletim Palmar essa coluna se chama 2º+3º; a coluna 1º+2º não entra no cálculo.</p>" +
      (s.naNota ? "<p class=\"mini\">" + esc(s.naNota) + "</p>" : "") +
      "<h3>Amostras</h3><table><thead><tr><th>Prof. (m)</th><th>NSPT</th><th></th></tr></thead><tbody>" + am + "</tbody></table>" +
      "<p><button type=\"button\" class=\"sec\" data-act=\"add-am\">Adicionar amostra</button> " +
      "<button type=\"button\" class=\"sec\" data-act=\"add-sond\">Nova sondagem</button></p>" +
      "</div>" +
      "<div class=\"cartao\"><h2>Camadas</h2>" +
      "<p class=\"mini\">Cada camada vai de z0 até z1, em metros a partir da boca. O solo escolhe K e α (Aoki) e K, α, β (Décourt).</p>" +
      "<table><thead><tr><th>De (m)</th><th>Até (m)</th><th>Solo</th><th>Nota</th><th></th></tr></thead><tbody>" + es + "</tbody></table>" +
      "<p><button type=\"button\" class=\"sec\" data-act=\"add-es\">Adicionar camada</button></p>" +
      (s.impenetravel ? "<p class=\"mini\">" + esc(s.impenetravel) + "</p>" : "") +
      "</div></div>";
  }

  function renderEstaca() {
    const tipos = Object.keys(E.TIPOS).map((id) =>
      "<option value=\"" + id + "\"" + (id === state.tipo ? " selected" : "") + ">" + esc(E.TIPOS[id].nome) + "</option>").join("");
    const barras = state.barras.map((b, i) =>
      "<tr><td><input data-k=\"bar." + i + ".q\" value=\"" + esc(b.quantidade) + "\"></td>" +
      "<td><input data-k=\"bar." + i + ".d\" value=\"" + esc(b.diametro_mm) + "\"></td>" +
      "<td><button type=\"button\" class=\"sec\" data-act=\"del-bar\" data-i=\"" + i + "\">remover</button></td></tr>").join("");
    const fat = E.fatoresAoki(state.tipo, state.D);
    document.getElementById("aba-estaca").innerHTML =
      "<div class=\"grade\">" +
      "<div class=\"cartao\"><h2>Estaca</h2>" +
      "<label>Tipo</label><select data-k=\"tipo\">" + tipos + "</select>" +
      "<div class=\"linha\">" +
      "<div><label>Diâmetro do fuste (m)</label><input data-k=\"D\" value=\"" + esc(state.D) + "\"></div>" +
      "<div><label>Comprimento (m)</label><input data-k=\"L\" value=\"" + esc(state.L) + "\"></div>" +
      "<div><label>Diâmetro da base (m)</label><input data-k=\"dBase\" value=\"" + esc(state.dBase) + "\"></div>" +
      "<div><label>fck (MPa)</label><input data-k=\"fck\" value=\"" + esc(state.fck) + "\"></div>" +
      "</div>" +
      "<div class=\"linha\">" +
      "<div><label>CAA da NBR 6118 (Tabela 4)</label><select data-k=\"caa\">" +
      ["I", "II", "III", "IV"].map((c) => "<option" + (c === state.caa ? " selected" : "") + ">" + c + "</option>").join("") +
      "</select></div>" +
      "<div><label>FSg</label><select data-k=\"fs\">" +
      "<option value=\"2\"" + (state.fs === 2 ? " selected" : "") + ">2,0 — semiempírico, sem prova de carga</option>" +
      "<option value=\"1.6\"" + (state.fs === 1.6 ? " selected" : "") + ">1,6 — resistência vinda de prova de carga estática</option>" +
      "</select></div>" +
      "<div><label>Ponta (hélice e escavada com fluido)</label><select data-k=\"pontaModo\">" +
      "<option value=\"desprezada\"" + (state.pontaModo === "desprezada" ? " selected" : "") + ">Desprezar ponta (Rp = 0)</option>" +
      "<option value=\"limitada\"" + (state.pontaModo === "limitada" ? " selected" : "") + ">Ponta com Rp ≤ Rl</option>" +
      "<option value=\"integral-especial\"" + (state.pontaModo === "integral-especial" ? " selected" : "") + ">Ponta integral (Anexo J especial)</option>" +
      "</select></div>" +
      "</div>" +
      "<p class=\"fonte\">F1 = " + fmt(fat.f1, 3) + " e F2 = " + fmt(fat.f2, 3) + ". " + esc(fat.fonte) + "</p>" +
      "<p class=\"fonte\">" + esc(E.FONTES.pontaHelice) + "</p>" +
      "<p class=\"fonte\">" + esc(E.FONTES.fs) + " O FSg = 1,6 só se aplica quando a resistência usada é a da prova de carga, não como atalho sobre a fórmula semiempírica. Se você escolher 1,6 sem ter a carga de ruptura do ensaio, o número deixa de ser o da norma.</p>" +
      (state.tipo === "metalica"
        ? "<label>N estrutural admissível informado (kN) — NBR 8800 não calculada</label><input data-k=\"nEst\" value=\"" + esc(state.nEstruturalInformado) + "\">"
        : "") +
      "</div>" +
      "<div class=\"cartao\"><h2>Armadura longitudinal</h2>" +
      "<p class=\"mini\">CA-50, fyk = 500 MPa, γs = 1,15. A armadura de tração usa só o aço. Opcionalmente a NBR 6122, item 8.6.2, admite reduzir 2 mm no diâmetro como espessura de sacrifício; isso não está aplicado no número principal.</p>" +
      "<table><thead><tr><th>Quantidade</th><th>Ø (mm)</th><th></th></tr></thead><tbody>" + barras + "</tbody></table>" +
      "<p><button type=\"button\" class=\"sec\" data-act=\"add-bar\">Adicionar bitola</button></p>" +
      "<p class=\"fonte\">" + esc(E.FONTES.estrutural) + "</p>" +
      "</div></div>";
  }

  function renderBlocos() {
    const b = state.blocos[state.blocoAtivo];
    const lista = state.blocos.map((bl, i) =>
      "<button type=\"button\" data-act=\"sel-bloco\" data-i=\"" + i + "\" class=\"" + (i === state.blocoAtivo ? "ativa" : "") + "\">" +
      esc(bl.nome || bl.id) + "</button>").join("");
    const est = (b.estacas || []).map((e, i) =>
      "<tr><td>" + esc(e.id) + "</td>" +
      "<td><input data-k=\"est." + i + ".x\" value=\"" + esc(e.x) + "\"></td>" +
      "<td><input data-k=\"est." + i + ".y\" value=\"" + esc(e.y) + "\"></td>" +
      "<td><button type=\"button\" class=\"sec\" data-act=\"del-est\" data-i=\"" + i + "\">remover</button></td></tr>").join("");
    const lays = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) =>
      "<button type=\"button\" class=\"sec\" data-act=\"layout\" data-n=\"" + n + "\">" + n + "</button>").join(" ");
    document.getElementById("aba-blocos").innerHTML =
      "<div class=\"grade\">" +
      "<div class=\"cartao nao-imprime\"><h2>Blocos do projeto</h2>" +
      "<div class=\"lista-blocos\">" + lista + "</div>" +
      "<p><button type=\"button\" data-act=\"add-bloco\">Adicionar bloco</button> " +
      "<button type=\"button\" class=\"sec\" data-act=\"del-bloco\">Remover este bloco</button></p>" +
      "</div>" +
      "<div class=\"cartao\"><h2>" + esc(b.nome || b.id) + "</h2>" +
      "<div class=\"linha\">" +
      "<div><label>Nome</label><input data-k=\"bl.nome\" value=\"" + esc(b.nome || "") + "\"></div>" +
      "<div><label>X do bloco (m)</label><input data-k=\"bl.X\" value=\"" + esc(b.X || 0) + "\"></div>" +
      "<div><label>Y do bloco (m)</label><input data-k=\"bl.Y\" value=\"" + esc(b.Y || 0) + "\"></div>" +
      "</div>" +
      "<h3>Cargas</h3>" +
      "<div class=\"linha\">" +
      "<div><label>N (kN, compressão +)</label><input data-k=\"bl.N\" value=\"" + esc(b.N) + "\"></div>" +
      "<div><label>Mx (kN·m)</label><input data-k=\"bl.Mx\" value=\"" + esc(b.Mx) + "\"></div>" +
      "<div><label>My (kN·m)</label><input data-k=\"bl.My\" value=\"" + esc(b.My) + "\"></div>" +
      "</div>" +
      "<label><input type=\"checkbox\" data-k=\"bl.excent\" " + (b.usarExcentricidade ? "checked" : "") + " style=\"width:auto\"> Usar excentricidade da carga no lugar de Mx e My (Mx = N·ey, My = N·ex)</label>" +
      "<div class=\"linha\">" +
      "<div><label>ex (m)</label><input data-k=\"bl.ex\" value=\"" + esc(b.ex || 0) + "\"></div>" +
      "<div><label>ey (m)</label><input data-k=\"bl.ey\" value=\"" + esc(b.ey || 0) + "\"></div>" +
      "<div><label>Hx (kN) — não dimensiona</label><input data-k=\"bl.Hx\" value=\"" + esc(b.Hx || 0) + "\"></div>" +
      "<div><label>Hy (kN) — não dimensiona</label><input data-k=\"bl.Hy\" value=\"" + esc(b.Hy || 0) + "\"></div>" +
      "</div>" +
      "<h3>Pilar e bloco, para o critério de rigidez</h3>" +
      "<div class=\"linha\">" +
      "<div><label>Pilar ax (m)</label><input data-k=\"bl.ax\" value=\"" + esc(b.ax || 0) + "\"></div>" +
      "<div><label>Pilar ay (m)</label><input data-k=\"bl.ay\" value=\"" + esc(b.ay || 0) + "\"></div>" +
      "<div><label>Altura útil d (m)</label><input data-k=\"bl.d\" value=\"" + esc(b.d || 0) + "\"></div>" +
      "</div>" +
      "<p class=\"fonte\">" + esc(E.FONTES.bloco) + "</p>" +
      "<h3>Estacas do bloco — x, y em metros, origem livre</h3>" +
      "<p class=\"mini\">Arranjo padrão (o espaçamento pedido é o mínimo entre eixos):</p>" +
      "<div class=\"linha\"><div><label>Espaçamento do arranjo (m)</label><input id=\"esp-arranjo\" value=\"" + esc(state._espArranjo || (E.TIPOS[state.tipo].espD ? E.TIPOS[state.tipo].espD * state.D : 2.5 * state.D)) + "\"></div></div>" +
      "<p>" + lays + " <button type=\"button\" class=\"sec\" data-act=\"add-est\">Adicionar estaca</button></p>" +
      "<table><thead><tr><th>Estaca</th><th>x (m)</th><th>y (m)</th><th></th></tr></thead><tbody>" + est + "</tbody></table>" +
      (b.cargaNota ? "<p class=\"mini\">" + esc(b.cargaNota) + "</p>" : "") +
      "</div></div>";
  }

  function htmlMetodo(rotulo, bruto, adm) {
    if (!bruto || bruto.indisponivel) {
      return "<div class=\"cartao\"><h3>" + esc(rotulo) + "</h3><p>" + esc(bruto && bruto.motivo ? bruto.motivo : "Indisponível.") + "</p></div>";
    }
    const linhas = (bruto.linhas || []).filter((l) => !l.omitido).map((l) => {
      const solo = E.SOLOS[l.soloId] ? E.SOLOS[l.soloId].nome : l.soloId;
      if (l.ql != null) {
        return "<tr><td>" + fmt(l.z0, 2) + "–" + fmt(l.z1, 2) + "</td><td>" + esc(solo) + "</td><td class=\"num\">" + fmt(l.n, 0) + "</td><td class=\"num\">" + fmt(l.ql, 1) + "</td><td class=\"num\">" + fmt(l.dQ, 1) + "</td></tr>";
      }
      return "<tr><td>" + fmt(l.z0, 2) + "–" + fmt(l.z1, 2) + "</td><td>" + esc(solo) + "</td><td class=\"num\">" + fmt(l.n, 0) + "</td><td class=\"num\">" + fmt(l.qs, 1) + "</td><td class=\"num\">" + fmt(l.dQ, 1) + "</td></tr>";
    }).join("");
    const formula = bruto.metodo.indexOf("Aoki") === 0
      ? "qp = K·Np / F1 = " + (bruto.qp != null ? fmt(bruto.qp, 1) + " kPa" : "—") +
        "\nQp = qp·Ap = " + fmt(bruto.Qp, 1) + " kN    Ap = " + fmt(bruto.Ap, 4) + " m²    F1 = " + fmt(bruto.f1, 3) +
        "\nql = α·K·N / F2    F2 = " + fmt(bruto.f2, 3) + "    U = " + fmt(bruto.U, 3) + " m" +
        "\nQs = Σ U·ql·ΔL = " + fmt(bruto.Qs, 1) + " kN" +
        "\nQult = Qp + Qs = " + fmt(bruto.Qult, 1) + " kN" +
        "\nNp = " + fmt(bruto.np, 0) + " (metro " + bruto.metroPonta + ", solo " + (E.SOLOS[bruto.soloPonta] ? E.SOLOS[bruto.soloPonta].nome : "—") + ")"
      : "Np = média dos SPT do metro da ponta, o de cima e o de baixo = " + fmt(bruto.Np, 2) +
        "  valores [" + (bruto.ns || []).join(", ") + "]" +
        "\nqp = α·K·Np = " + fmt(bruto.qp, 1) + " kPa    α = " + fmt(bruto.alpha, 2) +
        "\nQp = qp·Ap = " + fmt(bruto.Qp, 1) + " kN" +
        "\nqs = β·10·(N/3 + 1) kPa, por trecho; o último 1 m fica de fora do fuste" +
        "\nQs = " + fmt(bruto.Qs, 1) + " kN    Qult = " + fmt(bruto.Qult, 1) + " kN";
    return "<div class=\"cartao\"><h3>" + esc(rotulo) + "</h3>" +
      "<p class=\"grande\">" + kn(adm ? adm.QadmGov : null) + "</p>" +
      "<p class=\"mini\">Qadm governante (" + esc(adm ? adm.governa : "") + ")</p>" +
      "<div class=\"formula\">" + esc(formula) + "\n\n" + esc(adm ? adm.texto : "") +
      "\nQadm geotécnica = " + fmt(adm && adm.QadmGeo, 1) + " kN" +
      "\nQadm estrutural = " + fmt(adm && adm.QadmEst, 1) + " kN" +
      "\nQadm tração geotécnica = Qs/FSg + peso = " + fmt(adm && adm.QadmTracaoGeo, 1) + " kN" +
      "\nQadm tração estrutural = " + fmt(adm && adm.QadmTracaoEst, 1) + " kN" +
      "\nQadm tração governante = " + fmt(adm && adm.QadmTracaoGov, 1) + " kN (" + esc(adm ? adm.governaTracao : "") + ")</div>" +
      "<table><thead><tr><th>Trecho</th><th>Solo</th><th>NSPT</th><th>q (kPa)</th><th>ΔQ (kN)</th></tr></thead><tbody>" + linhas + "</tbody></table>" +
      "</div>";
  }

  function svgBloco(b, re) {
    const pts = b.estacas || [];
    if (!pts.length) return "";
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    pts.forEach((p) => { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); });
    const pad = Math.max(0.6, state.D);
    minX -= pad; minY -= pad; maxX += pad; maxY += pad;
    const W = 460, H = 280;
    const sx = W / (maxX - minX || 1);
    const sy = H / (maxY - minY || 1);
    const s = Math.min(sx, sy);
    const X = (x) => (x - minX) * s;
    const Y = (y) => H - (y - minY) * s;
    const r = Math.max(8, (state.D / 2) * s);
    let circ = "";
    pts.forEach((p, i) => {
      const ri = re && re.Ri ? re.Ri[i] : null;
      const cor = !ri ? "#0e4b38" : (ri.Ri < -1e-6 ? "#8d2c2c" : "#0e4b38");
      circ += "<circle cx=\"" + X(p.x) + "\" cy=\"" + Y(p.y) + "\" r=\"" + r + "\" fill=\"" + cor + "\" fill-opacity=\"0.15\" stroke=\"" + cor + "\"/>";
      circ += "<text x=\"" + X(p.x) + "\" y=\"" + (Y(p.y) - 2) + "\" text-anchor=\"middle\" font-size=\"11\">" + esc(p.id) + "</text>";
      if (ri) circ += "<text x=\"" + X(p.x) + "\" y=\"" + (Y(p.y) + 12) + "\" text-anchor=\"middle\" font-size=\"11\">" + fmt(ri.Ri, 1) + "</text>";
    });
    return "<svg class=\"bloco\" viewBox=\"0 0 " + W + " " + H + "\">" + circ + "</svg>";
  }

  function renderResultados() {
    const s = sondagem();
    const calc = calcularCom(s, state.pontaModo);
    const calcLim = (E.TIPOS[state.tipo].ponta === "regra-helice" && state.pontaModo !== "limitada")
      ? calcularCom(s, "limitada") : null;
    const b = state.blocos[state.blocoAtivo];
    const mom = momentosDoBloco(b);
    const re = E.reacoes(b.estacas, b.N, mom.Mx, mom.My);
    const adm = admGovernante(calc);
    const tipo = E.TIPOS[state.tipo];
    const esp = E.paresEspacamento(state.blocos, state.D, tipo.espD);
    const rig = E.rigidezBloco(b.estacas, b.ax, b.ay, b.d, 0, 0);
    const linhasR = re.Ri.map((r) => {
      const cl = adm ? E.classificarReacao(r.Ri, adm) : { estado: "—" };
      const semCarga = Math.abs(b.N) < 1e-8 && Math.abs(mom.Mx) < 1e-8 && Math.abs(mom.My) < 1e-8;
      return "<tr><td>" + esc(r.id) + "</td><td class=\"num\">" + fmt(r.x, 3) + "</td><td class=\"num\">" + fmt(r.y, 3) + "</td><td class=\"num\">" + fmt(r.Ri, 1) + "</td><td>" +
        esc(semCarga ? "sem solicitação informada" : cl.estado) + "</td></tr>";
    }).join("");
    const alertas = (calc.alertas || []).concat(re.alertas || []);
    if ((b.Hx || 0) !== 0 || (b.Hy || 0) !== 0) {
      alertas.push("Hx ou Hy diferente de zero. A NBR 6122, item 8.4.2, pede verificação de plastificação do solo e do elemento. Este aplicativo não calcula reação horizontal.");
    }
    if (state.arranque_kN > 0 && adm) {
      const okG = adm.QadmTracaoGeo + 1e-6 >= state.arranque_kN;
      const okE = adm.QadmTracaoEst == null || adm.QadmTracaoEst + 1e-6 >= state.arranque_kN;
      alertas.push("Arranque de referência " + fmt(state.arranque_kN, 1) + " kN por estaca: tração geotécnica " +
        (okG ? "atende" : "não atende") + " (" + fmt(adm.QadmTracaoGeo, 1) + " kN); tração estrutural " +
        (okE ? "atende" : "não atende") + " (" + fmt(adm.QadmTracaoEst, 1) + " kN).");
    }
    const chipsEsp = tipo.espD
      ? "<span class=\"chip " + (esp.pares.length ? "aviso" : "ok") + "\">" +
        (esp.pares.length
          ? esp.pares.length + " pares com eixo a eixo &lt; " + tipo.espD + "Ø (" + fmt(tipo.espD * state.D, 2) + " m). Anexo " + esc(tipo.anexoEsp) + ": não executar em intervalo menor que 12 h."
          : "Nenhum par abaixo de " + tipo.espD + "Ø. Anexo " + esc(tipo.anexoEsp) + ".") +
        "</span>"
      : "<span class=\"chip\">Este tipo não tem mínimo numérico de espaçamento no texto de 2019 consultado (item 8.3 é qualitativo).</span>";
    document.getElementById("aba-resultados").innerHTML =
      "<p class=\"mini\">Sondagem " + esc(s.id) + ". Tipo " + esc(tipo.nome) + ". D = " + fmt(state.D, 2) + " m, L = " + fmt(state.L, 2) + " m, fck = " + fmt(state.fck, 1) + " MPa, FSg = " + fmt(state.fs, 1) + ".</p>" +
      "<div class=\"chips\">" + chipsEsp +
      "<span class=\"chip\">Peso da estaca " + kn(calc.peso.kN) + ". " + esc(calc.peso.hipotese) + "</span></div>" +
      "<div class=\"grade\">" +
      htmlMetodo("Aoki-Velloso", calc.av, calc.aokiAdm) +
      htmlMetodo("Décourt-Quaresma", calc.dq, calc.decourtAdm) +
      "</div>" +
      (calcLim ? "<p class=\"fonte\">Cenário alternativo com ponta limitada a Rl, na mesma sondagem: Aoki " +
        kn(calcLim.aokiAdm.QadmGeo) + "; Décourt " + kn(calcLim.decourtAdm.QadmGeo) + ". Não substitui o cenário escolhido acima.</p>" : "") +
      "<div class=\"cartao\"><h2>Bloco " + esc(b.nome || b.id) + "</h2>" +
      svgBloco(b, re) +
      "<div class=\"formula\">Centroide local xg = " + fmt(re.xg, 3) + " m, yg = " + fmt(re.yg, 3) + " m" +
      "\nΣx² = " + fmt(re.sumX2, 4) + " m²    Σy² = " + fmt(re.sumY2, 4) + " m²" +
      "\nN = " + fmt(b.N, 1) + " kN    Mx = " + fmt(mom.Mx, 2) + " kN·m    My = " + fmt(mom.My, 2) + " kN·m (" + mom.origem + ")" +
      "\nRi = N/n + Mx·yi/Σy² + My·xi/Σx²" +
      "\nCapacidade centrada do bloco ≈ n · Qadm governante do menor método = " +
      fmt((b.estacas.length) * (adm ? adm.QadmGov : 0), 1) + " kN. Isso é capacidade, não carga de projeto.</div>" +
      "<table><thead><tr><th>Estaca</th><th>x' (m)</th><th>y' (m)</th><th>Ri (kN)</th><th>Situação</th></tr></thead><tbody>" + linhasR + "</tbody></table>" +
      (rig.aplicavel
        ? "<p>Critério geométrico de bloco rígido (d ≥ distância da face do pilar ao eixo, ângulo da biela ≥ 45°): " +
          (rig.todosRigidos ? "atendido em todas as estacas." : "não atendido em alguma estaca.") +
          " " + rig.itens.map((i) => esc(i.id) + " θ = " + fmt(i.theta, 0) + "°").join("; ") + "</p>"
        : "<p class=\"mini\">" + esc(rig.motivo) + "</p>") +
      "<p class=\"fonte\">" + esc(E.FONTES.tracao) + "</p>" +
      "<p class=\"fonte\">" + esc(E.FONTES.group) + "</p>" +
      "</div>" +
      "<div class=\"cartao\"><h2>Espaçamento no projeto</h2>" +
      "<p>Menor distância entre eixos: " + (esp.menor ? fmt(esp.menor.dist, 3) + " m (" + esc(esp.menor.a.bloco) + " " + esc(esp.menor.a.estaca) + " e " + esc(esp.menor.b.bloco) + " " + esc(esp.menor.b.estaca) + ")" : "—") +
      ". Estacas lançadas: " + esp.n + ".</p>" +
      "<p class=\"fonte\">" + esc(E.FONTES.espacamento) + "</p></div>" +
      "<div class=\"cartao\"><h2>Alertas</h2><ul class=\"lista\">" +
      (alertas.length ? alertas.map((a) => "<li>" + esc(a) + "</li>").join("") : "<li>Nenhum alerta do motor nesta combinação.</li>") +
      "</ul></div>";
    window.__calcAtual = { sondagem: s.id, aoki: calc.aokiAdm, decourt: calc.decourtAdm, estrutural: { NadmComp: calc.est.NadmComp, NadmTracao: calc.est.NadmTracao, As_cm2: calc.est.As * 1e4 } };
  }

  function renderCoef() {
    const solos = Object.keys(E.SOLOS).filter((id) => id !== "impenetravel").map((id) => {
      const s = E.SOLOS[id];
      return "<tr><td>" + esc(s.nome) + "</td><td class=\"num\">" + fmt(s.K, 0) + "</td><td class=\"num\">" + fmt(s.alphaPct, 1) + "</td><td class=\"num\">" + fmt(s.decK, 0) + "</td><td>" + esc(s.decCol) + "</td></tr>";
    }).join("");
    const tipos = Object.keys(E.TIPOS).map((id) => {
      const t = E.TIPOS[id];
      const f = E.fatoresAoki(id, 0.5);
      const dq = t.decourt && E.DECOURT_AB[t.decourt];
      const ab = dq ? "argila α,β " + dq.argila.join("/") + "; inter " + dq.inter.join("/") + "; areia " + dq.areia.join("/") : "sem α, β";
      return "<tr><td>" + esc(t.nome) + "</td><td class=\"num\">" + fmt(f.f1, 3) + "</td><td class=\"num\">" + fmt(f.f2, 3) + "</td><td>" + esc(ab) + "</td><td>" + (t.espD ? t.espD + "Ø / 12 h, Anexo " + t.anexoEsp : "sem mínimo numérico no texto lido") + "</td></tr>";
    }).join("");
    document.getElementById("aba-coef").innerHTML =
      "<div class=\"cartao\"><h2>Solos — K e α</h2>" +
      "<p class=\"fonte\">" + esc(E.FONTES.aokiK) + " " + esc(E.FONTES.decourtK) + " A coluna Décourt (argila, inter, areia) escolhe α e β da estaca. Para hélice contínua, α = 0,30 e β = 1,00 nas três colunas, então o solo só muda o K da ponta no Décourt; no Aoki o solo muda ponta e fuste.</p>" +
      "<table><thead><tr><th>Solo</th><th>K Aoki (kPa)</th><th>α Aoki (%)</th><th>K Décourt (kPa)</th><th>Coluna</th></tr></thead><tbody>" + solos + "</tbody></table></div>" +
      "<div class=\"cartao\"><h2>Tipos — F1, F2, α, β</h2>" +
      "<p class=\"fonte\">" + esc(E.FONTES.aokiF) + " " + esc(E.FONTES.decourtAB) + " F1 e F2 da pré-moldada na tabela abaixo estão calculados com D = 0,50 m.</p>" +
      "<table><thead><tr><th>Tipo</th><th>F1</th><th>F2</th><th>Décourt α/β</th><th>Espaçamento executivo</th></tr></thead><tbody>" + tipos + "</tbody></table>" +
      "<p>Hélice segmentada (Anexo P da NBR 6122) tem procedimento executivo e a mesma linha estrutural da hélice na Tabela 4, mas não foi achado um jogo próprio de F1, F2, α e β. Não é calculada. Ômega entra só no Aoki-Velloso, no grupo publicado por Cintra e Aoki junto com raiz e hélice contínua.</p>" +
      "<p class=\"fonte\">" + esc(E.FONTES.espacamento) + "</p>" +
      "<p class=\"fonte\">Mapeamento usado quando o boletim não coincide com a tabela: areia com pedregulho → areia; argila silte arenosa → argila siltoarenosa; silte argilo arenoso → silte argiloarenoso. Aterro não tem coeficiente; no preset Palmar os 0,20 m de aterro do SP-02 foram tratados como areia e a nota fica no estrato.</p></div>";
  }

  function renderVerif() {
    if (!state.palmar) {
      document.getElementById("aba-verif").innerHTML =
        "<div class=\"cartao\"><h2>Verificação Palmar</h2><p>Carregue o preset para calcular as 40 estacas da prancha com os dois furos. O botão está no topo.</p></div>";
      return;
    }
    const linhas = state.sondagens.map((s) => {
      const sem = calcularComSond(s, "desprezada");
      const lim = calcularComSond(s, "limitada");
      return { s, sem, lim };
    });
    const corpo = linhas.map(({ s, sem, lim }) => {
      return "<tr><td>" + esc(s.id) + "</td>" +
        "<td class=\"num\">" + fmt(sem.av.Qp, 1) + "</td><td class=\"num\">" + fmt(sem.av.Qs, 1) + "</td><td class=\"num\">" + fmt(sem.aokiAdm.QadmGeo, 1) + "</td>" +
        "<td class=\"num\">" + fmt(lim.aokiAdm.QadmGeo, 1) + "</td><td class=\"num\">" + fmt(sem.aokiAdm.QadmTracaoGeo, 1) + "</td>" +
        "<td class=\"num\">" + fmt(sem.dq.Qp, 1) + "</td><td class=\"num\">" + fmt(sem.dq.Qs, 1) + "</td><td class=\"num\">" + fmt(sem.decourtAdm.QadmGeo, 1) + "</td>" +
        "<td class=\"num\">" + fmt(lim.decourtAdm.QadmGeo, 1) + "</td><td class=\"num\">" + fmt(sem.decourtAdm.QadmTracaoGeo, 1) + "</td></tr>";
    }).join("");
    const est = linhas[0].sem.est;
    const esp = E.paresEspacamento(state.blocos, state.D, 5);
    const internos = esp.pares.filter((p) => p.a.bloco === p.b.bloco).length;
    const entre = esp.pares.length - internos;
    document.getElementById("aba-verif").innerHTML =
      "<div class=\"cartao\" id=\"resumo-palmar\"><h2>Palmar / Palmas do Arvoredo — números do preset</h2>" +
      "<p>Estaca hélice contínua, Ø 50 cm, L = 12 m, fck = 30 MPa, 5 Ø 12,5 mm, FSg = 2,0, CAA I/II. Cenário da prancha: ponta desprezada, porque a prancha não declara resistência de ponta. O cenário com Rp ≤ Rl está na tabela, à parte.</p>" +
      "<table><thead><tr><th>Furo</th><th>Aoki Qp</th><th>Aoki Qs</th><th>Aoki Qadm sem ponta</th><th>Aoki Qadm Rp≤Rl</th><th>Aoki tração</th><th>Déc. Qp</th><th>Déc. Qs</th><th>Déc. Qadm sem ponta</th><th>Déc. Qadm Rp≤Rl</th><th>Déc. tração</th></tr></thead><tbody>" +
      corpo + "</tbody></table>" +
      "<p>Estrutural, igual para os dois furos: Nadm compressão = " + kn(est.NadmComp) + "; Nadm tração do aço = " + kn(est.NadmTracao) +
      "; Rd tração = " + kn(est.RdTracao) + "; As = " + fmt(est.As * 1e4, 2) + " cm²; mínimo da Tabela 4 = " + fmt(est.AsMin * 1e4, 2) + " cm².</p>" +
      "<p>Arranque da nota 5: 400 kN por estaca. A tração estrutural admissível é " + fmt(est.NadmTracao, 1) + " kN e a resistente de cálculo é " + fmt(est.RdTracao, 1) + " kN. As duas ficam abaixo de 400 kN.</p>" +
      "<p>Os 16 blocos usam a mesma estaca. A capacidade por estaca não muda de um bloco para outro enquanto a sondagem não estiver locada em cada um. Oito blocos BL-02 têm 2 estacas a 1,25 m; oito blocos BL-03 têm 3 estacas em triângulo de lado 1,25 m. Capacidade centrada, com a ponta desprezada e o menor Qadm (Aoki, SP-01): 2 × 289,1 = 578 kN no BL-02 e 3 × 289,1 = 867 kN no BL-03. Isso é capacidade, não carga de projeto — a prancha não traz N.</p>" +
      "<p>Espaçamento: menor eixo a eixo = " + fmt(esp.menor.dist, 3) + " m = " + fmt(esp.menor.dist / state.D, 2) + " Ø. Pares abaixo de 5 Ø dentro do mesmo bloco: " + internos + ". Pares abaixo de 5 Ø entre blocos: " + entre + ". Estacas: " + esp.n + ".</p>" +
      "<h3>Premissas que mudam a conclusão</h3><ul class=\"lista\">" +
      state.notas.map((n) => "<li>" + esc(n) + "</li>").join("") +
      "<li>NSPT = coluna 2º+3º. Trocar para a coluna 1º+2º mudaria Qs e Qp.</li>" +
      "<li>Se os 400 kN forem característicos, a comparação é com Nadm. Se forem de cálculo, a comparação é com Rd. Nos dois casos o aço de 5 Ø 12,5 mm não fecha.</li>" +
      "<li>O atrito de tração foi tomado igual ao de compressão. A norma diz que podem diferir e não dá o redutor. Se o atrito de tração for menor, a folga geotécnica piora; o aço continua insuficiente.</li>" +
      "</ul>" +
      "<p class=\"fonte\">Relatório completo: verificação do projeto, fora deste arquivo, no documento de entrega. Cálculo de apoio. Não substitui o engenheiro responsável nem a ART.</p></div>";
  }

  function calcularComSond(sond, modo) {
    return E.calcularEstaca({
      tipo: state.tipo, D: state.D, L: state.L, dBase: state.D, fck: state.fck, caa: state.caa,
      fs: state.fs, pontaModo: modo, barras: state.barras,
      estratos: sond.estratos, amostras: sond.amostras, naProf: sond.naProf_m,
    });
  }

  function ativarAba(id) {
    document.querySelectorAll("nav.abas button").forEach((b) => b.classList.toggle("ativa", b.dataset.aba === id));
    document.querySelectorAll("main .painel").forEach((p) => p.classList.toggle("ativo", p.id === "aba-" + id));
  }

  function aplicarCampo(el) {
    const k = el.dataset.k;
    if (!k) return;
    const s = sondagem();
    const b = state.blocos[state.blocoAtivo];
    if (k === "sondagemAtiva") { state.sondagemAtiva = Number(el.value); renderSondagem(); return; }
    if (k === "tipo") { state.tipo = el.value; renderEstaca(); return; }
    if (k === "D") state.D = num(el.value);
    else if (k === "L") state.L = num(el.value);
    else if (k === "dBase") state.dBase = num(el.value);
    else if (k === "fck") state.fck = num(el.value);
    else if (k === "caa") state.caa = el.value;
    else if (k === "fs") state.fs = num(el.value);
    else if (k === "pontaModo") state.pontaModo = el.value;
    else if (k === "nEst") state.nEstruturalInformado = num(el.value);
    else if (k === "sond.id") s.id = el.value;
    else if (k === "sond.titulo") s.titulo = el.value;
    else if (k === "sond.na") s.naProf_m = num(el.value);
    else if (k.indexOf("am.") === 0) {
      const p = k.split(".");
      s.amostras[Number(p[1])][p[2] === "depth" ? "depth" : "n"] = num(el.value);
    } else if (k.indexOf("es.") === 0) {
      const p = k.split(".");
      const campo = p[2] === "solo" || p[2] === "nota" ? p[2] : p[2];
      s.estratos[Number(p[1])][campo] = campo === "solo" || campo === "nota" ? el.value : num(el.value);
    } else if (k.indexOf("bar.") === 0) {
      const p = k.split(".");
      state.barras[Number(p[1])][p[2] === "q" ? "quantidade" : "diametro_mm"] = num(el.value);
    } else if (k === "bl.nome") b.nome = el.value;
    else if (k === "bl.X") b.X = num(el.value);
    else if (k === "bl.Y") b.Y = num(el.value);
    else if (k === "bl.N") b.N = num(el.value);
    else if (k === "bl.Mx") b.Mx = num(el.value);
    else if (k === "bl.My") b.My = num(el.value);
    else if (k === "bl.ex") b.ex = num(el.value);
    else if (k === "bl.ey") b.ey = num(el.value);
    else if (k === "bl.Hx") b.Hx = num(el.value);
    else if (k === "bl.Hy") b.Hy = num(el.value);
    else if (k === "bl.ax") b.ax = num(el.value);
    else if (k === "bl.ay") b.ay = num(el.value);
    else if (k === "bl.d") b.d = num(el.value);
    else if (k === "bl.excent") b.usarExcentricidade = el.checked;
    else if (k.indexOf("est.") === 0) {
      const p = k.split(".");
      b.estacas[Number(p[1])][p[2]] = num(el.value);
    }
  }

  function onClick(ev) {
    const btn = ev.target.closest("[data-act]");
    const aba = ev.target.closest("nav.abas button");
    if (aba) { ativarAba(aba.dataset.aba); return; }
    if (!btn) return;
    const act = btn.dataset.act;
    const s = sondagem();
    const b = state.blocos[state.blocoAtivo];
    if (act === "add-am") s.amostras.push({ depth: (s.amostras.length ? s.amostras[s.amostras.length - 1].depth + 1 : 1), n: 5 });
    else if (act === "del-am") s.amostras.splice(Number(btn.dataset.i), 1);
    else if (act === "add-es") s.estratos.push({ z0: 0, z1: 1, solo: "areia", nota: "" });
    else if (act === "del-es") s.estratos.splice(Number(btn.dataset.i), 1);
    else if (act === "add-sond") {
      state.sondagens.push({ id: "SP" + (state.sondagens.length + 1), titulo: "Nova sondagem", naProf_m: 0, amostras: [{ depth: 1, n: 5 }], estratos: [{ z0: 0, z1: 2, solo: "areia", nota: "" }] });
      state.sondagemAtiva = state.sondagens.length - 1;
    } else if (act === "add-bar") state.barras.push({ quantidade: 1, diametro_mm: 12.5 });
    else if (act === "del-bar") state.barras.splice(Number(btn.dataset.i), 1);
    else if (act === "sel-bloco") state.blocoAtivo = Number(btn.dataset.i);
    else if (act === "add-bloco") {
      state.blocos.push({ id: "B" + (state.blocos.length + 1), nome: "Bloco " + (state.blocos.length + 1), X: 0, Y: 0, estacas: E.arranjo(1, 1), N: 0, Mx: 0, My: 0, ex: 0, ey: 0, Hx: 0, Hy: 0, ax: 0.3, ay: 0.3, d: 0.5, usarExcentricidade: false });
      state.blocoAtivo = state.blocos.length - 1;
    } else if (act === "del-bloco") {
      if (state.blocos.length === 1) return;
      state.blocos.splice(state.blocoAtivo, 1);
      state.blocoAtivo = Math.max(0, state.blocoAtivo - 1);
    } else if (act === "add-est") {
      b.estacas.push({ id: "E" + (b.estacas.length + 1), x: 0, y: 0 });
    } else if (act === "del-est") b.estacas.splice(Number(btn.dataset.i), 1);
    else if (act === "layout") {
      const espEl = document.getElementById("esp-arranjo");
      const sp = espEl ? num(espEl.value) : 2.5 * state.D;
      state._espArranjo = sp;
      b.estacas = E.arranjo(Number(btn.dataset.n), sp > 0 ? sp : state.D);
    } else return;
    renderTudo();
  }

  function exportar() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "estacas-projeto.json";
    a.click();
  }

  document.getElementById("abas").addEventListener("click", onClick);
  document.querySelector("main").addEventListener("click", onClick);
  document.querySelector("main").addEventListener("input", (ev) => {
    aplicarCampo(ev.target);
    renderResultados();
    if (state.palmar) renderVerif();
  });
  document.querySelector("main").addEventListener("change", (ev) => {
    if (ev.target.type === "checkbox" || ev.target.tagName === "SELECT") {
      aplicarCampo(ev.target);
      renderResultados();
      if (state.palmar) renderVerif();
    }
  });
  document.getElementById("btn-palmar").addEventListener("click", carregarPalmar);
  document.getElementById("btn-novo").addEventListener("click", () => { state = vazio(); renderTudo(); });
  document.getElementById("btn-exportar").addEventListener("click", exportar);
  document.getElementById("btn-importar").addEventListener("click", () => document.getElementById("arquivo").click());
  document.getElementById("arquivo").addEventListener("change", () => {
    const f = document.getElementById("arquivo").files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => { state = JSON.parse(rd.result); renderTudo(); };
    rd.readAsText(f);
  });
  document.getElementById("btn-imprimir").addEventListener("click", () => window.print());

  state = vazio();
  renderTudo();
  if (/[?&]preset=palmar/.test(location.search)) carregarPalmar();
})();
