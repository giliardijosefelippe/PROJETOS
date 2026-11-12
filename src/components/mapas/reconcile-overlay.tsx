/** Side-by-side / overlay schematic of source vs target region rings (SVG). */
export function ReconcileOverlay({
  sourceRings,
  targetRings,
}: {
  sourceRings: Array<{
    id: string;
    name: string;
    ring: Array<[number, number]>;
  }>;
  targetRings: Array<{
    id: string;
    name: string;
    ring: Array<[number, number]>;
  }>;
}) {
  const all = [
    ...sourceRings.flatMap((r) => r.ring),
    ...targetRings.flatMap((r) => r.ring),
  ];
  if (!all.length) {
    return (
      <p className="text-sm text-ink-muted">
        Sem geometria para overlay (regiões vazias).
      </p>
    );
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of all) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const pad = 0.08 * Math.max(maxX - minX, maxY - minY, 1);
  minX -= pad;
  minY -= pad;
  maxX += pad;
  maxY += pad;
  const W = 640;
  const H = 280;
  const sx = W / Math.max(maxX - minX, 1e-9);
  const sy = H / Math.max(maxY - minY, 1e-9);
  const s = Math.min(sx, sy);
  const ox = (W - (maxX - minX) * s) / 2;
  const oy = (H - (maxY - minY) * s) / 2;
  const proj = (x: number, y: number) => [
    ox + (x - minX) * s,
    oy + (maxY - y) * s,
  ];
  const toPts = (ring: Array<[number, number]>) =>
    ring
      .map(([x, y]) => {
        const [px, py] = proj(x, y);
        return `${px},${py}`;
      })
      .join(" ");

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3 text-xs text-ink-muted">
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-[#2563eb]" />
          Origem
        </span>
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-[#E00024]" />
          Alvo
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full rounded-md border border-border bg-[#1a1a1a]"
        role="img"
        aria-label="Overlay de reconciliação origem vs alvo"
      >
        {sourceRings.map((r) => (
          <polygon
            key={`s-${r.id}`}
            points={toPts(r.ring)}
            fill="#2563eb"
            fillOpacity={0.2}
            stroke="#60a5fa"
            strokeWidth={2}
          >
            <title>{r.name} (origem)</title>
          </polygon>
        ))}
        {targetRings.map((r) => (
          <polygon
            key={`t-${r.id}`}
            points={toPts(r.ring)}
            fill="#E00024"
            fillOpacity={0.2}
            stroke="#f87171"
            strokeWidth={2}
            strokeDasharray="5 3"
          >
            <title>{r.name} (alvo)</title>
          </polygon>
        ))}
      </svg>
    </div>
  );
}
