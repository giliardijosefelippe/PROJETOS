"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  calibrateScaleAction,
  selectPageAction,
} from "@/actions/mapas/drawings";
import { saveRegionAction } from "@/actions/mapas/regions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Point } from "@/lib/mapas/geometry";

type SavedRegion = {
  id: string;
  name: string;
  tool: string;
  color: string | null;
  area_m2: number | null;
  geometry: { type: string; coordinates: number[][][] };
};

type Tool = "pan" | "calibrate" | "rectangle" | "polygon" | "freehand";

export function PlantViewer({
  siteId,
  drawingId,
  pdfUrl,
  metersPerPdfUnit,
  scaleP1,
  scaleP2,
  scaleRealM,
  selectedPage,
  regions,
}: {
  siteId: string;
  drawingId: string;
  pdfUrl: string;
  metersPerPdfUnit: number | null;
  scaleP1: number[] | null;
  scaleP2: number[] | null;
  scaleRealM: number | null;
  selectedPage: number;
  regions: SavedRegion[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [pageCount, setPageCount] = useState(1);
  const [page, setPage] = useState(selectedPage);
  const [tool, setTool] = useState<Tool>("pan");
  const [points, setPoints] = useState<Point[]>([]);
  const [draftName, setDraftName] = useState("Região 1");
  const [realM, setRealM] = useState(String(scaleRealM ?? 5));
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Point>([0, 0]);
  const [pdfSize, setPdfSize] = useState<{ w: number; h: number }>({
    w: 800,
    h: 600,
  });
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(
    null,
  );
  const freehandRef = useRef(false);

  const mpu = metersPerPdfUnit;

  const worldToPdf = useCallback(
    (geom: SavedRegion["geometry"]): Point[] => {
      if (!mpu) return [];
      const ring = geom.coordinates[0] || [];
      return ring.map(([x, y]) => [x / mpu, y / mpu] as Point);
    },
    [mpu],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        // Use CDN worker matching installed version to avoid bundler worker issues
        pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
        const doc = await pdfjs.getDocument({ url: pdfUrl }).promise;
        if (cancelled) return;
        setPageCount(doc.numPages);
        const p = await doc.getPage(Math.min(page, doc.numPages));
        const viewport = p.getViewport({ scale: 1.25 });
        setPdfSize({ w: viewport.width, h: viewport.height });
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await p.render({
          canvasContext: ctx,
          viewport,
          canvas,
        }).promise;
        if (doc.numPages !== pageCount) {
          const fd = new FormData();
          fd.set("drawing_id", drawingId);
          fd.set("site_id", siteId);
          fd.set("page", String(page));
          fd.set("page_count", String(doc.numPages));
          startTransition(() => {
            void selectPageAction(fd);
          });
        }
      } catch (e) {
        setStatus(
          e instanceof Error
            ? `Falha ao renderizar PDF: ${e.message}`
            : "Falha ao renderizar PDF",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfUrl, page]);

  const svgPoints = useMemo(() => {
    return points.map(([x, y]) => `${x},${y}`).join(" ");
  }, [points]);

  function clientToPdf(e: React.MouseEvent): Point {
    const wrap = wrapRef.current;
    if (!wrap) return [0, 0];
    const rect = wrap.getBoundingClientRect();
    const x = (e.clientX - rect.left - offset[0]) / zoom;
    const y = (e.clientY - rect.top - offset[1]) / zoom;
    return [x, y];
  }

  function onPointerDown(e: React.MouseEvent) {
    if (tool === "pan") {
      dragRef.current = {
        x: e.clientX,
        y: e.clientY,
        ox: offset[0],
        oy: offset[1],
      };
      return;
    }
    const p = clientToPdf(e);
    if (tool === "calibrate") {
      setPoints((prev) => (prev.length >= 2 ? [p] : [...prev, p]));
      return;
    }
    if (tool === "rectangle") {
      setPoints((prev) => (prev.length >= 2 ? [p] : [...prev, p]));
      return;
    }
    if (tool === "polygon") {
      setPoints((prev) => [...prev, p]);
      return;
    }
    if (tool === "freehand") {
      freehandRef.current = true;
      setPoints([p]);
    }
  }

  function onPointerMove(e: React.MouseEvent) {
    if (tool === "pan" && dragRef.current) {
      const dx = e.clientX - dragRef.current.x;
      const dy = e.clientY - dragRef.current.y;
      setOffset([dragRef.current.ox + dx, dragRef.current.oy + dy]);
      return;
    }
    if (tool === "freehand" && freehandRef.current) {
      const p = clientToPdf(e);
      setPoints((prev) => [...prev, p]);
    }
  }

  function onPointerUp() {
    dragRef.current = null;
    freehandRef.current = false;
  }

  function submitCalibration() {
    if (points.length < 2) {
      setStatus("Clique dois pontos na planta para calibrar.");
      return;
    }
    const fd = new FormData();
    fd.set("drawing_id", drawingId);
    fd.set("site_id", siteId);
    fd.set("p1x", String(points[0][0]));
    fd.set("p1y", String(points[0][1]));
    fd.set("p2x", String(points[1][0]));
    fd.set("p2y", String(points[1][1]));
    fd.set("real_m", realM);
    startTransition(() => {
      void calibrateScaleAction(fd);
    });
  }

  function submitRegion() {
    if (!mpu) {
      setStatus("Calibre a escala antes de salvar a região.");
      return;
    }
    const fd = new FormData();
    fd.set("site_id", siteId);
    fd.set("drawing_id", drawingId);
    fd.set("name", draftName);
    fd.set("tool", tool === "pan" || tool === "calibrate" ? "polygon" : tool);
    fd.set("points_json", JSON.stringify(points));
    startTransition(() => {
      void saveRegionAction(fd);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["pan", "Mover"],
            ["calibrate", "Calibrar escala"],
            ["rectangle", "Retângulo"],
            ["polygon", "Polígono"],
            ["freehand", "Mão livre"],
          ] as const
        ).map(([id, label]) => (
          <Button
            key={id}
            type="button"
            size="sm"
            variant={tool === id ? "primary" : "secondary"}
            onClick={() => {
              setTool(id);
              setPoints([]);
            }}
          >
            {label}
          </Button>
        ))}
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => setZoom((z) => Math.min(4, z * 1.2))}
        >
          Zoom +
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => setZoom((z) => Math.max(0.3, z / 1.2))}
        >
          Zoom −
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => {
            setZoom(1);
            setOffset([0, 0]);
          }}
        >
          Ajustar
        </Button>
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          Página
          <select
            className="rounded border border-divider bg-surface px-2 py-1"
            value={page}
            onChange={(e) => setPage(Number(e.target.value))}
          >
            {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!mpu && (
        <p className="rounded-md border border-[var(--color-status-warn)] bg-[var(--color-status-warn-bg)] px-3 py-2 text-sm text-[var(--color-status-warn)]">
          Escala não calibrada — medições e volumes ficarão bloqueados até
          informar dois pontos e a distância real.
        </p>
      )}
      {mpu && (
        <p className="text-sm text-ink-muted">
          Escala ativa: {mpu.toExponential(4)} m/unidade PDF
          {scaleP1 && scaleP2
            ? ` · calibração (${scaleP1[0]?.toFixed?.(1)}, ${scaleP1[1]?.toFixed?.(1)}) → (${scaleP2[0]?.toFixed?.(1)}, ${scaleP2[1]?.toFixed?.(1)}) = ${scaleRealM} m`
            : ""}
        </p>
      )}

      <div
        ref={wrapRef}
        className="relative h-[70vh] overflow-hidden rounded-md border border-divider bg-[#2a2a2a]"
        onMouseDown={onPointerDown}
        onMouseMove={onPointerMove}
        onMouseUp={onPointerUp}
        onMouseLeave={onPointerUp}
      >
        <div
          style={{
            transform: `translate(${offset[0]}px, ${offset[1]}px) scale(${zoom})`,
            transformOrigin: "0 0",
            width: pdfSize.w,
            height: pdfSize.h,
            position: "relative",
          }}
        >
          <canvas ref={canvasRef} className="block" />
          <svg
            className="pointer-events-none absolute inset-0"
            width={pdfSize.w}
            height={pdfSize.h}
          >
            {regions.map((r) => {
              const pts = worldToPdf(r.geometry);
              if (pts.length < 2) return null;
              return (
                <polygon
                  key={r.id}
                  points={pts.map(([x, y]) => `${x},${y}`).join(" ")}
                  fill={r.color || "#E00024"}
                  fillOpacity={0.28}
                  stroke={r.color || "#E00024"}
                  strokeWidth={2}
                />
              );
            })}
            {points.length > 0 && tool === "calibrate" && (
              <>
                {points.map(([x, y], i) => (
                  <circle key={i} cx={x} cy={y} r={4} fill="#175cd3" />
                ))}
                {points.length === 2 && (
                  <line
                    x1={points[0][0]}
                    y1={points[0][1]}
                    x2={points[1][0]}
                    y2={points[1][1]}
                    stroke="#175cd3"
                    strokeWidth={2}
                  />
                )}
              </>
            )}
            {tool === "rectangle" && points.length === 2 && (
              <rect
                x={Math.min(points[0][0], points[1][0])}
                y={Math.min(points[0][1], points[1][1])}
                width={Math.abs(points[1][0] - points[0][0])}
                height={Math.abs(points[1][1] - points[0][1])}
                fill="#E00024"
                fillOpacity={0.25}
                stroke="#E00024"
              />
            )}
            {(tool === "polygon" || tool === "freehand") && points.length > 1 && (
              <polyline
                points={svgPoints}
                fill="none"
                stroke="#E00024"
                strokeWidth={2}
              />
            )}
          </svg>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        {tool === "calibrate" && (
          <>
            <label className="text-sm">
              Distância real (m)
              <Input
                value={realM}
                onChange={(e) => setRealM(e.target.value)}
                className="mt-1 w-32"
              />
            </label>
            <Button
              type="button"
              disabled={pending || points.length < 2}
              onClick={submitCalibration}
            >
              Salvar escala
            </Button>
          </>
        )}
        {(tool === "rectangle" ||
          tool === "polygon" ||
          tool === "freehand") && (
          <>
            <label className="text-sm">
              Nome da região
              <Input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                className="mt-1 w-48"
              />
            </label>
            <Button
              type="button"
              disabled={pending || points.length < (tool === "rectangle" ? 2 : 3)}
              onClick={submitRegion}
            >
              Salvar região
            </Button>
            {tool === "polygon" && (
              <p className="text-xs text-ink-muted">
                Clique para adicionar vértices; depois salve.
              </p>
            )}
          </>
        )}
      </div>
      {status && <p className="text-sm text-[var(--color-status-danger)]">{status}</p>}
    </div>
  );
}
