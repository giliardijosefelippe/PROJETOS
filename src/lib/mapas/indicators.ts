/**
 * Site/floor/period indicator aggregation (Fase 4).
 * Differences NF−teórico are NOT labeled as waste.
 */
import { compareVolumes, type VolumeCompareResult } from "./geometry";
import type { McPourStatus } from "./types";

export type IndicatorPour = {
  id: string;
  code: string;
  status: McPourStatus;
  floorId: string | null;
  pourDate: string | null;
  volumePlannedM3: number | null;
};

export type IndicatorDelivery = {
  pourId: string | null;
  volumeNfM3: number;
  volumeReturnedM3: number;
  volumeOtherM3: number;
  allocatedM3: number;
  hasNonCompliantSlump?: boolean;
};

export type IndicatorOccurrence = {
  id: string;
  status: string;
  severity: string;
  dueDate: string | null;
  title: string;
};

export type IndicatorDrawing = {
  id: string;
  metersPerPdfUnit: number | null;
  sourceKind: string;
  supersedesRevisionId?: string | null;
};

export type Pendencia = {
  code: string;
  severity: "info" | "warn" | "danger";
  message: string;
  href?: string;
};

export type SiteIndicators = {
  volumeTeoricoM3: number;
  volumeEstimadoMapeadoM3: number;
  volumeNfM3: number;
  volumeAlocadoM3: number;
  volumeDevolvidoM3: number;
  volumeOutrosDestinosM3: number;
  volumePlanejadoPoursM3: number;
  compare: VolumeCompareResult;
  coverageRatio: number | null;
  poursByStatus: Record<string, number>;
  openOccurrences: number;
  overdueOccurrences: number;
  pendencias: Pendencia[];
  period: { from: string | null; to: string | null };
  floorId: string | null;
  notes: string[];
};

function inPeriod(
  date: string | null | undefined,
  from: string | null,
  to: string | null,
): boolean {
  if (!from && !to) return true;
  if (!date) return false;
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

export function computeSiteIndicators(args: {
  siteId: string;
  floorId?: string | null;
  periodFrom?: string | null;
  periodTo?: string | null;
  volumeTeoricoM3: number;
  volumeEstimadoMapeadoM3: number;
  pours: IndicatorPour[];
  deliveries: IndicatorDelivery[];
  occurrences: IndicatorOccurrence[];
  drawings: IndicatorDrawing[];
  today?: string;
}): SiteIndicators {
  const floorId = args.floorId || null;
  const from = args.periodFrom || null;
  const to = args.periodTo || null;
  const today = args.today || new Date().toISOString().slice(0, 10);

  const pours = args.pours.filter((p) => {
    if (floorId && p.floorId !== floorId) return false;
    return inPeriod(p.pourDate, from, to);
  });
  const pourIds = new Set(pours.map((p) => p.id));

  const deliveries = args.deliveries.filter((d) => {
    if (!d.pourId) {
      // site-level delivery without pour: include only when no floor filter
      return !floorId && !from && !to;
    }
    return pourIds.has(d.pourId);
  });

  const volumeNfM3 = deliveries.reduce((s, d) => s + d.volumeNfM3, 0);
  const volumeAlocadoM3 = deliveries.reduce((s, d) => s + d.allocatedM3, 0);
  const volumeDevolvidoM3 = deliveries.reduce((s, d) => s + d.volumeReturnedM3, 0);
  const volumeOutrosDestinosM3 = deliveries.reduce(
    (s, d) => s + d.volumeOtherM3,
    0,
  );
  const volumePlanejadoPoursM3 = pours.reduce(
    (s, p) => s + Number(p.volumePlannedM3 || 0),
    0,
  );

  const compare = compareVolumes({
    volumeTeoricoM3: args.volumeTeoricoM3,
    volumeEstimadoMapeadoM3: args.volumeEstimadoMapeadoM3,
    volumeNfM3,
    volumeAlocadoM3,
    volumeDevolvidoM3,
    volumeOutrosDestinosM3,
  });

  const coverageRatio =
    args.volumeTeoricoM3 > 0
      ? args.volumeEstimadoMapeadoM3 / args.volumeTeoricoM3
      : null;

  const poursByStatus: Record<string, number> = {};
  for (const p of pours) {
    poursByStatus[p.status] = (poursByStatus[p.status] || 0) + 1;
  }

  const openOcc = args.occurrences.filter(
    (o) => o.status === "aberta" || o.status === "em_andamento" || o.status === "aguardando",
  );
  const overdue = openOcc.filter((o) => o.dueDate && o.dueDate < today);

  const pendencias: Pendencia[] = [];

  for (const p of pours) {
    if (p.status === "em_execucao" || p.status === "planejada") {
      const hasDel = deliveries.some((d) => d.pourId === p.id);
      if (!hasDel) {
        pendencias.push({
          code: "pour_sem_nf",
          severity: "warn",
          message: `Concretagem ${p.code} sem NF/carga registrada.`,
          href: `/mapas/${args.siteId}/concretagens/${p.id}`,
        });
      }
    }
  }

  for (const d of deliveries) {
    if (d.hasNonCompliantSlump) {
      pendencias.push({
        code: "slump_nc",
        severity: "danger",
        message: "Há Slump fora de critério nesta obra/período.",
        href: d.pourId
          ? `/mapas/${args.siteId}/concretagens/${d.pourId}`
          : `/mapas/${args.siteId}/concretagens`,
      });
    }
    const available = d.volumeNfM3 - d.volumeReturnedM3 - d.volumeOtherM3;
    if (available - d.allocatedM3 > 0.05) {
      pendencias.push({
        code: "saldo_nao_alocado",
        severity: "info",
        message: `Saldo de carga não alocado (~${(available - d.allocatedM3).toFixed(2)} m³). Não é desperdício automático.`,
        href: d.pourId
          ? `/mapas/${args.siteId}/concretagens/${d.pourId}`
          : `/mapas/${args.siteId}/rastreio`,
      });
    }
  }

  for (const o of overdue) {
    pendencias.push({
      code: "ocorrencia_atrasada",
      severity: "danger",
      message: `Ocorrência atrasada: ${o.title}`,
      href: `/mapas/${args.siteId}/campo`,
    });
  }

  for (const o of openOcc) {
    if (o.severity === "critica" || o.severity === "alta") {
      pendencias.push({
        code: "ocorrencia_aberta",
        severity: o.severity === "critica" ? "danger" : "warn",
        message: `Ocorrência ${o.severity}: ${o.title}`,
        href: `/mapas/${args.siteId}/campo`,
      });
    }
  }

  for (const d of args.drawings) {
    if (
      (d.sourceKind === "pdf" || d.sourceKind === "dwg") &&
      (d.metersPerPdfUnit == null || Number(d.metersPerPdfUnit) <= 0)
    ) {
      pendencias.push({
        code: "escala_pendente",
        severity: "warn",
        message: "Há planta com escala não calibrada.",
        href: `/mapas/${args.siteId}/planta/${d.id}`,
      });
    }
  }

  // Deduplicate similar codes keeping first
  const seen = new Set<string>();
  const unique = pendencias.filter((p) => {
    const key = `${p.code}:${p.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    volumeTeoricoM3: args.volumeTeoricoM3,
    volumeEstimadoMapeadoM3: args.volumeEstimadoMapeadoM3,
    volumeNfM3,
    volumeAlocadoM3,
    volumeDevolvidoM3,
    volumeOutrosDestinosM3,
    volumePlanejadoPoursM3,
    compare,
    coverageRatio,
    poursByStatus,
    openOccurrences: openOcc.length,
    overdueOccurrences: overdue.length,
    pendencias: unique,
    period: { from, to },
    floorId,
    notes: [
      "Diferença NF − teórico não é classificada como desperdício.",
      "Cobertura = mapeado / teórico (quando teórico > 0).",
      "Filtros de período usam data da concretagem.",
    ],
  };
}
