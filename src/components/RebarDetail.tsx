import { rebarDetail } from "../calc/detalhe";
import type { PunchingResult, PunchingType } from "../calc/types";

interface RebarDetailProps {
  result: PunchingResult;
  active: PunchingType;
}

export function RebarDetail({ result, active }: RebarDetailProps) {
  const input = result.input;
  const detail = rebarDetail({
    hCm: input.h,
    coverCm: input.cobrimento,
    phiMm: input.bitolaW,
    stMaxCm: result.ok ? result.srMax : 0,
  });

  return (
    <div className="rebar-detail">
      <p className="detail-lead">
        O estribo é aberto, com dois ramos verticais e ganchos a 135° para dentro. O stud é um conector com cabeça nas duas pontas.
        As cotas saem da laje desta verificação.
      </p>
      <div className="detail-grid">
        <figure className={active === "estribos" ? "detail-card on" : "detail-card"}>
          <figcaption>
            Estribo vertical
            {active === "estribos" ? " · em uso" : ""}
          </figcaption>
          {detail.heightOk ? <StirrupFigure detail={detail} /> : <p>O cobrimento não deixa altura para o estribo.</p>}
          <ul>
            <li>Altura {fmt(detail.heightCm, 2)} cm = h − 2c. O cobrimento das duas faces é o valor informado.</li>
            <li>Gancho {fmt(detail.hookCm, 2)} cm. Item 9.4.6.1: ponta reta 5φ, no mínimo 5 cm, a 135° para o interior.</li>
            <li>Largura {fmt(detail.widthCm, 2)} cm entre os ramos. A norma não fixa essa medida; ela cabe em 0,75d.</li>
            <li>
              φ {fmt(detail.phiMm, 1)} mm {detail.phiOk ? "dentro de" : "acima de"} h/20 = {fmt(detail.phiLimitMm, 1)} mm
              (item 20.4). Pino de dobra ≥ {fmt(detail.bendMm, 1)} mm, Tabela 9.2, CA-50.
            </li>
            <li>Os cantos do estribo encostam na armadura de flexão (item 20.4).</li>
          </ul>
        </figure>
        <figure className={active === "studs" ? "detail-card on" : "detail-card"}>
          <figcaption>
            Stud
            {active === "studs" ? " · em uso" : ""}
          </figcaption>
          {detail.heightOk ? <StudFigure detail={detail} /> : <p>O cobrimento não deixa comprimento para o stud.</p>}
          <ul>
            <li>Fuste {fmt(detail.studLengthCm, 2)} cm entre as cabeças, na altura livre h − 2c.</li>
            <li>φ {fmt(detail.phiMm, 1)} mm. As cabeças são alargadas; a norma não fixa o diâmetro delas.</li>
            <li>Cada extremidade fica ancorada fora do plano da armadura de flexão (item 19.5.3.3).</li>
            <li>De preferência, três ou mais linhas de conectores, dispostas em raios a partir do pilar.</li>
          </ul>
        </figure>
      </div>
    </div>
  );
}

function StirrupFigure({ detail }: { detail: ReturnType<typeof rebarDetail> }) {
  const a = detail.heightCm;
  const b = detail.widthCm;
  const g = detail.hookCm;
  const k = g * Math.SQRT1_2;
  const padX = 36;
  const padY = 28;
  const scale = 5.2;
  const x0 = padX + k * scale;
  const yTop = padY;
  const yBot = padY + a * scale;
  const x1 = x0 + b * scale;
  const hook = k * scale;
  const w = x1 + 96;
  const h = yBot + 40;
  const d = [
    `M ${x0 + hook} ${yBot - hook}`,
    `L ${x0} ${yBot}`,
    `L ${x0} ${yTop}`,
    `L ${x1} ${yTop}`,
    `L ${x1} ${yBot}`,
    `L ${x1 - hook} ${yBot - hook}`,
  ].join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="detail-svg" role="img" aria-label="Corte do estribo vertical">
      <path d={d} className="bar" />
      <DimH x1={x0} x2={x1} y={yTop - 14} label={`${fmt(b, 1)} cm`} />
      <DimV x={x1 + 16} y1={yTop} y2={yBot} label={`${fmt(a, 1)} cm`} />
      <text x={x0 + hook + 4} y={yBot - hook - 4} className="dim-note">
        gancho {fmt(g, 1)} cm
      </text>
      <text x={(x0 + x1) / 2} y={h - 8} textAnchor="middle" className="dim-note">
        corte · φ {fmt(detail.phiMm, 1)} mm
      </text>
    </svg>
  );
}

function StudFigure({ detail }: { detail: ReturnType<typeof rebarDetail> }) {
  const L = detail.studLengthCm;
  const scale = 5.2;
  const pad = 36;
  const x = 78;
  const y1 = pad;
  const y2 = pad + L * scale;
  const head = 16;
  const w = 210;
  const h = y2 + pad;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="detail-svg" role="img" aria-label="Corte do stud">
      <line x1={x} y1={y1} x2={x} y2={y2} className="bar" />
      <rect x={x - head} y={y1 - 7} width={head * 2} height={7} rx="2" className="head" />
      <rect x={x - head} y={y2} width={head * 2} height={7} rx="2" className="head" />
      <DimV x={x + 28} y1={y1} y2={y2} label={`${fmt(L, 1)} cm`} />
      <text x={x} y={h - 10} textAnchor="middle" className="dim-note">
        φ {fmt(detail.phiMm, 1)} mm · cabeça alargada
      </text>
    </svg>
  );
}

function DimH({ x1, x2, y, label }: { x1: number; x2: number; y: number; label: string }) {
  const mid = (x1 + x2) / 2;
  return (
    <g className="cota">
      <line x1={x1} y1={y} x2={x2} y2={y} />
      <line x1={x1} y1={y - 4} x2={x1} y2={y + 4} />
      <line x1={x2} y1={y - 4} x2={x2} y2={y + 4} />
      <text x={mid} y={y - 6} textAnchor="middle">
        {label}
      </text>
    </g>
  );
}

function DimV({ x, y1, y2, label }: { x: number; y1: number; y2: number; label: string }) {
  const mid = (y1 + y2) / 2;
  return (
    <g className="cota">
      <line x1={x} y1={y1} x2={x} y2={y2} />
      <line x1={x - 4} y1={y1} x2={x + 4} y2={y1} />
      <line x1={x - 4} y1={y2} x2={x + 4} y2={y2} />
      <text x={x + 8} y={mid + 4}>
        {label}
      </text>
    </g>
  );
}

function fmt(value: number, digits: number): string {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
