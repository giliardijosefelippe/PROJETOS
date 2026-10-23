import type { PunchingResult, ReportLevel } from "../calc/types";

interface ReportViewProps {
  result: PunchingResult;
  level: ReportLevel;
}

export function ReportView({ result, level }: ReportViewProps) {
  if (!result.ok) {
    return (
      <article className="report">
        <h1>Memorial de cálculo</h1>
        <p className="status fail">{result.error}</p>
      </article>
    );
  }

  const completo = level === "completo";
  return (
    <article className="report">
      <header className="report-head">
        <div>
          <h1>Memorial de cálculo — punção</h1>
          <p className="report-sub">Punção em lajes — NBR 6118</p>
        </div>
        <p className={result.overallPass ? "status pass" : "status fail"}>
          {result.overallPass ? "Atende" : "Não atende"}
        </p>
      </header>

      {result.warnings.length > 0 && (
        <ul className="warn-list">
          {result.warnings.map((w) => (
            <li key={w.text} className={w.severity}>
              {w.text}
            </li>
          ))}
        </ul>
      )}

      {result.blocks.map((block) => (
        <section key={block.heading} className="report-section">
          <h2>{block.heading}</h2>
          {block.lines.map((line, i) => {
            const paragraph = !line.value && !line.formula && !line.substitution;
            if (paragraph) return <p key={i}>{line.label}</p>;
            return (
              <div key={i} className="report-line">
                <div className="report-line-main">
                  <span>{line.label}</span>
                  {line.value && <strong>{line.value}</strong>}
                </div>
                {completo && line.formula && <p className="formula">{line.formula}</p>}
                {completo && line.substitution && <p className="substitution">{line.substitution}</p>}
              </div>
            );
          })}
        </section>
      ))}
    </article>
  );
}
