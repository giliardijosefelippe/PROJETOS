import { useMemo, useState } from "react";
import { calculate, defaultInput } from "./calc/puncao";
import { fmt } from "./calc/format";
import type { PunchingInput } from "./calc/types";
import { Inputs } from "./components/Inputs";
import { PlanView } from "./components/PlanView";
import { ReportView } from "./components/ReportView";

type Tab = "grafico" | "relatorio";

export function App() {
  const [input, setInput] = useState<PunchingInput>(defaultInput);
  const [tab, setTab] = useState<Tab>("grafico");
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
        <Inputs input={input} result={result} set={set} />
        <main className="stage">
          <div className="tabs no-print">
            <button type="button" className={tab === "grafico" ? "tab on" : "tab"} onClick={() => setTab("grafico")}>
              Gráfico
            </button>
            <button type="button" className={tab === "relatorio" ? "tab on" : "tab"} onClick={() => setTab("relatorio")}>
              Relatório
            </button>
            <button type="button" className="print-btn" onClick={() => window.print()}>
              Imprimir / salvar PDF
            </button>
          </div>
          {result.ok && result.reinforcementRequired && tab === "grafico" && (
            <p className="banner fail no-print">
              Armadura de punção é necessária.
              {result.bars
                ? ` Sugestão desenhada: ${result.bars.lines * result.bars.perLine} ${result.bars.type === "studs" ? "studs" : "estribos"} (${result.bars.reta} na parte reta, ${result.bars.diagonal} na diagonal).`
                : ""}
            </p>
          )}
          {result.ok && result.overallPass && tab === "grafico" && (
            <p className="banner pass no-print">Compressão diagonal e punção atendidas.</p>
          )}
          <div className={tab === "grafico" ? "pane pane-graphic" : "pane pane-graphic pane-hidden"}>
            {result.draw ? (
              <PlanView draw={result.draw} positionLabel={positionLabel} />
            ) : (
              <p className="error-block">{result.error}</p>
            )}
          </div>
          <div className={tab === "relatorio" ? "pane report-pane" : "pane report-pane pane-hidden"}>
            <ReportView result={result} level={input.reportLevel} />
          </div>
        </main>
      </div>
    </div>
  );
}
