/**
 * AutoCAD $INSUNITS → meters conversion.
 * @see https://help.autodesk.com/view/OARX/2024/ENU/?guid=GUID-A809CD89-C4D6-4C0A-A50A-6F2A5C5A5E5E
 */
export const INSUNITS_TO_METERS: Record<number, { label: string; toMeters: number }> = {
  0: { label: "unitless", toMeters: 1 }, // treat as meters with warning
  1: { label: "inches", toMeters: 0.0254 },
  2: { label: "feet", toMeters: 0.3048 },
  3: { label: "miles", toMeters: 1609.344 },
  4: { label: "millimeters", toMeters: 0.001 },
  5: { label: "centimeters", toMeters: 0.01 },
  6: { label: "meters", toMeters: 1 },
  7: { label: "kilometers", toMeters: 1000 },
  8: { label: "microinches", toMeters: 2.54e-8 },
  9: { label: "mils", toMeters: 2.54e-5 },
  10: { label: "yards", toMeters: 0.9144 },
  11: { label: "angstroms", toMeters: 1e-10 },
  12: { label: "nanometers", toMeters: 1e-9 },
  13: { label: "microns", toMeters: 1e-6 },
  14: { label: "decimeters", toMeters: 0.1 },
  15: { label: "decameters", toMeters: 10 },
  16: { label: "hectometers", toMeters: 100 },
  17: { label: "gigameters", toMeters: 1e9 },
  18: { label: "astronomical units", toMeters: 1.495978707e11 },
  19: { label: "light years", toMeters: 9.4607304725808e15 },
  20: { label: "parsecs", toMeters: 3.0856775814913673e16 },
};

export type UnitResolution = {
  insunits: number | null;
  label: string;
  toMeters: number;
  warnings: string[];
};

export function resolveInsunits(insunits: number | null | undefined): UnitResolution {
  const warnings: string[] = [];
  if (insunits == null || !Number.isFinite(insunits)) {
    warnings.push(
      "INSUNITS ausente: assumindo metros (1:1). Valide a unidade antes de calcular volumes.",
    );
    return { insunits: null, label: "assumed_meters", toMeters: 1, warnings };
  }
  const code = Math.trunc(insunits);
  const known = INSUNITS_TO_METERS[code];
  if (!known) {
    warnings.push(
      `INSUNITS=${code} desconhecido: assumindo metros. Não inventamos fator de conversão.`,
    );
    return { insunits: code, label: "unknown", toMeters: 1, warnings };
  }
  if (code === 0) {
    warnings.push(
      "INSUNITS=0 (sem unidade): tratando valores como metros. Confirme no CAD de origem.",
    );
  }
  return {
    insunits: code,
    label: known.label,
    toMeters: known.toMeters,
    warnings,
  };
}
