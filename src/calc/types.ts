export type ColumnPosition = "interno" | "borda" | "canto";

/** Borda livre paralela a este eixo. No canto, as duas bordas livres são as de menor x e menor z. */
export type EdgeAxis = "x" | "z";

export type LoadMode = "calculo" | "caracteristico";

export type PunchingType = "estribos" | "studs";

export type ReportLevel = "resumido" | "completo";

export interface PunchingInput {
  /** Dimensão do pilar paralela a x, cm. */
  cx: number;
  /** Dimensão do pilar paralela a z, cm. */
  cz: number;
  position: ColumnPosition;
  /**
   * Borda: eixo ao qual a borda livre é paralela.
   * Paralela a x → borda corta o eixo z. Paralela a z → borda corta o eixo x.
   */
  edgeAxis: EdgeAxis;
  /** Distância da face do pilar à borda livre paralela a x (corta z), cm. */
  distZ: number;
  /** Distância da face do pilar à borda livre paralela a z (corta x), cm. */
  distX: number;
  /** Espessura da laje, cm. */
  h: number;
  /** MPa. */
  fck: number;
  gammaC: number;
  /** cm. */
  cobrimento: number;
  /** MPa. */
  fyk: number;
  /** mm. */
  bitola: number;
  /** cm²/m, armadura paralela a x (camada externa). */
  asx: number;
  /** cm²/m, armadura paralela a z (camada interna). */
  asz: number;
  punchingOn: boolean;
  punchingType: PunchingType;
  /** cm² num contorno completo paralelo a C'. */
  asw: number;
  /** cm. */
  sr: number;
  /** Graus, em relação ao plano da laje. */
  angulo: number;
  nLinhas: number;
  /** cm, face do pilar até a primeira linha. */
  s0: number;
  /** mm, diâmetro da armadura de punção (limite φ ≤ h/20 para estribos). */
  bitolaW: number;
  loadMode: LoadMode;
  /** kN, quando loadMode = calculo. */
  fSd: number;
  /** kN·m, momento em torno de x (excentricidade em z). */
  mSdx: number;
  /** kN·m, momento em torno de z (excentricidade em x). */
  mSdz: number;
  /** kN. */
  fK: number;
  /** kN·m. */
  mKx: number;
  /** kN·m. */
  mKz: number;
  gammaF: number;
  bothSigns: boolean;
  uniformOn: boolean;
  /**
   * kN/m². No modo de cálculo é qSd; no modo característico é qk, majorado por γf.
   */
  q: number;
  reportLevel: ReportLevel;
}

export interface Pt {
  x: number;
  z: number;
}

export interface WarningItem {
  severity: "aviso" | "erro";
  text: string;
}

export interface CheckItem {
  id: string;
  title: string;
  demand: number;
  capacity: number;
  unit: string;
  pass: boolean;
  note?: string;
}

export interface ReportBlock {
  heading: string;
  /** Mostrado também no relatório resumido. */
  summary: boolean;
  lines: ReportLine[];
}

export interface ReportLine {
  label: string;
  formula?: string;
  substitution?: string;
  value?: string;
}

export interface PunchingResult {
  ok: boolean;
  error?: string;
  input: PunchingInput;
  d: number;
  dx: number;
  dz: number;
  phi: number;
  rhoX: number;
  rhoZ: number;
  rho: number;
  rhoUsed: number;
  k: number;
  fcd: number;
  alphaV: number;
  fywd: number;
  fyd: number;
  fSdInput: number;
  mSdxInput: number;
  mSdzInput: number;
  qSd: number;
  uniformApplied: boolean;
  u0: number;
  u: number;
  uStar: number;
  uOut: number | null;
  areaC: number;
  areaCp: number;
  areaOut: number | null;
  fAtC: number;
  fAtCp: number;
  fAtOut: number | null;
  tauSdC: number;
  tauSdCp: number;
  tauSdOut: number | null;
  tauRd1: number;
  tauRd2: number;
  tauRd3: number | null;
  tauConcrete3: number;
  passesCompression: boolean;
  passesPunching: boolean;
  passesOuter: boolean | null;
  passesDetailing: boolean;
  overallPass: boolean;
  reinforcementRequired: boolean;
  /** cm²/cm, para studs ou estribos de referência, α informado ou 90°. */
  aswOverSr: number | null;
  aswAtSrMax: number | null;
  srMax: number;
  s0Max: number;
  suggestedLines: number | null;
  suggestedP: number | null;
  p: number | null;
  governing: {
    mSdx: number;
    mSdz: number;
    label: string;
  };
  kRatioX: number | null;
  kRatioZ: number | null;
  kX: number | null;
  kZ: number | null;
  wpX: number | null;
  wpZ: number | null;
  eStarX: number | null;
  eStarZ: number | null;
  mStarX: number | null;
  mStarZ: number | null;
  checks: CheckItem[];
  warnings: WarningItem[];
  blocks: ReportBlock[];
  draw: DrawModel | null;
}

export interface DrawModel {
  column: { x0: number; x1: number; z0: number; z1: number };
  slab: { x0: number; x1: number; z0: number; z1: number };
  /** Perímetro geométrico de C', cm, z para cima. */
  perimeter: Pt[];
  perimeterClosed: boolean;
  /** C'' quando há armadura. */
  outer: Pt[] | null;
  outerClosed: boolean;
  /** Linhas de armadura (polilinhas abertas ou fechadas). */
  reinforcement: Pt[][];
  freeEdges: Array<"minX" | "minZ">;
  cx: number;
  cz: number;
  d: number;
  h: number;
  twoD: number;
}
