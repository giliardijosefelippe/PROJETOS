import { useMemo, useState } from "react";
import { calculate, defaultInput } from "./calc/puncao";
import { fmt } from "./calc/format";
import type { PunchingInput } from "./calc/types";
import { Inputs } from "./components/Inputs";
import { PlanView } from "./components/PlanView";
import { Punch3D } from "./components/Punch3D";
import { RebarDetail } from "./components/RebarDetail";
import { ReportView } from "./components/ReportView";

type Tab = "planta" | "3d" | "armadura" | "memorial";

export function App() {
  const [input, setInput] = useState<PunchingInput>(defaultInput);
  const [tab, setTab] = useState<Tab>("planta");
  const result = useMemo(() => calculate(input), [input]);

  const set = <K extends keyof PunchingInput>(key: K, value: PunchingInput[K]) => {
    setInput((prev) => ({ ...prev, [key]: value }));
  };

  const positionLabel =
    input.position === "interno" ? "PILAR INTERNO" : input.position === "borda" ? "PILAR DE BORDA" : "PILAR DE CANTO";

  return (
    <div className="app">
      <header className="topbar no-print">
        <h1>Punção em lajes — NBR 6118</h1>
        {result.ok ? (
          <div className="chips" aria-live="polite">
            <span>τSd {fmt(result.tauSdCp, 3)} MPa</span>
            <span>τRd1 {fmt(result.tauRd1, 3)} MPa</span>
            <span>τRd2 {fmt(result.tauRd2, 3)} MPa</span>
            <span className={result.passesCompression ? "chip pass" : "chip fail"}>
              C {result.passesCompression ? "atende" : "não atende"}
            </span>
            <span className={result.passesPunching ? "chip pass" : "chip fail"}>
              C′ {result.passesPunching ? "atende" : "não atende"}
            </span>
          </div>
        ) : (
          <span className="chip fail">Dados inválidos</span>
        )}
      </header>
      <div className="workspace">
        <main className="stage">
          <div className="tabs no-print">
            {(
              [
                ["planta", "Planta"],
                ["3d", "Modelo 3D"],
                ["armadura", "Armadura"],
                ["memorial", "Memorial"],
              ] as const
            ).map(([id, label]) => (
              <button key={id} type="button" className={tab === id ? "tab on" : "tab"} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
            <button type="button" className="print-btn" onClick={() => window.print()}>
              Imprimir
            </button>
          </div>
          {result.ok && result.reinforcementRequired && tab !== "memorial" && (
            <p className="banner fail no-print">
              Armadura de punção é necessária.
              {result.bars
                ? ` ${result.bars.lines * result.bars.perLine} ${result.bars.type === "studs" ? "studs" : "estribos"} (${result.bars.reta} na reta, ${result.bars.diagonal} na diagonal).`
                : ""}
            </p>
          )}
          {result.ok && result.overallPass && tab !== "memorial" && (
            <p className="banner pass no-print">Compressão diagonal e punção atendidas.</p>
          )}
          <div className={tab === "planta" ? "pane pane-graphic" : "pane pane-graphic pane-hidden"}>
            {result.draw ? (
              <PlanView draw={result.draw} positionLabel={positionLabel} />
            ) : (
              <p className="error-block">{result.error}</p>
            )}
          </div>
          <div className={tab === "3d" ? "pane pane-3d" : "pane pane-3d pane-hidden"}>
            {tab === "3d" && result.draw && (
              <Punch3D
                draw={result.draw}
                h={input.h}
                cover={input.cobrimento}
                phiMm={input.bitolaW}
                type={input.punchingType}
              />
            )}
          </div>
          <div className={tab === "armadura" ? "pane pane-armadura" : "pane pane-armadura pane-hidden"}>
            {result.ok ? (
              <RebarDetail result={result} active={input.punchingType} />
            ) : (
              <p className="error-block">{result.error}</p>
            )}
          </div>
          <div className={tab === "memorial" ? "pane report-pane" : "pane report-pane pane-hidden"}>
            <ReportView result={result} level={input.reportLevel} />
          </div>
        </main>
        <Inputs input={input} result={result} set={set} />
      </div>
    </div>
  );
}
