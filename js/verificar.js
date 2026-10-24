/* Confere o preset Palmar contra o motor. Uso: node js/verificar.js */
const E = require("./engine.js");
const P = require("./preset-palmar.js");

function linha(sond, modo) {
  const r = E.calcularEstaca({
    tipo: "helice",
    D: 0.5,
    L: 12,
    dBase: 0.5,
    fck: 30,
    caa: "II",
    fs: 2,
    pontaModo: modo,
    barras: [{ quantidade: 5, diametro_mm: 12.5 }],
    estratos: sond.estratos,
    amostras: sond.amostras,
    naProf: sond.naProf_m,
  });
  return r;
}

function aprox(nome, valor, esperado, tol) {
  const ok = Math.abs(valor - esperado) <= tol;
  if (!ok) {
    console.error("FALHOU", nome, valor, "esperado", esperado);
    process.exitCode = 1;
  } else {
    console.log("ok", nome, valor.toFixed(1));
  }
}

["SP01", "SP02"].forEach((id) => {
  const sond = P[id];
  const sem = linha(sond, "desprezada");
  const lim = linha(sond, "limitada");
  console.log("\n==", id, "==");
  console.log("Aoki Qp", sem.av.Qp.toFixed(1), "Qs", sem.av.Qs.toFixed(1), "Np", sem.av.np, sem.av.soloPonta);
  console.log("Dec  Qp", sem.dq.Qp.toFixed(1), "Qs", sem.dq.Qs.toFixed(1), "Np", sem.dq.Np.toFixed(2));
  console.log("sem ponta Aoki", sem.aokiAdm.QadmGeo.toFixed(1), "Dec", sem.decourtAdm.QadmGeo.toFixed(1));
  console.log("com limite Aoki", lim.aokiAdm.QadmGeo.toFixed(1), "Dec", lim.decourtAdm.QadmGeo.toFixed(1));
  console.log("tracao geo Aoki", sem.aokiAdm.QadmTracaoGeo.toFixed(1), "est", sem.aokiAdm.QadmTracaoEst.toFixed(1));
  console.log("peso", sem.peso.kN.toFixed(1), "Nadm comp", sem.est.NadmComp.toFixed(1));
});

const sp1 = linha(P.SP01, "desprezada");
const sp2 = linha(P.SP02, "desprezada");
aprox("SP01 Aoki Qp", sp1.av.Qp, 1178.1, 1.5);
aprox("SP01 Aoki Qs", sp1.av.Qs, 578.1, 1.5);
aprox("SP02 Aoki Qp", sp2.av.Qp, 194.4, 1.5);
aprox("SP02 Aoki Qs", sp2.av.Qs, 670.6, 1.5);
aprox("SP01 Dec Qp", sp1.dq.Qp, 353.4, 1.5);
aprox("SP01 Dec Qs", sp1.dq.Qs, 733.0, 2);
aprox("SP02 Dec Qp", sp2.dq.Qp, 51.8, 1);
aprox("SP02 Dec Qs", sp2.dq.Qs, 926.8, 2);
aprox("Nadm estrutural", sp1.est.NadmComp, 1515.1, 2);
aprox("Nadm tracao aco", sp1.est.NadmTracao, 190.6, 1);

const esp = E.paresEspacamento(P.projeto.blocos, 0.5, 5);
console.log("\npares < 5D", esp.pares.length, "menor", esp.menor && esp.menor.dist.toFixed(3), esp.menor && esp.menor.a.bloco, esp.menor.b.bloco);
console.log("estacas", esp.n);
if (esp.n !== 40) {
  console.error("quantidade de estacas", esp.n);
  process.exitCode = 1;
}
const internos = esp.pares.filter((p) => p.a.bloco === p.b.bloco);
console.log("pares internos ao bloco abaixo de 5D", internos.length);
if (!internos.length) {
  console.error("esperava espaçamento interno de 1,25 m");
  process.exitCode = 1;
}
