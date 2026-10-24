/**
 * Medidas do detalhe da armadura de punção.
 * Gancho: NBR 6118:2023, item 9.4.6.1, preferência pelo gancho a 135°
 * para o interior, ponta reta 5φ e no mínimo 5 cm.
 * Pino de dobramento: Tabela 9.2, aço CA-50.
 * Estribo: item 20.4, φ ≤ h/20 e contato mecânico com a armadura longitudinal.
 * Stud: item 19.5.3.3, extremidades alargadas ancoradas fora do plano da flexão.
 */

export interface RebarDetail {
  phiMm: number;
  phiLimitMm: number;
  phiOk: boolean;
  /** cm. Altura externa do estribo, h − 2c. */
  heightCm: number;
  /** cm. Largura entre eixos dos ramos. Adoção de detalhe, não é limite da norma. */
  widthCm: number;
  /** cm. Ponta reta do gancho a 135°. */
  hookCm: number;
  /** mm. Diâmetro interno mínimo do pino, Tabela 9.2, CA-50. */
  bendMm: number;
  /** cm. Comprimento do fuste do stud entre as cabeças. */
  studLengthCm: number;
  heightOk: boolean;
}

export function bendPinMm(phiMm: number): number {
  if (phiMm <= 10) return 3 * phiMm;
  if (phiMm < 20) return 5 * phiMm;
  return 8 * phiMm;
}

export function rebarDetail(opts: {
  hCm: number;
  coverCm: number;
  phiMm: number;
  /** cm. Teto tangencial 0,75d, usado só para a largura caber entre peças vizinhas. */
  stMaxCm: number;
}): RebarDetail {
  const { hCm, coverCm, phiMm, stMaxCm } = opts;
  const phiCm = Math.max(phiMm, 0) / 10;
  const heightCm = hCm - 2 * coverCm;
  const hookCm = Math.max(5, 5 * phiCm);
  const room = stMaxCm > 0 ? 0.55 * stMaxCm : 10;
  const widthCm = Math.max(Math.min(room, 12), Math.min(6, Math.max(room, 4)));
  return {
    phiMm,
    phiLimitMm: (hCm / 20) * 10,
    phiOk: phiMm <= (hCm / 20) * 10 + 1e-9,
    heightCm,
    widthCm,
    hookCm,
    bendMm: bendPinMm(phiMm),
    studLengthCm: heightCm,
    heightOk: heightCm > 4,
  };
}
