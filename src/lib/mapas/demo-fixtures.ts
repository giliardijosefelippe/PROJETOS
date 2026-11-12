/**
 * Offline demo fixtures for MapaConcreto — acceptance numbers locked.
 * Used by unit tests and documented in seed:mapas (no invented volumes).
 */

export const DEMO_SITE_CODE = "DEMO-MC-001";
export const DEMO_BUILDING_CODE = "T-DEMO";
export const DEMO_FLOOR_LEVEL = 1;
export const DEMO_DRAWING_FILE = "mapaconcreto-demo.pdf";
export const DEMO_REVISION = "R00";

export function demoAcceptancePlan() {
  const slab = {
    code: "LJ-DEMO-40",
    areaM2: 40,
    thicknessM: 0.15,
    volumeTeoricoM3: 6,
  };
  const regionA = {
    name: "Região demo A 25 m²",
    areaM2: 25,
    intersectionM2: 25,
    percent: 62.5,
    volumeEstimadoM3: 3.75,
  };
  const regionB = {
    name: "Região demo B (sobrepõe A)",
    areaM2: 25,
  };
  const unionAreaM2 = 40;
  return {
    slab,
    regionA,
    regionB,
    unionAreaM2,
    acceptance: {
      percent: (regionA.intersectionM2 / slab.areaM2) * 100,
      volumeM3: regionA.intersectionM2 * slab.thicknessM,
    },
    idempotentKeys: {
      site: DEMO_SITE_CODE,
      building: DEMO_BUILDING_CODE,
      floorLevel: DEMO_FLOOR_LEVEL,
      drawing: `${DEMO_REVISION}/${DEMO_DRAWING_FILE}`,
      elements: ["LJ-DEMO-40", "P-DEMO-01", "VG-DEMO-01"],
      pours: ["C-DEMO-01", "C-DEMO-02"],
      nfs: ["NF-DEMO-1001", "NF-DEMO-1002"],
    },
  };
}
