/**
 * MapaConcreto — demo estático (localStorage).
 * Dados marcados como demonstração. Não inventa volumes fora do caso de aceite.
 */
(function (global) {
  const KEY = "mapaconcreto_demo_v1";

  const DEFAULT = {
    isDemo: true,
    label: "DEMONSTRAÇÃO — não é obra real",
    site: {
      code: "DEMO-MC-001",
      name: "Obra Demonstração MapaConcreto",
    },
    slab: {
      code: "LJ-DEMO-40",
      widthM: 8,
      heightM: 5,
      areaM2: 40,
      thicknessM: 0.15,
      volumeTeoricoM3: 6,
    },
    scale: {
      calibrated: true,
      // 200 px = 5 m → 0.025 m/px (barra demo)
      p1: [90, 300],
      p2: [290, 300],
      realM: 5,
      metersPerPx: 0.025,
    },
    region: {
      // 5×5 m = 25 m² no canto da laje 8×5
      tool: "rectangle",
      ringM: [
        [0, 0],
        [5, 0],
        [5, 5],
        [0, 5],
        [0, 0],
      ],
      areaM2: 25,
    },
    pour: {
      code: "C-DEMO-01",
      title: "Concretagem demonstração — 1ª etapa",
      nf: "NF-DEMO-1001",
      plate: "DEM0A00",
      volumeNfM3: 4,
      volumeReturnedM3: 0.2,
      volumeAllocatedM3: 3.8,
      slumpMeasuredMm: 95,
      slumpSpecMm: 100,
      slumpToleranceMm: 10,
    },
  };

  function clone(v) {
    return JSON.parse(JSON.stringify(v));
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return clone(DEFAULT);
      const parsed = JSON.parse(raw);
      return Object.assign(clone(DEFAULT), parsed, { isDemo: true });
    } catch {
      return clone(DEFAULT);
    }
  }

  function save(state) {
    const next = Object.assign({}, state, { isDemo: true });
    localStorage.setItem(KEY, JSON.stringify(next));
    return next;
  }

  function reset() {
    localStorage.removeItem(KEY);
    return clone(DEFAULT);
  }

  /** Aceite §12.4: área ∩ espessura — sem inventar. */
  function mappedFromRegion(slab, regionAreaM2) {
    if (
      slab == null ||
      regionAreaM2 == null ||
      !Number.isFinite(regionAreaM2) ||
      !Number.isFinite(slab.areaM2) ||
      slab.areaM2 <= 0
    ) {
      return { percent: null, volumeEstimadoM3: null, indeterminate: true };
    }
    const intersection = Math.min(regionAreaM2, slab.areaM2);
    const percent = (intersection / slab.areaM2) * 100;
    const volumeEstimadoM3 =
      slab.thicknessM != null && Number.isFinite(slab.thicknessM)
        ? intersection * slab.thicknessM
        : null;
    return {
      intersectionM2: intersection,
      percent,
      volumeEstimadoM3,
      indeterminate: volumeEstimadoM3 == null,
    };
  }

  function polygonArea(ring) {
    if (!ring || ring.length < 3) return 0;
    let sum = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    }
    return Math.abs(sum) / 2;
  }

  function metersPerPx(p1, p2, realM) {
    if (!p1 || !p2 || !(realM > 0)) return null;
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const dist = Math.hypot(dx, dy);
    if (dist < 1e-9) return null;
    return realM / dist;
  }

  function compareVolumes(args) {
    const teorico = Number(args.volumeTeoricoM3) || 0;
    const mapeado = Number(args.volumeEstimadoMapeadoM3) || 0;
    const nf = Number(args.volumeNfM3) || 0;
    const alocado = Number(args.volumeAlocadoM3) || 0;
    const devolvido = Number(args.volumeDevolvidoM3) || 0;
    const diferencaNfTeorico = nf - teorico;
    return {
      teorico,
      mapeado,
      nf,
      alocado,
      devolvido,
      diferencaNfTeorico,
      saldoCarga: nf - alocado - devolvido,
      labels: {
        diferencaNfTeorico:
          "Diferença NF − teórico (métricas distintas — não classificada como desperdício).",
        note: "Sobras/devoluções são destinos explícitos. NF ≠ desperdício automático.",
      },
    };
  }

  function setCurrentNav() {
    const page = document.body.getAttribute("data-page");
    if (!page) return;
    document.querySelectorAll(".nav a[data-nav]").forEach((a) => {
      if (a.getAttribute("data-nav") === page) {
        a.setAttribute("aria-current", "page");
      }
    });
  }

  global.McDemo = {
    KEY,
    DEFAULT,
    load,
    save,
    reset,
    mappedFromRegion,
    polygonArea,
    metersPerPx,
    compareVolumes,
    setCurrentNav,
  };
})(window);
