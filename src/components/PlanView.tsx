import type { DrawModel, Pt } from "../calc/types";
import { fmt } from "../calc/format";

interface PlanViewProps {
  draw: DrawModel;
  positionLabel: string;
}

export function PlanView({ draw, positionLabel }: PlanViewProps) {
  const padL = 108;
  const padR = 36;
  const padT = 36;
  const padB = 78;
  const { slab, column } = draw;
  const wCm = Math.max(slab.x1 - slab.x0, 1);
  const hCm = Math.max(slab.z1 - slab.z0, 1);
  const innerW = 760;
  const innerH = 560;
  const scale = Math.min(innerW / wCm, innerH / hCm);
  const svgW = padL + wCm * scale + padR;
  const svgH = padT + hCm * scale + padB;
  const X = (x: number) => padL + (x - slab.x0) * scale;
  const Y = (z: number) => padT + (slab.z1 - z) * scale;

  const toPath = (pts: Pt[], closed: boolean) => {
    if (pts.length === 0) return "";
    const d = pts
      .map((p, i) => `${i === 0 ? "M" : "L"}${X(p.x).toFixed(1)} ${Y(p.z).toFixed(1)}`)
      .join(" ");
    return closed ? `${d} Z` : d;
  };

  const cx = (column.x0 + column.x1) / 2;
  const cz = (column.z0 + column.z1) / 2;
  const topDimY = Y(column.z1) - 18;
  const sideDimX = X(column.x1) + 22;
  const twoDY = Y(column.z1 + draw.twoD);

  return (
    <div className="plan-wrap">
      <svg viewBox={`0 0 ${svgW} ${svgH}`} role="img" aria-label="Vista em planta do pilar e do perímetro crítico">
        <defs>
          <pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="7" stroke="#4b5563" strokeWidth="1.4" />
          </pattern>
          <marker id="arrow-x" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
            <path d="M0 0 L7 3.5 L0 7 Z" fill="#d11a2a" />
          </marker>
          <marker id="arrow-z" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
            <path d="M0 0 L7 3.5 L0 7 Z" fill="#1d4ed8" />
          </marker>
        </defs>

        <rect x={X(slab.x0)} y={Y(slab.z1)} width={wCm * scale} height={hCm * scale} className="slab" />

        {draw.freeEdges.includes("minZ") && (
          <g>
            <line x1={X(slab.x0)} y1={Y(slab.z0)} x2={X(slab.x1)} y2={Y(slab.z0)} className="free-edge" />
            <text x={(X(slab.x0) + X(slab.x1)) / 2} y={Y(slab.z0) + 14} textAnchor="middle" className="edge-label">
              borda livre
            </text>
          </g>
        )}
        {draw.freeEdges.includes("minX") && (
          <g>
            <line x1={X(slab.x0)} y1={Y(slab.z0)} x2={X(slab.x0)} y2={Y(slab.z1)} className="free-edge" />
            <text
              x={X(slab.x0) - 8}
              y={(Y(slab.z0) + Y(slab.z1)) / 2}
              textAnchor="middle"
              className="edge-label"
              transform={`rotate(-90 ${X(slab.x0) - 8} ${(Y(slab.z0) + Y(slab.z1)) / 2})`}
            >
              borda livre
            </text>
          </g>
        )}

        <line x1={X(slab.x0)} y1={Y(cz)} x2={X(slab.x1)} y2={Y(cz)} className="axis-x" />
        <line x1={X(cx)} y1={Y(slab.z0)} x2={X(cx)} y2={Y(slab.z1)} className="axis-z" />

        {draw.outer && <path d={toPath(draw.outer, draw.outerClosed)} className="perimeter-outer" />}
        {draw.reinforcement.map((pts, i) => (
          <path key={i} d={toPath(pts, false)} className="rebar" />
        ))}
        <path d={toPath(draw.perimeter, draw.perimeterClosed)} className="perimeter" />

        <rect
          x={X(column.x0)}
          y={Y(column.z1)}
          width={(column.x1 - column.x0) * scale}
          height={(column.z1 - column.z0) * scale}
          className="column"
        />
        <rect
          x={X(column.x0)}
          y={Y(column.z1)}
          width={(column.x1 - column.x0) * scale}
          height={(column.z1 - column.z0) * scale}
          fill="url(#hatch)"
        />

        <DimH x1={X(column.x0)} x2={X(column.x1)} y={topDimY} label={`${fmt(draw.cx, 1)} cm`} />
        <DimV x={sideDimX} y1={Y(column.z0)} y2={Y(column.z1)} label={`${fmt(draw.cz, 1)} cm`} />
        <DimV
          x={draw.freeEdges.includes("minX") ? X(column.x0) + (X(column.x1) - X(column.x0)) * 0.22 : X(column.x0) - 16}
          y1={Y(column.z1)}
          y2={twoDY}
          label={`2d = ${fmt(draw.twoD, 1)} cm`}
          side={draw.freeEdges.includes("minX") ? "right" : "left"}
        />

        <g className="axis-symbol">
          <line x1={28} y1={svgH - 28} x2={62} y2={svgH - 28} stroke="#d11a2a" strokeWidth="1.6" markerEnd="url(#arrow-x)" />
          <line x1={28} y1={svgH - 28} x2={28} y2={svgH - 62} stroke="#1d4ed8" strokeWidth="1.6" markerEnd="url(#arrow-z)" />
          <text x={66} y={svgH - 24} className="axis-label-x">
            x
          </text>
          <text x={22} y={svgH - 66} className="axis-label-z">
            z
          </text>
        </g>

        <text x={svgW / 2} y={svgH - 34} textAnchor="middle" className="caption">
          VISTA EM PLANTA
        </text>
        <text x={svgW / 2} y={svgH - 16} textAnchor="middle" className="caption-sub">
          {fmt(draw.h, 1)} cm DE ESPESSURA · {positionLabel}
        </text>

        <g className="legend">
          <line x1={svgW - 168} y1={18} x2={svgW - 138} y2={18} className="perimeter" />
          <text x={svgW - 132} y={22}>
            perímetro C′
          </text>
          {draw.outer && (
            <>
              <line x1={svgW - 168} y1={34} x2={svgW - 138} y2={34} className="perimeter-outer" />
              <text x={svgW - 132} y={38}>
                perímetro C″
              </text>
            </>
          )}
        </g>
      </svg>
    </div>
  );
}

function DimH({ x1, x2, y, label }: { x1: number; x2: number; y: number; label: string }) {
  const mid = (x1 + x2) / 2;
  return (
    <g className="dim">
      <line x1={x1} y1={y} x2={x2} y2={y} />
      <line x1={x1} y1={y - 4} x2={x1} y2={y + 4} />
      <line x1={x2} y1={y - 4} x2={x2} y2={y + 4} />
      <rect x={mid - 28} y={y - 16} width="56" height="14" className="dim-bg" />
      <text x={mid} y={y - 5} textAnchor="middle">
        {label}
      </text>
    </g>
  );
}

function DimV({
  x,
  y1,
  y2,
  label,
  side = "right",
}: {
  x: number;
  y1: number;
  y2: number;
  label: string;
  side?: "left" | "right";
}) {
  const mid = (y1 + y2) / 2;
  const top = Math.min(y1, y2);
  const bot = Math.max(y1, y2);
  const labelW = Math.max(78, label.length * 6.4);
  const rectX = side === "right" ? x + 4 : x - 6 - labelW;
  const textX = side === "right" ? x + 8 : x - 10;
  return (
    <g className="dim">
      <line x1={x} y1={top} x2={x} y2={bot} />
      <line x1={x - 4} y1={y1} x2={x + 4} y2={y1} />
      <line x1={x - 4} y1={y2} x2={x + 4} y2={y2} />
      <rect x={rectX} y={mid - 7} width={labelW} height="14" className="dim-bg" />
      <text x={textX} y={mid + 4} textAnchor={side === "right" ? "start" : "end"}>
        {label}
      </text>
    </g>
  );
}
